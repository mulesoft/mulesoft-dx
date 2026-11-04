"""Shape MCP and REST artifacts to the agent-fabric 1.2609.1 contracts.

The push parser validates MCP against ``mcp_metadata.json`` and REST against
the OpenAPI shape check. Fields the schema does not require are not a reason
to skip the asset. Fields the schema rejects are omitted. A missing required
field is a refusal.
"""

from __future__ import annotations

import copy
import re
from typing import Any

from agent_card_shape import ShapeRefusal

MCP_TOP_LEVEL = frozenset(
    {
        "protocolVersion",
        "transport",
        "provider",
        "capabilities",
        "logging",
        "tools",
        "resources",
        "resourceTemplates",
        "prompts",
        "platform",
        "securitySchemes",
        "connections",
        "provenance",
    }
)
MCP_PROTOCOL_VERSIONS = frozenset(
    {"2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"}
)
OPENAPI_3 = re.compile(r"^3\.[0-9]+\.[0-9]+$")


def _keep(items: Any, predicate) -> list | None:
    if not isinstance(items, list):
        return None
    kept = [copy.deepcopy(item) for item in items if isinstance(item, dict) and predicate(item)]
    return kept or None


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def shape_mcp_metadata(document: dict) -> tuple[str, dict]:
    """Return ``(mcp-metadata.json, body)`` or raise ``ShapeRefusal``."""
    if not isinstance(document, dict):
        raise ShapeRefusal("mcp metadata is not a JSON object")
    body = {key: copy.deepcopy(document[key]) for key in document if key in MCP_TOP_LEVEL}
    protocol = body.get("protocolVersion")
    if protocol is not None and protocol not in MCP_PROTOCOL_VERSIONS:
        del body["protocolVersion"]
    transport = body.get("transport")
    if not isinstance(transport, dict):
        raise ShapeRefusal("mcp transport is missing")
    body["transport"] = _shape_transport(transport)
    capabilities = body.get("capabilities")
    if capabilities is not None and not isinstance(capabilities, dict):
        raise ShapeRefusal("mcp capabilities must be an object")
    tools = _keep(
        body.get("tools"),
        lambda item: _nonempty(item.get("name")) and isinstance(item.get("inputSchema"), dict),
    )
    if tools is None:
        body.pop("tools", None)
    else:
        body["tools"] = tools
    resources = _keep(
        body.get("resources"),
        lambda item: _nonempty(item.get("name")) and _nonempty(item.get("uri")),
    )
    if resources is None:
        body.pop("resources", None)
    else:
        body["resources"] = resources
    templates = _keep(
        body.get("resourceTemplates"),
        lambda item: _nonempty(item.get("name")) and _nonempty(item.get("uriTemplate")),
    )
    if templates is None:
        body.pop("resourceTemplates", None)
    else:
        body["resourceTemplates"] = templates
    prompts = _keep(body.get("prompts"), lambda item: _nonempty(item.get("name")))
    if prompts is None:
        body.pop("prompts", None)
    else:
        body["prompts"] = prompts
    return "mcp-metadata.json", body


def _shape_transport(transport: dict) -> dict:
    kind = transport.get("kind")
    if kind == "streamableHttp":
        shaped = {"kind": "streamableHttp"}
        if isinstance(transport.get("path"), str):
            shaped["path"] = transport["path"]
        return shaped
    if kind == "stdio":
        shaped = {"kind": "stdio"}
        if isinstance(transport.get("instructions"), str):
            shaped["instructions"] = transport["instructions"]
        return shaped
    if kind == "sse":
        sse_path = transport.get("ssePath")
        path = transport.get("path")
        if not _nonempty(sse_path):
            if _nonempty(path):
                sse_path = path.strip()
            else:
                raise ShapeRefusal("sse transport has no ssePath")
        shaped = {"kind": "sse", "ssePath": sse_path.strip()}
        if isinstance(transport.get("messagesPath"), str):
            shaped["messagesPath"] = transport["messagesPath"]
        return shaped
    raise ShapeRefusal("mcp transport.kind must be streamableHttp, sse, or stdio")


def shape_rest_document(document: dict, source_name: str = "oas.json") -> tuple[str, dict]:
    """Return ``(oas.json|oas.yaml, body)`` or raise ``ShapeRefusal``."""
    if not isinstance(document, dict):
        raise ShapeRefusal("rest document is not a JSON object")
    openapi = document.get("openapi")
    swagger = document.get("swagger")
    if not (isinstance(openapi, str) and OPENAPI_3.match(openapi)) and swagger != "2.0":
        raise ShapeRefusal("rest document needs openapi 3.x.y or swagger 2.0")
    info = document.get("info")
    if not isinstance(info, dict) or not _nonempty(info.get("title")):
        raise ShapeRefusal("rest info.title is missing")
    if not _nonempty(info.get("version")):
        raise ShapeRefusal("rest info.version is missing")
    if not isinstance(document.get("paths"), dict):
        raise ShapeRefusal("rest paths is missing")
    filename = "oas.yaml" if source_name.endswith((".yaml", ".yml")) else "oas.json"
    return filename, copy.deepcopy(document)
