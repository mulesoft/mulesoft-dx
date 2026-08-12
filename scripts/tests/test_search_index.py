"""Unit tests for build_search_documents()."""

from portal_generator.search_index import build_search_documents


def _api(slug='test-api', category='Platform', operations=None):
    return {
        'slug': slug,
        'name': 'Test API',
        'category': category,
        'description': 'A test API for things.',
        'operations': operations if operations is not None else [
            {
                'method': 'GET',
                'path': '/things',
                'operationId': 'listThings',
                'summary': 'List things',
                'description': 'Returns all things',
            },
        ],
    }


def _mcp(slug='secure-mcp-server'):
    return {
        'slug': slug,
        'name': 'Secure MCP Server',
        'full_description': 'Deploy and manage a secure MCP server with policy enforcement.',
        'tag_names': ['security', 'mcp'],
        'tools': [
            {'name': 'applyPolicy', 'description': 'Apply a security policy to the server'},
        ],
        'prompts': [
            {'name': 'auditPrompt', 'description': 'Audit current policies'},
        ],
        'resources': [
            {'name': 'policyDoc', 'description': 'Policy documentation resource'},
        ],
    }


def _skill(slug='deploy-app'):
    return {
        'slug': slug,
        'name': 'deploy-app',
        'description': 'Deploy an application',
        'tag_names': ['deployment', 'ops'],
        'content': 'Full SKILL.md prose body describing deployment steps.',
    }


def _terraform(slug='anypoint-provider'):
    return {
        'slug': slug,
        'name': 'Anypoint Provider',
        'docs': [
            {
                'name': 'anypoint_api_instance',
                'description': 'Manages an API instance in Anypoint API Manager.',
                'subcategory': 'API Management',
            },
        ],
    }


class TestBuildSearchDocuments:
    def test_one_document_per_item(self):
        docs = build_search_documents([_api()], [_mcp()], [_skill()], [_terraform()])
        assert len(docs) == 4

    def test_every_document_has_required_keys(self):
        docs = build_search_documents([_api()], [_mcp()], [_skill()], [_terraform()])
        for doc in docs:
            assert set(doc.keys()) == {'id', 'type', 'name', 'category', 'description', 'deep_text', 'deep_items'}

    def test_no_empty_name(self):
        docs = build_search_documents([_api()], [_mcp()], [_skill()], [_terraform()])
        for doc in docs:
            assert doc['name'].strip() != ''

    def test_api_document_shape(self):
        docs = build_search_documents([_api()], [], [], [])
        doc = docs[0]
        assert doc['id'] == 'test-api'
        assert doc['type'] == 'api'
        assert doc['name'] == 'Test API'
        assert doc['category'] == 'Platform'
        assert doc['description'] == 'A test API for things.'
        assert 'listThings' in doc['deep_text']
        assert 'Returns all things' in doc['deep_text']
        assert 'GET' in doc['deep_text']
        assert '/things' in doc['deep_text']
        # deep_text carries findable content, not the rendered description
        assert 'A test API for things.' not in doc['deep_text']
        assert doc['deep_items'] == [
            {'label': 'GET /things', 'text': 'listThings List things Returns all things'},
        ]

    def test_mcp_document_includes_tool_description(self):
        docs = build_search_documents([], [_mcp()], [], [])
        doc = docs[0]
        assert doc['id'] == 'secure-mcp-server'
        assert doc['type'] == 'mcp'
        assert doc['description'] == 'Deploy and manage a secure MCP server with policy enforcement.'
        assert 'Apply a security policy to the server' in doc['deep_text']
        assert 'Audit current policies' in doc['deep_text']
        assert 'Policy documentation resource' in doc['deep_text']
        assert 'security' in doc['deep_text']
        assert doc['deep_items'] == [
            {'label': 'applyPolicy (tool)', 'text': 'Apply a security policy to the server'},
            {'label': 'auditPrompt (prompt)', 'text': 'Audit current policies'},
            {'label': 'policyDoc (resource)', 'text': 'Policy documentation resource'},
        ]

    def test_skill_document_includes_content_and_tags(self):
        docs = build_search_documents([], [], [_skill()], [])
        doc = docs[0]
        assert doc['id'] == 'deploy-app'
        assert doc['type'] == 'skill'
        assert doc['description'] == 'Deploy an application'
        assert 'Full SKILL.md prose body' in doc['deep_text']
        assert 'deployment' in doc['deep_text']
        assert doc['deep_items'] == [
            {'label': 'Skill content', 'text': 'Full SKILL.md prose body describing deployment steps.'},
        ]

    def test_terraform_document_is_non_trivial(self):
        docs = build_search_documents([], [], [], [_terraform()])
        doc = docs[0]
        assert doc['id'] == 'anypoint-provider'
        assert doc['type'] == 'terraform'
        assert doc['category'] == ''
        assert 'anypoint_api_instance' in doc['deep_text']
        assert 'Manages an API instance in Anypoint API Manager.' in doc['deep_text']
        assert 'API Management' in doc['deep_text']
        assert doc['deep_items'] == [
            {
                'label': 'anypoint_api_instance (API Management)',
                'text': 'Manages an API instance in Anypoint API Manager.',
            },
        ]

    def test_terraform_document_with_no_docs_still_has_name(self):
        bare = build_search_documents([], [], [], [{'slug': 'empty-provider', 'name': 'Empty Provider', 'docs': []}])
        assert bare[0]['name'] == 'Empty Provider'
        assert bare[0]['deep_text'].strip() == ''

    def test_mcp_prompt_without_description_does_not_crash(self):
        mcp = _mcp()
        mcp['prompts'] = [{'name': 'bare-prompt'}]
        docs = build_search_documents([], [mcp], [], [])
        assert 'bare-prompt' in docs[0]['deep_text']

    def test_mcp_and_skill_category_is_empty_string(self):
        # Spec: category is '' when the item type has no category concept
        # (only APIs have a real category).
        docs = build_search_documents([], [_mcp()], [_skill()], [])
        for doc in docs:
            assert doc['category'] == ''

    def test_cross_type_id_collision_is_tolerated(self):
        # Spec: cross-type slug collisions are acceptable since `type`
        # disambiguates and the UI scopes matching per data-search-id card,
        # not globally deduped. build_search_documents() must not dedupe or
        # raise when an api and a skill share the same slug.
        docs = build_search_documents(
            [_api(slug='shared-slug')], [], [_skill(slug='shared-slug')], [],
        )
        assert len(docs) == 2
        ids = [d['id'] for d in docs]
        assert ids == ['shared-slug', 'shared-slug']
        assert {d['type'] for d in docs} == {'api', 'skill'}

    def test_empty_inputs_produce_empty_list(self):
        assert build_search_documents([], [], [], []) == []

    def test_type_field_uses_expected_literals(self):
        docs = build_search_documents([_api()], [_mcp()], [_skill()], [_terraform()])
        by_type = {d['type']: d for d in docs}
        assert set(by_type.keys()) == {'api', 'mcp', 'skill', 'terraform'}
