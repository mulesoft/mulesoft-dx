"""Shared fixtures for portal generator tests."""

import json
import textwrap
from pathlib import Path

import pytest


@pytest.fixture
def sample_api_data():
    """A minimal API data dict as produced by discovery.discover_apis()."""
    return {
        'id': 'test-api',
        'slug': 'test-api',
        'name': 'Test API',
        'version': '1.0.0',
        'description': 'A test API for unit testing.',
        'full_description': 'A test API for unit testing.',
        'category': 'Platform',
        'operation_count': 2,
        'operations': [
            {
                'method': 'GET',
                'path': '/api/v1/resources',
                'operationId': 'listResources',
                'summary': 'List resources',
                'description': 'Returns a list of resources.',
                'deprecated': False,
                'tags': ['Resources'],
                'parameters': [
                    {
                        'name': 'limit',
                        'in': 'query',
                        'required': False,
                        'description': 'Max items to return',
                        'schema': {'type': 'integer', 'default': 20},
                        'x-origin': None,
                    }
                ],
                'requestBody': None,
                'responses': {
                    '200': {
                        'description': 'OK',
                        'content_types': ['application/json'],
                        'schemas': {},
                        'examples': {},
                    }
                },
                'security': None,
                '_example_body': '',
            },
            {
                'method': 'POST',
                'path': '/api/v1/resources',
                'operationId': 'createResource',
                'summary': 'Create a resource',
                'description': 'Creates a new resource.',
                'deprecated': False,
                'tags': ['Resources'],
                'parameters': [],
                'requestBody': {
                    'required': True,
                    'description': 'Resource payload',
                    'content_types': ['application/json'],
                    'schemas': {},
                    'raw_schemas': {
                        'application/json': {
                            'type': 'object',
                            'properties': {
                                'name': {'type': 'string'},
                                'active': {'type': 'boolean'},
                            },
                        }
                    },
                    'examples': {},
                },
                'responses': {
                    '201': {
                        'description': 'Created',
                        'content_types': ['application/json'],
                        'schemas': {},
                        'examples': {},
                    }
                },
                'security': None,
                '_example_body': '{\n  "name": "",\n  "active": false\n}',
            },
        ],
        'servers': [
            {
                'url': 'https://anypoint.mulesoft.com/api/v1',
                'description': 'Production',
                'variables': {},
            }
        ],
        'security': [{'bearerAuth': []}],
        'security_schemes': {
            'bearerAuth': {
                'type': 'http',
                'scheme': 'bearer',
                'description': 'Bearer token',
            }
        },
        'tags': [{'name': 'Resources', 'description': 'Resource operations'}],
        'skills': [],
        'skill_count': 0,
    }


@pytest.fixture
def sample_api_data_with_skills(sample_api_data):
    """API data dict that includes a skill entry."""
    sample_api_data['skills'] = [
        {
            'name': 'deploy-app',
            'description': 'Deploy an application',
            'content': '## Overview\nDeploy steps\n## Step 1: Get targets\nCall the API.',
            'content_html': '<p>Deploy steps</p>',
            'raw_content': '---\nname: deploy-app\n---\n## Overview\nDeploy steps',
            'source_path': '/fake/skills/deploy-app/SKILL.md',
            'overview_html': '<p>Deploy steps</p>',
            'prerequisites_html': '',
            'steps': ['Step 1: Get targets'],
            'step_details': [
                {
                    'title': 'Step 1: Get targets',
                    'yaml': {
                        'api': 'urn:api:test-api',
                        'operation': 'listResources',
                    },
                }
            ],
            'step_count': 1,
            'slug': 'deploy-app',
            'api_name': 'test-api',
            'api_slug': 'test-api',
        }
    ]
    sample_api_data['skill_count'] = 1
    return sample_api_data


