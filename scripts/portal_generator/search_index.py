"""Build-time search document extraction for the homepage free-text search."""


def build_search_documents(public_apis, public_mcps, all_skills, terraform_providers):
    """Build one MiniSearch document per catalog item.

    Reads already-parsed catalog data (no filesystem access, no calls into
    discovery.py or parsers/) and returns a list of
    {id, type, name, category, description, deep_text, deep_items} dicts.

    ``description`` mirrors the text actually rendered on the card
    (``.catalog-card-description``) so matches there can be ranked above
    matches that only exist in ``deep_text`` — content indexed for
    findability (operations, tools, skill body, docs) but never shown on
    the card itself.

    ``deep_items`` is a structured breakdown of that same content —
    ``[{label, text}]``, one entry per operation/tool/prompt/resource/doc
    (or a single entry for a skill's whole body) — so the client can look
    up which specific item a deep match came from and show an excerpt of
    it. ``deep_text`` is the flat string MiniSearch actually indexes; it is
    derived from the same items plus a bit of extra context (category,
    tags) that has no single item to attach to.
    """
    docs = []
    for api in public_apis:
        docs.append(_api_document(api))
    for mcp in public_mcps:
        docs.append(_mcp_document(mcp))
    for skill in all_skills:
        docs.append(_skill_document(skill))
    for provider in terraform_providers:
        docs.append(_terraform_document(provider))
    return docs


def _api_document(api):
    items = []
    for op in api.get('operations', []):
        label = _join([op.get('method', ''), op.get('path', '')])
        text = _join([op.get('operationId', ''), op.get('summary', ''), op.get('description', '')])
        items.append({'label': label, 'text': text})
    deep_text = _join([api.get('category', '')] + [_join([item['label'], item['text']]) for item in items])
    return {
        'id': api['slug'],
        'type': 'api',
        'name': api.get('name', ''),
        'category': api.get('category', ''),
        'description': api.get('description', ''),
        'deep_text': deep_text,
        'deep_items': items,
    }


def _mcp_document(mcp):
    items = []
    for kind, key in (('tool', 'tools'), ('prompt', 'prompts'), ('resource', 'resources')):
        for entry in mcp.get(key, []):
            label = f"{entry.get('name', '')} ({kind})"
            items.append({'label': label, 'text': entry.get('description', '')})
    tag_text = ' '.join(mcp.get('tag_names', []))
    deep_text = _join([tag_text] + [_join([item['label'], item['text']]) for item in items])
    return {
        'id': mcp['slug'],
        'type': 'mcp',
        'name': mcp.get('name', ''),
        'category': '',
        'description': mcp.get('full_description', ''),
        'deep_text': deep_text,
        'deep_items': items,
    }


def _skill_document(skill):
    content = skill.get('content', '')
    items = [{'label': 'Skill content', 'text': content}] if content else []
    tag_text = ' '.join(skill.get('tag_names', []))
    return {
        'id': skill['slug'],
        'type': 'skill',
        'name': skill.get('name', ''),
        'category': '',
        'description': skill.get('description', ''),
        'deep_text': _join([tag_text, content]),
        'deep_items': items,
    }


def _terraform_document(provider):
    items = []
    for doc in provider.get('docs', []):
        name = doc.get('name', '')
        subcategory = doc.get('subcategory', '')
        label = f"{name} ({subcategory})" if subcategory else name
        items.append({'label': label, 'text': doc.get('description', '')})
    deep_text = _join([_join([item['label'], item['text']]) for item in items])
    return {
        'id': provider['slug'],
        'type': 'terraform',
        'name': provider.get('name', ''),
        'category': '',
        'description': '',
        'deep_text': deep_text,
        'deep_items': items,
    }


def _join(parts):
    return ' '.join(str(p) for p in parts if p).strip()
