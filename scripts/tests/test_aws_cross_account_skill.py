"""Exercise the AWS skill as a portal download, independent of its checkout."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from zipfile import ZipFile

from portal_generator.generator import _generate_skill_manifest
from portal_generator.parsers.skill_parser import parse_skill


REPO = Path(__file__).resolve().parents[2]
SKILL = REPO / 'skills' / 'setup-aws-cross-account-scanner'


def test_downloaded_aws_skill_runs_with_its_bundled_templates():
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        output = root / 'portal-skill'
        _generate_skill_manifest(SKILL, output)
        manifest = json.loads((output / 'manifest.json').read_text())
        archive = root / 'skill.zip'
        # Match the portal's manifest-driven ZIP layout (files at the ZIP root).
        with ZipFile(archive, 'w') as z:
            for name in manifest['files']:
                z.write(output / name, name)
        extracted = root / 'download'
        with ZipFile(archive) as z:
            z.extractall(extracted)

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
