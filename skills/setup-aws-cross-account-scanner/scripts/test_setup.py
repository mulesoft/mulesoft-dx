import argparse
import contextlib
import io
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import setup


class ProvisioningTests(unittest.TestCase):
    def teardown_args(self, *extra):
        return setup.parser().parse_args(['teardown', '--region', 'us-east-1', '--name', 'test-set',
            '--administrator-account', '111111111111', '--permission-model', 'SELF_MANAGED',
            '--accounts', '222222222222', *extra])

    def stack_args(self, *extra):
        return setup.parser().parse_args(['teardown-stack', '--region', 'us-east-1', '--name', 'test-stack',
            '--account', '111111111111', '--kind', 'hub', *extra])

    def test_teardown_stackset_preview_never_mutates(self):
        args = self.teardown_args()
        template = json.loads((Path(__file__).parent / 'spoke-role.json').read_text())
        class Fake:
            def __init__(self): self.args = args; self.calls = []
            def check_account(self, account): self.calls.append(('identity', account))
            def run(self, *cmd, **kw):
                self.calls.append(cmd)
                if 'describe-stack-set' in cmd: return {'StackSet': {'StackSetId': 'test-set:id', 'PermissionModel': 'SELF_MANAGED', 'TemplateBody': json.dumps(template)}}
                if 'list-stack-set-operations' in cmd: return {'Summaries': []}
                if 'list-stack-instances' in cmd: return {'Summaries': [{'Account': '222222222222', 'Region': 'us-east-1'}]}
                raise AssertionError('Unexpected mutation: ' + str(cmd))
        fake = Fake()
        with contextlib.redirect_stdout(io.StringIO()) as out: setup.teardown_stackset(fake)
        self.assertIn('Preview only', out.getvalue())
        self.assertTrue(all('delete-stack' not in ' '.join(c) for c in fake.calls))

    def test_teardown_stackset_refuses_changed_scope_or_unknown_template(self):
        args = self.teardown_args('--confirm-delete')
        template = json.loads((Path(__file__).parent / 'spoke-role.json').read_text())
        class Fake:
            def __init__(self, body, account): self.args = args; self.body = body; self.account = account
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                if 'describe-stack-set' in cmd: return {'StackSet': {'StackSetId': 'test-set:id', 'PermissionModel': 'SELF_MANAGED', 'TemplateBody': self.body}}
                if 'list-stack-set-operations' in cmd: return {'Summaries': []}
                if 'list-stack-instances' in cmd: return {'Summaries': [{'Account': self.account, 'Region': 'us-east-1'}]}
                raise AssertionError('Unexpected mutation')
        with self.assertRaisesRegex(setup.AwsError, 'Template does not match'):
            setup.teardown_stackset(Fake('{}', '222222222222'))
        args.name = 'test-set'
        with self.assertRaisesRegex(setup.AwsError, '--accounts must match'):
            setup.teardown_stackset(Fake(json.dumps(template), '333333333333'))

    def test_teardown_waits_for_instance_removal_before_deleting_stackset(self):
        args = self.teardown_args('--confirm-delete')
        template = (Path(__file__).parent / 'spoke-role.json').read_text()
        class Fake:
            def __init__(self): self.args = args; self.calls = []; self.removed = False
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                self.calls.append(cmd)
                if 'describe-stack-set' in cmd: return {'StackSet': {'StackSetId': 'test-set:id', 'PermissionModel': 'SELF_MANAGED', 'TemplateBody': template}}
                if 'list-stack-set-operations' in cmd: return {'Summaries': []}
                if 'list-stack-instances' in cmd: return {'Summaries': [] if self.removed else [{'Account': '222222222222', 'Region': 'us-east-1'}]}
                if 'delete-stack-instances' in cmd: return {'OperationId': 'op'}
                if 'describe-stack-set-operation' in cmd: return {'StackSetOperation': {'Status': 'SUCCEEDED'}}
                if 'list-stack-set-operation-results' in cmd: self.removed = True; return {'Summaries': [{'Account': '222222222222', 'Status': 'SUCCEEDED'}]}
                if 'delete-stack-set' in cmd: return {}
                raise AssertionError('Unexpected call: ' + str(cmd))
        fake = Fake()
        with contextlib.redirect_stdout(io.StringIO()): setup.teardown_stackset(fake)
        calls = [' '.join(c) for c in fake.calls]
        self.assertLess(next(i for i,c in enumerate(calls) if 'delete-stack-instances' in c), next(i for i,c in enumerate(calls) if 'delete-stack-set' in c))
        self.assertTrue(all('test-set:id' in c for c in calls[1:]))

    def test_teardown_stack_preview_and_bootstrap_guard(self):
        args = self.stack_args()
        template = (Path(__file__).parent / 'hub-role.json').read_text()
        class Fake:
            def __init__(self): self.args = args; self.calls = []
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                self.calls.append(cmd)
                if 'describe-stacks' in cmd: return {'Stacks': [{'StackId': 'immutable-id', 'StackStatus': 'CREATE_COMPLETE'}]}
                if 'get-template' in cmd: return {'TemplateBody': template}
                raise AssertionError('Unexpected deletion')
        fake = Fake()
        with contextlib.redirect_stdout(io.StringIO()) as out: setup.teardown_stack(fake)
        self.assertIn('Preview only', out.getvalue())
        args.confirm_delete = True
        args.kind = 'bootstrap-admin'
        template = (Path(__file__).parent / 'stackset-administration-role.json').read_text()
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(setup.AwsError, 'confirm-unused'):
            setup.teardown_stack(fake)

    def test_auto_teardown_disables_enrollment_before_instance_delete(self):
        args = setup.parser().parse_args(['teardown', '--region', 'us-east-1', '--name', 'test-set',
            '--administrator-account', '111111111111', '--permission-model', 'SERVICE_MANAGED',
            '--ous', 'r-abcd', '--accounts', '222222222222', '--confirm-delete'])
        template = (Path(__file__).parent / 'spoke-role.json').read_text()
        class Fake:
            def __init__(self): self.args = args; self.calls = []; self.removed = False
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                self.calls.append(cmd)
                if 'describe-stack-set' in cmd: return {'StackSet': {'StackSetId': 'test-set:id', 'PermissionModel': 'SERVICE_MANAGED', 'TemplateBody': template, 'OrganizationalUnitIds': ['r-abcd'], 'AutoDeployment': {'Enabled': True}}}
                if 'list-stack-set-operations' in cmd: return {'Summaries': []}
                if 'list-stack-instances' in cmd: return {'Summaries': [] if self.removed else [{'Account': '222222222222', 'Region': 'us-east-1'}]}
                if 'update-stack-set' in cmd: return {'OperationId': 'disable'}
                if 'delete-stack-instances' in cmd: return {'OperationId': 'remove'}
                if 'describe-stack-set-operation' in cmd: return {'StackSetOperation': {'Status': 'SUCCEEDED'}}
                if 'list-stack-set-operation-results' in cmd:
                    if 'remove' in cmd: self.removed = True
                    return {'Summaries': []}
                if 'delete-stack-set' in cmd: return {}
                raise AssertionError('Unexpected call: ' + str(cmd))
        fake = Fake()
        with contextlib.redirect_stdout(io.StringIO()): setup.teardown_stackset(fake)
        calls = [' '.join(c) for c in fake.calls]
        self.assertLess(next(i for i,c in enumerate(calls) if 'update-stack-set' in c), next(i for i,c in enumerate(calls) if 'delete-stack-instances' in c))

    def test_teardown_refuses_in_progress_operations(self):
        args = self.teardown_args('--confirm-delete')
        class Fake:
            def __init__(self): self.args = args
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                if 'describe-stack-set' in cmd: return {'StackSet': {'StackSetId': 'test-set:id', 'PermissionModel': 'SELF_MANAGED', 'TemplateBody': (Path(__file__).parent / 'spoke-role.json').read_text()}}
                if 'list-stack-set-operations' in cmd: return {'Summaries': [{'Status': 'RUNNING'}]}
                raise AssertionError('Unexpected mutation')
        with self.assertRaisesRegex(setup.AwsError, 'operation in progress'):
            setup.teardown_stackset(Fake())

    def test_teardown_stops_on_failed_instance(self):
        args = self.teardown_args('--confirm-delete')
        class Fake:
            def __init__(self): self.args = args; self.calls = []
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                self.calls.append(cmd)
                if 'describe-stack-set' in cmd: return {'StackSet': {'StackSetId': 'test-set:id', 'PermissionModel': 'SELF_MANAGED', 'TemplateBody': (Path(__file__).parent / 'spoke-role.json').read_text()}}
                if 'list-stack-set-operations' in cmd: return {'Summaries': []}
                if 'list-stack-instances' in cmd: return {'Summaries': [{'Account': '222222222222', 'Region': 'us-east-1'}]}
                if 'delete-stack-instances' in cmd: return {'OperationId': 'op'}
                if 'describe-stack-set-operation' in cmd: return {'StackSetOperation': {'Status': 'FAILED'}}
                if 'list-stack-set-operation-results' in cmd: return {'Summaries': [{'Account': '222222222222', 'Status': 'FAILED'}]}
                raise AssertionError('Unexpected call: ' + str(cmd))
        fake = Fake()
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(setup.AwsError, 'ended FAILED'):
            setup.teardown_stackset(fake)
        self.assertFalse(any('delete-stack-set' in c for c in fake.calls))

    def test_teardown_stops_if_account_appears_after_disabling_auto_enrollment(self):
        args = setup.parser().parse_args(['teardown', '--region', 'us-east-1', '--name', 'test-set',
            '--administrator-account', '111111111111', '--permission-model', 'SERVICE_MANAGED',
            '--ous', 'r-abcd', '--accounts', '222222222222', '--confirm-delete'])
        class Fake:
            def __init__(self): self.args = args; self.calls = []; self.checked = 0
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                self.calls.append(cmd)
                if 'describe-stack-set' in cmd: return {'StackSet': {'StackSetId': 'test-set:id', 'PermissionModel': 'SERVICE_MANAGED', 'TemplateBody': (Path(__file__).parent / 'spoke-role.json').read_text(), 'OrganizationalUnitIds': ['r-abcd'], 'AutoDeployment': {'Enabled': True}}}
                if 'list-stack-set-operations' in cmd: return {'Summaries': []}
                if 'list-stack-instances' in cmd:
                    self.checked += 1
                    accounts = ['222222222222'] if self.checked == 1 else ['222222222222', '333333333333']
                    return {'Summaries': [{'Account': a, 'Region': 'us-east-1'} for a in accounts]}
                if 'update-stack-set' in cmd: return {'OperationId': 'disable'}
                if 'describe-stack-set-operation' in cmd: return {'StackSetOperation': {'Status': 'SUCCEEDED'}}
                if 'list-stack-set-operation-results' in cmd: return {'Summaries': []}
                raise AssertionError('Unexpected mutation: ' + str(cmd))
        fake = Fake()
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(setup.AwsError, '--accounts must match'):
            setup.teardown_stackset(fake)
        self.assertFalse(any('delete-stack-instances' in c or 'delete-stack-set' in c for c in fake.calls))

    def test_teardown_stack_refuses_stackset_managed_stack(self):
        args = self.stack_args('--confirm-delete')
        class Fake:
            def __init__(self): self.args = args
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                if 'describe-stacks' in cmd: return {'Stacks': [{'StackId': 'id', 'StackName': 'StackSet-test-set-123', 'StackStatus': 'CREATE_COMPLETE'}]}
                raise AssertionError('Unexpected mutation')
        with self.assertRaisesRegex(setup.AwsError, 'StackSet-managed'):
            setup.teardown_stack(Fake())
    def test_no_command_explains_setup_and_validate(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(0, setup.main([]))
        self.assertIn('Getting started:', output.getvalue())
        self.assertIn('does not run a scan', output.getvalue())
        self.assertIn('bootstrap-execution', output.getvalue())

    def base(self, *extra):
        return setup.parser().parse_args(['stackset', '--region', 'us-east-1', '--hub-account', '111111111111',
            '--administrator-account', '111111111111', '--accounts', '111111111111,222222222222',
            '--external-id', 'test-id', '--scanners', 'agentcore-mcp,api-gateway',
            '--permission-model', 'SELF_MANAGED', *extra])

    def test_scanner_selection_and_role_trust(self):
        args = self.base()
        params = setup.spoke_parameters(args)
        self.assertEqual('false', params['EnableBedrock'])
        self.assertEqual('false', params['EnableAgentCore'])
        self.assertEqual('true', params['EnableAgentCoreMcp'])
        self.assertEqual('true', params['EnableApiGateway'])
        template = json.loads((Path(__file__).parent / 'spoke-role.json').read_text())
        trust = template['Resources']['SpokeRole']['Properties']['AssumeRolePolicyDocument']['Statement'][0]
        self.assertEqual({'Ref': 'ExternalId'}, trust['Condition']['StringEquals']['sts:ExternalId'])
        self.assertEqual({'Ref': 'HubRoleArn'}, trust['Principal']['AWS'])
        self.assertTrue(all(template['Resources'][name + 'Policy']['Condition'] == name for name in setup.SCANNERS.values()))

    def test_auto_hub_scopes_assumption_to_organization_and_role(self):
        template = json.loads((Path(__file__).parent / 'hub-role.json').read_text())
        statement = template['Resources']['HubRole']['Properties']['Policies'][0]['PolicyDocument']['Statement'][0]
        condition = statement['Condition']['Fn::If'][1]['StringEquals']
        self.assertEqual({'Ref': 'OrganizationId'}, condition['aws:ResourceOrgID'])
        self.assertEqual({'Ref': 'ExternalId'}, condition['sts:ExternalId'])
        self.assertEqual('arn:${AWS::Partition}:iam::*:role/${SpokeRoleName}', statement['Resource']['Fn::If'][1]['Fn::Sub'])
        self.assertEqual({'Ref': 'SpokeRoleArns'}, statement['Resource']['Fn::If'][2])

    def auto_stackset_args(self):
        return setup.parser().parse_args(['stackset', '--region', 'us-east-1', '--hub-account', '111111111111',
            '--administrator-account', '111111111111', '--external-id', 'test-id', '--scanners', 'bedrock',
            '--permission-model', 'SERVICE_MANAGED', '--ous', 'r-abcd', '--auto-enroll'])

    def test_auto_stackset_targets_root_without_account_filter(self):
        args = self.auto_stackset_args()
        targets = setup.target_arguments(args, [])
        self.assertEqual({'OrganizationalUnitIds': ['r-abcd']}, json.loads(targets[1]))
        class Fake:
            def __init__(self): self.args = args; self.calls = []
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                self.calls.append(cmd)
                if 'describe-stack-set' in cmd: return None
                if 'create-stack-instances' in cmd: return {'OperationId': 'op'}
                if 'describe-stack-set-operation' in cmd: return {'StackSetOperation': {'Status': 'SUCCEEDED'}}
                if 'list-stack-set-operation-results' in cmd: return {'Summaries': []}
                if 'list-stack-instances' in cmd: return {'Summaries': [{'Account': '222222222222', 'Region': 'us-east-1', 'Status': 'CURRENT'}]}
                return {}
        fake = Fake()
        with contextlib.redirect_stdout(io.StringIO()): setup.stackset(fake)
        create = next(cmd for cmd in fake.calls if 'create-stack-set' in cmd)
        self.assertIn('Enabled=true,RetainStacksOnAccountRemoval=true', create)
        instance = next(cmd for cmd in fake.calls if 'create-stack-instances' in cmd)
        self.assertEqual({'OrganizationalUnitIds': ['r-abcd']}, json.loads(instance[instance.index('--deployment-targets') + 1]))

    def test_existing_stackset_enrollment_mode_cannot_change_implicitly(self):
        args = self.auto_stackset_args()
        class Fake:
            def __init__(self): self.args = args
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                if 'describe-stack-set' in cmd: return {'StackSet': {'PermissionModel': 'SERVICE_MANAGED', 'AutoDeployment': {'Enabled': False}}}
                raise AssertionError('Unexpected write')
        with self.assertRaisesRegex(setup.AwsError, 'different automatic enrollment mode'):
            setup.stackset(Fake())

    def test_existing_auto_stackset_cannot_change_root_or_retention(self):
        args = self.auto_stackset_args()
        class Fake:
            def __init__(self, retain, roots): self.args = args; self.retain = retain; self.roots = roots
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                if 'describe-stack-set' in cmd:
                    return {'StackSet': {'PermissionModel': 'SERVICE_MANAGED',
                        'AutoDeployment': {'Enabled': True, 'RetainStacksOnAccountRemoval': self.retain},
                        'OrganizationalUnitIds': self.roots}}
                raise AssertionError('Unexpected write')
        with self.assertRaisesRegex(setup.AwsError, 'review retention'):
            setup.stackset(Fake(False, ['r-abcd']))
        with self.assertRaisesRegex(setup.AwsError, 'does not target'):
            setup.stackset(Fake(True, ['r-other']))

    def test_existing_auto_stackset_updates_without_recreating_instances(self):
        args = self.auto_stackset_args()
        class Fake:
            def __init__(self): self.args = args; self.calls = []
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                self.calls.append(cmd)
                if 'describe-stack-set' in cmd:
                    return {'StackSet': {'PermissionModel': 'SERVICE_MANAGED',
                        'AutoDeployment': {'Enabled': True, 'RetainStacksOnAccountRemoval': True},
                        'OrganizationalUnitIds': ['r-abcd']}}
                if 'list-stack-instances' in cmd:
                    return {'Summaries': [{'Account': '222222222222', 'Region': 'us-east-1', 'Status': 'CURRENT'}]}
                if 'update-stack-set' in cmd: return {'OperationId': 'op'}
                if 'describe-stack-set-operation' in cmd: return {'StackSetOperation': {'Status': 'SUCCEEDED'}}
                if 'list-stack-set-operation-results' in cmd: return {'Summaries': []}
                raise AssertionError('Unexpected call: ' + str(cmd))
        fake = Fake()
        with contextlib.redirect_stdout(io.StringIO()): setup.stackset(fake)
        self.assertTrue(any('update-stack-set' in cmd for cmd in fake.calls))
        self.assertFalse(any('create-stack-instances' in cmd for cmd in fake.calls))

    def test_auto_stackset_requires_observable_instance(self):
        args = self.auto_stackset_args()
        class Fake:
            def __init__(self): self.args = args
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                if 'describe-stack-set' in cmd: return None
                if 'create-stack-instances' in cmd: return {'OperationId': 'op'}
                if 'describe-stack-set-operation' in cmd: return {'StackSetOperation': {'Status': 'SUCCEEDED'}}
                if 'list-stack-set-operation-results' in cmd: return {'Summaries': []}
                if 'list-stack-instances' in cmd: return {'Summaries': []}
                return {}
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaisesRegex(setup.AwsError, 'No StackSet instances'):
            setup.stackset(Fake())

    def test_auto_enroll_rejects_partial_scope_and_self_managed(self):
        hub = ['hub', '--dry-run', '--region', 'us-east-1', '--hub-account', '111111111111',
               '--external-id', 'test-id', '--scanner-principal-arn', 'arn:aws:iam::111111111111:user/test', '--auto-enroll']
        stack = ['stackset', '--dry-run', '--region', 'us-east-1', '--hub-account', '111111111111',
                 '--administrator-account', '111111111111', '--external-id', 'test-id', '--scanners', 'bedrock', '--auto-enroll']
        bad = [hub, hub + ['--organization-id', 'o-abcdefghij', '--accounts', '222222222222'],
               stack + ['--permission-model', 'SELF_MANAGED'],
               stack + ['--permission-model', 'SERVICE_MANAGED', '--ous', 'ou-abcd-12345678']]
        for argv in bad:
            with self.subTest(argv=argv), contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                setup.main(argv)

    def test_stackset_bootstrap_permissions_are_scoped_to_named_stackset(self):
        root = Path(__file__).parent
        admin = json.loads((root / 'stackset-administration-role.json').read_text())
        execution = json.loads((root / 'stackset-execution-role.json').read_text())
        trust = admin['Resources']['AdministrationRole']['Properties']['AssumeRolePolicyDocument']['Statement'][0]
        self.assertIn('stackset/${StackSetName}:*', trust['Condition']['ArnLike']['aws:SourceArn']['Fn::Sub'])
        policy = execution['Resources']['ExecutionRole']['Properties']['Policies'][0]['PolicyDocument']['Statement'][0]
        self.assertIn('stack/StackSet-${StackSetName}-*/*', policy['Resource']['Fn::Sub'])
        self.assertEqual({'cloudformation:CreateStack', 'cloudformation:UpdateStack',
                          'cloudformation:DeleteStack', 'cloudformation:DescribeStacks',
                          'cloudformation:DescribeStackEvents'}, set(policy['Action']))

    def test_bedrock_enrichment_can_read_data_sources(self):
        template = json.loads((Path(__file__).parent / 'spoke-role.json').read_text())
        policy = template['Resources']['BedrockPolicy']
        actions = policy['Properties']['PolicyDocument']['Statement'][0]['Action']
        self.assertEqual('Bedrock', policy['Condition'])
        self.assertIn('bedrock:ListDataSources', actions)
        self.assertIn('bedrock:GetDataSource', actions)

    def test_agentcore_and_mcp_independently_allow_runtime_invocation(self):
        template = json.loads((Path(__file__).parent / 'spoke-role.json').read_text())
        for name in ('AgentCore', 'AgentCoreMcp'):
            policy = template['Resources'][name + 'Policy']
            self.assertEqual(name, policy['Condition'])
            statements = policy['Properties']['PolicyDocument']['Statement']
            invoke = next(s for s in statements if 'bedrock-agentcore:InvokeAgentRuntime' in s['Action'])
            self.assertEqual('Allow', invoke['Effect'])
            self.assertEqual([{'Fn::Sub': 'arn:${AWS::Partition}:bedrock-agentcore:*:${AWS::AccountId}:runtime/*'}], invoke['Resource'])

    def test_existing_extra_accounts_fail_before_any_updates(self):
        args = self.base()
        class Fake:
            def __init__(self): self.args = args
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                if 'describe-stack-set' in cmd: return {'StackSet': {'PermissionModel': 'SELF_MANAGED'}}
                if 'list-stack-instances' in cmd: return {'Summaries': [{'Region': 'us-east-1', 'Account': '333333333333'}]}
                self.fail('Unexpected write')
        with self.assertRaisesRegex(setup.AwsError, 'not in --accounts'):
            setup.stackset(Fake())

    def test_existing_other_region_fails_before_update(self):
        args = self.base()
        class Fake:
            def __init__(self): self.args = args
            def check_account(self, account): pass
            def run(self, *cmd, **kw):
                if 'describe-stack-set' in cmd: return {'StackSet': {'PermissionModel': 'SELF_MANAGED'}}
                if 'list-stack-instances' in cmd: return {'Summaries': [{'Region': 'us-west-2', 'Account': '111111111111'}]}
                raise AssertionError('Unexpected write')
        with self.assertRaisesRegex(setup.AwsError, 'another region'):
            setup.stackset(Fake())

    def test_failed_account_fails_even_if_operation_succeeds(self):
        args = self.base()
        class Fake:
            def __init__(self): self.args = args
            def run(self, *cmd, **kw):
                if 'describe-stack-set-operation' in cmd: return {'StackSetOperation': {'Status': 'SUCCEEDED'}}
                return {'Summaries': [{'Account': '222222222222', 'Status': 'FAILED'}]}
        with contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(setup.AwsError, 'ended SUCCEEDED'):
                setup.wait_operation(Fake(), 'op')

    def test_invalid_selector_and_id_rejected(self):
        for func, value in [(setup.scanners, 'bedrock,nope'), (setup.accounts, '123'), (setup.external_id, 'bad id')]:
            with self.assertRaises(argparse.ArgumentTypeError): func(value)

    def test_dry_run_does_not_call_aws(self):
        with patch('subprocess.run', side_effect=AssertionError('AWS called')):
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(0, setup.main(['spoke', '--dry-run', '--region', 'us-east-1',
                    '--account', '111111111111', '--hub-account', '111111111111',
                    '--external-id', 'test-id', '--scanners', 'bedrock']))

    def test_missing_stackset_is_only_ignored_for_exact_error(self):
        args = self.base()
        fake = type('Result', (), {'returncode': 254, 'stderr': 'AccessDeniedException', 'stdout': ''})()
        with patch('subprocess.run', return_value=fake):
            with self.assertRaises(setup.AwsError):
                setup.Aws(args).run('cloudformation', 'describe-stack-set', missing='StackSetNotFoundException')


if __name__ == '__main__':
    unittest.main()
