"""MCP and REST shaping against agent-fabric 1.2609.1 and the push OpenAPI check."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

from jsonschema import Draft7Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT7

sys.path.insert(0, str(Path(__file__).resolve().parent))

from agent_card_shape import ShapeRefusal  # noqa: E402
from push_artifact import shape_mcp_metadata, shape_rest_document  # noqa: E402

SKILL_ROOT = Path(__file__).resolve().parents[1]


def _schema_dir() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = (
            parent
            / "agent-scanner-configuration-service"
            / "src"
            / "main"
            / "resources"
            / "schemas"
            / "exchange"
        )
        if (candidate / "mcp_metadata.json").is_file():
            return candidate
    raise unittest.SkipTest("exchange schemas are not checked out beside this repo")


def _validator(schema_dir: Path, filename: str) -> Draft7Validator:
    path = (schema_dir / filename).resolve()
    contents = {
        item.name: json.loads(item.read_text(encoding="utf-8"))
        for item in schema_dir.glob("*.json")
    }
    openapi = schema_dir.parent / "push" / "openapi.schema.json"
    contents[openapi.name] = json.loads(openapi.read_text(encoding="utf-8"))
    resources = []
    for name, body in contents.items():
        resources.append((name, Resource.from_contents(body, default_specification=DRAFT7)))
    registry = Registry().with_resources(resources)
    schema = json.loads(path.read_text(encoding="utf-8"))
    return Draft7Validator(schema, registry=registry)


def _assert_schema(validator: Draft7Validator, instance: dict) -> None:
    errors = sorted(validator.iter_errors(instance), key=lambda item: list(item.path))
    if errors:
        raise AssertionError("; ".join(error.message for error in errors[:5]))


class McpContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.schema = _validator(_schema_dir(), "mcp_metadata.json")

    def test_partial_capabilities_are_kept(self) -> None:
        filename, body = shape_mcp_metadata(
            {
                "transport": {"kind": "streamableHttp", "path": "/mcp"},
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "weather"},
            }
        )
        self.assertEqual(filename, "mcp-metadata.json")
        self.assertEqual(body["capabilities"], {"tools": {}})
        self.assertNotIn("serverInfo", body)
        _assert_schema(self.schema, body)

    def test_kind_only_streamable_http(self) -> None:
        _filename, body = shape_mcp_metadata({"transport": {"kind": "streamableHttp"}})
        _assert_schema(self.schema, body)

    def test_stdio_and_unknown_protocol_version_are_not_failures(self) -> None:
        _filename, body = shape_mcp_metadata(
            {"transport": {"kind": "stdio"}, "protocolVersion": "1999-01-01", "serverInfo": {"name": "x"}}
        )
        self.assertNotIn("protocolVersion", body)
        self.assertEqual(body["transport"]["kind"], "stdio")
        _assert_schema(self.schema, body)

    def test_known_protocol_version_is_kept(self) -> None:
        _filename, body = shape_mcp_metadata(
            {"transport": {"kind": "stdio"}, "protocolVersion": "2025-03-26"}
        )
        self.assertEqual(body["protocolVersion"], "2025-03-26")
        _assert_schema(self.schema, body)

    def test_sse_path_is_copied_from_path(self) -> None:
        _filename, body = shape_mcp_metadata(
            {"transport": {"kind": "sse", "path": "https://apim.example/sse"}}
        )
        self.assertEqual(body["transport"]["ssePath"], "https://apim.example/sse")
        self.assertNotIn("path", body["transport"])
        _assert_schema(self.schema, body)

    def test_incomplete_tool_is_omitted_not_a_failure(self) -> None:
        _filename, body = shape_mcp_metadata(
            {
                "transport": {"kind": "streamableHttp"},
                "tools": [{"name": "bare"}, {"name": "ok", "inputSchema": {"type": "object"}}],
            }
        )
        self.assertEqual(body["tools"], [{"name": "ok", "inputSchema": {"type": "object"}}])
        _assert_schema(self.schema, body)

    def test_missing_transport_is_refused(self) -> None:
        with self.assertRaises(ShapeRefusal) as raised:
            shape_mcp_metadata({"capabilities": {"tools": True}})
        self.assertIn("transport", raised.exception.why)

    def test_unknown_kind_is_refused(self) -> None:
        with self.assertRaises(ShapeRefusal):
            shape_mcp_metadata({"transport": {"kind": "http", "path": "/mcp"}})

    def test_sse_without_any_path_is_refused(self) -> None:
        with self.assertRaises(ShapeRefusal):
            shape_mcp_metadata({"transport": {"kind": "sse"}})


class RestContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        schema_dir = _schema_dir()
        cls.schema = _validator(schema_dir, "../push/openapi.schema.json")

    def test_openapi3_empty_paths(self) -> None:
        filename, body = shape_rest_document(
            {
                "openapi": "3.0.3",
                "info": {"title": "Orders", "version": "1.0.0"},
                "paths": {},
                "x-vendor": True,
            }
        )
        self.assertEqual(filename, "oas.json")
        self.assertIn("x-vendor", body)
        _assert_schema(self.schema, body)

    def test_swagger2_yaml_name(self) -> None:
        filename, body = shape_rest_document(
            {"swagger": "2.0", "info": {"title": "Orders", "version": "1"}, "paths": {}},
            source_name="openapi.yaml",
        )
        self.assertEqual(filename, "oas.yaml")
        _assert_schema(self.schema, body)

    def test_missing_info_version_is_refused(self) -> None:
        with self.assertRaises(ShapeRefusal) as raised:
            shape_rest_document(
                {"openapi": "3.0.0", "info": {"title": "Orders"}, "paths": {}}
            )
        self.assertIn("info.version", raised.exception.why)

    def test_bad_openapi_version_is_refused(self) -> None:
        with self.assertRaises(ShapeRefusal):
            shape_rest_document(
                {"openapi": "not-a-version", "info": {"title": "Orders", "version": "1"}, "paths": {}}
            )


class SkillHonorsFabricTests(unittest.TestCase):
    def test_skill_does_not_require_four_mcp_booleans(self) -> None:
        skill = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
        contract = (SKILL_ROOT / "references" / "scanner-contract.md").read_text(encoding="utf-8")
        for document in (skill, contract):
            self.assertNotIn("four boolean", document.lower())
            self.assertIn("Do not invent the missing capability keys", document)
            self.assertIn("oas.yaml", document)
            self.assertIn("info.title", document)
            self.assertIn("info.version", document)
        self.assertIn("2025-11-25", skill)
        self.assertIn("ssePath", skill)


if __name__ == "__main__":
    unittest.main(verbosity=2)
