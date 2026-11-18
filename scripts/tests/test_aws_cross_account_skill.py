"""Exercise the AWS skill as a portal download, independent of its checkout."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from zipfile import ZipFile

import pytest

from portal_generator.generator import _generate_skill_manifest
from portal_generator.parsers.skill_parser import parse_skill


REPO = Path(__file__).resolve().parents[2]
SKILL = REPO / 'skills' / 'setup-aws-cross-account-scanner'


def extract_downloaded_skill(root):
    output = root / 'portal-skill'
    _generate_skill_manifest(SKILL, output)
    manifest = json.loads((output / 'manifest.json').read_text())
    archive = root / 'skill.zip'
    with ZipFile(archive, 'w') as z:
        for name in manifest['files']:
            z.write(output / name, name)
    extracted = root / 'download'
    with ZipFile(archive) as z:
        z.extractall(extracted)
    return extracted


def test_downloaded_aws_skill_runs_with_its_bundled_templates():
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        # Match the portal's manifest-driven ZIP layout (files at the ZIP root).
        extracted = extract_downloaded_skill(root)

        # Any accidental AWS call must fail, rather than using developer credentials.
        bin_dir = root / 'bin'
        bin_dir.mkdir()
        aws = bin_dir / 'aws'
        aws.write_text('#!/bin/sh\necho "Unexpected live AWS call" >&2\nexit 97\n')
        aws.chmod(0o755)
        env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ['PATH'])

        def run(*args):
            result = subprocess.run(['bash', 'scripts/setup.sh', *args], cwd=extracted,
                                    env=env, text=True, capture_output=True, timeout=30)
            assert result.returncode == 0, result.stderr
            return result.stdout

        assert 'Getting started:' in run()
        assert 'references/setup-guide.md' in run('--help')
        guide = extracted / 'references' / 'setup-guide.md'
        assert guide.is_file()
        hub = run('hub', '--region', 'us-east-1', '--hub-account', '111111111111',
                  '--accounts', '222222222222', '--external-id', 'test-connection',
                  '--scanner-principal-arn', 'arn:aws:iam::111111111111:user/scanner',
                  '--dry-run')
        assert str(extracted / 'scripts' / 'hub-role.json') in hub
        spoke = run('spoke', '--region', 'us-east-1', '--account', '222222222222',
                    '--hub-account', '111111111111', '--external-id', 'test-connection',
                    '--scanners', 'bedrock,agentcore,agentcore-mcp,api-gateway', '--dry-run')
        assert str(extracted / 'scripts' / 'spoke-role.json') in spoke
        for family in ('Bedrock', 'AgentCore', 'AgentCoreMcp', 'ApiGateway'):
            assert 'Enable' + family + '=true' in spoke
        stackset = run('stackset', '--region', 'us-east-1',
                       '--administrator-account', '111111111111',
                       '--hub-account', '111111111111', '--external-id', 'test-connection',
                       '--scanners', 'bedrock,agentcore,agentcore-mcp,api-gateway',
                       '--permission-model', 'SERVICE_MANAGED', '--ous', 'r-abcd',
                       '--auto-enroll', '--dry-run')
        assert str(extracted / 'scripts' / 'spoke-role.json') in stackset
        assert 'Enabled=true,RetainStacksOnAccountRemoval=true' in stackset


@pytest.mark.parametrize('scenario', ['success', 'wrong-external-id', 'empty-resources'])
def test_downloaded_skill_executes_validation_with_the_scanner_role_chain(tmp_path, scenario):
    """Exercise the real shell/Python/subprocess path; AWS itself is simulated here."""
    extracted = extract_downloaded_skill(tmp_path)
    bin_dir = tmp_path / 'bin'
    bin_dir.mkdir()
    aws = bin_dir / 'aws'
    aws.write_text('#!' + sys.executable + '\n' + r'''
import json
import os
from pathlib import Path
import sys

args = sys.argv[1:]
operation = args[:2]
key = os.environ.get('AWS_ACCESS_KEY_ID')
profile = args[args.index('--profile') + 1] if '--profile' in args else None
with Path(os.environ['TEST_AWS_CALLS']).open('a') as log:
    log.write(json.dumps({'operation': operation, 'key': key, 'profile': profile}) + '\n')

def credentials(stage):
    return {'Credentials': {'AccessKeyId': 'test-' + stage + '-key',
                            'SecretAccessKey': 'fake-' + stage + '-secret',
                            'SessionToken': 'fake-' + stage + '-token'}}

if operation == ['sts', 'assume-role'] and profile == 'scanner-user':
    assert args[args.index('--role-arn') + 1] == 'arn:aws:iam::111111111111:role/SkillTestHub'
    result = credentials('hub')
else:
    assert profile is None, 'Assumed calls must not reuse the deployment/scanner profile'
    for name in ('AWS_PROFILE', 'AWS_CONFIG_FILE', 'AWS_SHARED_CREDENTIALS_FILE',
                 'AWS_ENDPOINT_URL', 'AWS_ENDPOINT_URL_STS'):
        assert name not in os.environ, 'Inherited AWS configuration: ' + name
    stage = 'hub' if operation == ['sts', 'assume-role'] else 'spoke'
    assert key == 'test-' + stage + '-key', 'Wrong credentials for role-chain stage'
    assert os.environ['AWS_SECRET_ACCESS_KEY'] == 'fake-' + stage + '-secret'
    assert os.environ['AWS_SESSION_TOKEN'] == 'fake-' + stage + '-token'
    if operation == ['sts', 'assume-role']:
        assert args[args.index('--role-arn') + 1] == 'arn:aws:iam::222222222222:role/SkillTestSpoke'
        if args[args.index('--external-id') + 1] != 'skill-validation':
            print('An error occurred (AccessDenied) when calling AssumeRole: External ID mismatch', file=sys.stderr)
            sys.exit(254)
        result = credentials('spoke')
    elif operation == ['sts', 'get-caller-identity']:
        result = {'Account': '222222222222',
                  'Arn': 'arn:aws:sts::222222222222:assumed-role/SkillTestSpoke/test'}
    else:
        field = {('bedrock-agent', 'list-agents'): 'agentSummaries',
                 ('bedrock-agentcore-control', 'list-agent-runtimes'): 'agentRuntimes',
                 ('apigateway', 'get-rest-apis'): 'items'}[tuple(operation)]
        result = {field: [] if os.environ['TEST_AWS_SCENARIO'] == 'empty-resources' else [{'name': 'fixture'}]}
print(json.dumps(result))
''')
    aws.chmod(0o755)
    calls_path = tmp_path / 'calls.jsonl'
    env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ['PATH'],
               TEST_AWS_CALLS=str(calls_path), TEST_AWS_SCENARIO=scenario,
               AWS_PROFILE='unrelated-deployment-profile',
               AWS_CONFIG_FILE=str(tmp_path / 'unused-config'),
               AWS_SHARED_CREDENTIALS_FILE=str(tmp_path / 'unused-credentials'),
               AWS_ENDPOINT_URL='https://unused.invalid',
               AWS_ENDPOINT_URL_STS='https://unused.invalid',
               AWS_ACCESS_KEY_ID='unrelated-deployment-key',
               AWS_SECRET_ACCESS_KEY='fake-unrelated-secret',
               AWS_SESSION_TOKEN='fake-unrelated-token')
    external_id = 'wrong-value' if scenario == 'wrong-external-id' else 'skill-validation'
    result = subprocess.run(
        ['bash', 'scripts/setup.sh', 'validate', '--profile', 'scanner-user',
         '--region', 'us-east-1', '--hub-account', '111111111111',
         '--accounts', '222222222222', '--hub-role-name', 'SkillTestHub',
         '--spoke-role-name', 'SkillTestSpoke', '--external-id', external_id,
         '--scanners', 'bedrock,agentcore,agentcore-mcp,api-gateway', '--require-nonempty'],
        cwd=extracted, env=env, text=True, capture_output=True, timeout=30,
    )
    calls = [json.loads(line) for line in calls_path.read_text().splitlines()]
    assert calls[0]['profile'] == 'scanner-user'
    assert calls[1]['key'] == 'test-hub-key'
    if scenario == 'wrong-external-id':
        assert result.returncode == 1
        assert 'AccessDenied' in result.stderr
        assert 'Validation failed for accounts: 222222222222' in result.stderr
        assert len(calls) == 2
    elif scenario == 'empty-resources':
        assert result.returncode == 1
        assert 'No bedrock fixtures discovered' in result.stderr
        assert 'validation passed' not in result.stdout
    else:
        assert result.returncode == 0, result.stdout + result.stderr
        assert [call['operation'] for call in calls[2:]] == [
            ['sts', 'get-caller-identity'], ['bedrock-agent', 'list-agents'],
            ['bedrock-agentcore-control', 'list-agent-runtimes'],
            ['bedrock-agentcore-control', 'list-agent-runtimes'], ['apigateway', 'get-rest-apis'],
        ]
        assert all(call['key'] == 'test-spoke-key' for call in calls[2:])
        for scanner in ('bedrock', 'agentcore', 'agentcore-mcp', 'api-gateway'):
            assert scanner + ': 1 resources;' in result.stdout
        assert 'Role-chain and list-API validation passed.' in result.stdout
    assert 'fake-hub-secret' not in result.stdout + result.stderr
    assert 'fake-spoke-token' not in result.stdout + result.stderr


def test_reference_links_render_on_the_portal():
    html = parse_skill(SKILL / 'SKILL.md')['full_content_html']
    for name in ('setup-guide.md', 'permissions.md', 'maintenance.md'):
        url = 'https://dev-portal.mulesoft.com/skills/setup-aws-cross-account-scanner/references/' + name
        assert 'href="' + url + '"' in html


def test_bundled_provisioning_suite():
    result = subprocess.run(
        [sys.executable, '-m', 'unittest', 'discover', '-s', str(SKILL / 'scripts'),
         '-p', 'test_setup.py'],
        cwd=REPO, text=True, capture_output=True, timeout=60,
    )
    assert result.returncode == 0, result.stdout + result.stderr
