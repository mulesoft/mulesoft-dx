# Security smoke-test fixtures

These fixtures intentionally contain payloads that an attacker might submit via
a malicious PR (XSS attempts in spec descriptions, MCP capability flags, Terraform
markdown, etc.). The smoke tests in `scripts/tests/test_smoke.py` build the portal
against these fixtures and assert the rendered HTML neutralizes them.

Do not copy these into real spec directories.

## Fixtures

- `malicious_spec/` — OpenAPI spec with XSS attempts in description, summary, link href, operationId.
- `malicious_mcp/` — MCP descriptor with XSS attempts in capability flag keys, mimeType, descriptions.
- `malicious_terraform/` — Terraform resource markdown with raw `<script>` tag.