MINIMAL_OAS_YAML = textwrap.dedent("""\
    openapi: 3.0.3
    info:
      title: Test API
      version: 1.0.0
      description: A minimal test API.
    servers:
      - url: https://api.example.com/v1
        description: Production
    paths:
      /resources:
        get:
          operationId: listResources
          summary: List resources
          description: Returns all resources.
          parameters:
            - name: limit
              in: query
              required: false
              description: Max results
              schema:
                type: integer
          responses:
            '200':
              description: OK
              content:
                application/json:
                  schema:
                    type: array
                    items:
                      type: object
                      properties:
                        id:
                          type: string
                        name:
                          type: string
        post:
          operationId: createResource
          summary: Create resource
          description: Creates a new resource.
          requestBody:
            required: true
            content:
              application/json:
                schema:
                  type: object
                  required:
                    - name
                  properties:
                    name:
                      type: string
                      description: Resource name
                    active:
                      type: boolean
                      default: true
                example:
                  name: my-resource
                  active: true
          responses:
            '201':
              description: Created
    components:
      securitySchemes:
        bearerAuth:
          type: http
          scheme: bearer
      parameters:
        orgId:
          name: orgId
          in: path
          required: true
          description: Organization ID
          schema:
            type: string
    security:
      - bearerAuth: []
""")


MINIMAL_SKILL_MD = textwrap.dedent("""\
    ---
    name: deploy-app
    description: Deploy an application to CloudHub
    ---
    ## Overview
    This skill deploys an application.

    ## Prerequisites
    You need a valid auth token.

    ## Step 1: List targets
    Retrieve deployment targets.

    ```yaml
    api: urn:api:test-api
    operation: listResources
    inputs:
      - name: limit
        source: literal
        value: "10"
    outputs:
      - name: targetId
        path: $[0].id
        description: First target ID
    ```

    ## Step 2: Create resource
    Create the deployment resource.

    ```yaml
    api: urn:api:test-api
    operation: createResource
    inputs:
      - name: name
        source: step
        step: 1
        field: targetId
    ```
""")


MINIMAL_EXCHANGE_JSON = json.dumps({
    'main': 'api.yaml',
    'name': 'Test API',
    'groupId': 'com.example.anypoint-platform',
    'assetId': 'test-api',
    'version': '1.0.0',
    'apiVersion': 'v1',
    'organizationId': '00000000-0000-0000-0000-000000000000',
})

PRIVATE_EXCHANGE_JSON = json.dumps({
    'main': 'api.yaml',
    'name': 'Private API',
    'groupId': 'com.example.anypoint-platform',
    'assetId': 'private-api',
    'version': '1.0.0',
    'apiVersion': 'v1',
    'organizationId': '00000000-0000-0000-0000-000000000000',
    'visibility': 'private',
})


def setup_schema_docs(repo_root: Path):
    """Create minimal schema doc files under a repo root for testing."""
    schemas_dir = repo_root / 'docs' / 'schemas'
    schemas_dir.mkdir(parents=True, exist_ok=True)
    (schemas_dir / 'x-origin.schema.json').write_text('{"$schema":"http://json-schema.org/draft-07/schema#"}')
    (repo_root / 'docs' / 'x-origin-schema.md').write_text('# x-origin schema\nDocumentation.')
    (repo_root / 'docs' / 'x-jobs-to-be-done-schema.md').write_text('# JTBD schema\nDocumentation.')
    (repo_root / 'docs' / 'job-template.md').write_text('# Job template\nTemplate.')


@pytest.fixture
def api_fixture_dir(tmp_path):
    """Create a minimal API directory on disk with api.yaml, exchange.json, and a skill."""
    api_dir = tmp_path / 'test-api'
    api_dir.mkdir()

    (api_dir / 'api.yaml').write_text(MINIMAL_OAS_YAML)
    (api_dir / 'exchange.json').write_text(MINIMAL_EXCHANGE_JSON)

    skill_dir = tmp_path / 'skills' / 'deploy-app'
    skill_dir.mkdir(parents=True)
    (skill_dir / 'SKILL.md').write_text(MINIMAL_SKILL_MD)

    setup_schema_docs(tmp_path)

    return tmp_path
