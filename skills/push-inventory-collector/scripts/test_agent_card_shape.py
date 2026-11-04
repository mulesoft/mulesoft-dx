"""Prove agent ZIP choice against the Exchange schemas the push parser uses.

A2A v0.3 required keys are enforced only for a2a-card.json. A card that is
missing skills or protocolVersion, and still has an http(s) URL, must become
other-card.json. That is the NVIDIA Astra failure: the published skill refused
those agents locally instead of choosing other-card.json.
"""

from __future__ import annotations

import io
import json
import sys
import unittest
import zipfile
from pathlib import Path

from jsonschema import Draft7Validator
from jsonschema.exceptions import RefResolutionError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT7

sys.path.insert(0, str(Path(__file__).resolve().parent))

from agent_card_shape import (  # noqa: E402
    A2A_V1_PROPERTIES,
    ShapeRefusal,
    build_agent_zip,
    shape_agent_card,
)

SKILL_ROOT = Path(__file__).resolve().parents[1]
CHOOSE_RULE = "Missing `skills` or `protocolVersion` is not a reason to skip an agent that has an HTTP URL."


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
        if (candidate / "other_card.json").is_file() and (candidate / "a2a.json").is_file():
            return candidate
    raise unittest.SkipTest("exchange schemas are not checked out beside this repo")


def _registry(schema_dir: Path) -> Registry:
    resources = []
    for path in schema_dir.glob("*.json"):
        contents = json.loads(path.read_text(encoding="utf-8"))
        resources.append((path.name, Resource.from_contents(contents, default_specification=DRAFT7)))
        resources.append(
            (path.resolve().as_uri(), Resource.from_contents(contents, default_specification=DRAFT7))
        )
    return Registry().with_resources(resources)


def _validator(schema_dir: Path, filename: str) -> Draft7Validator:
    schema = json.loads((schema_dir / filename).read_text(encoding="utf-8"))
    return Draft7Validator(schema, registry=_registry(schema_dir))


def _assert_schema(validator: Draft7Validator, instance: dict) -> None:
    errors = sorted(validator.iter_errors(instance), key=lambda item: list(item.path))
    if errors:
        rendered = "; ".join(error.message for error in errors[:5])
        raise AssertionError(rendered)


def _v03(**overrides) -> dict:
    card = {
        "name": "Recipe Agent",
        "description": "Cooks",
        "protocolVersion": "0.3.0",
        "url": "https://agents.example.com/recipe",
        "version": "1.0.0",
        "capabilities": {"streaming": True},
        "defaultInputModes": ["text"],
        "defaultOutputModes": ["text"],
        "skills": [],
    }
    card.update(overrides)
    return card


class ShapeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        schema_dir = _schema_dir()
        cls.a2a = _validator(schema_dir, "agent_card.json")
        cls.v1 = _validator(schema_dir, "agent_card_v1.json")
        cls.other = _validator(schema_dir, "other_card.json")

    def test_missing_skills_is_other_card_not_a_local_failure(self) -> None:
        card = _v03()
        del card["skills"]
        card["name"] = "hw-adlr-agent"
        card["url"] = "https://astra.nvidia.com/agents/hw-adlr-agent"
        filename, body = shape_agent_card(card)
        self.assertEqual(filename, "other-card.json")
        self.assertNotIn("skills", body)
        self.assertEqual(body["protocolVersion"], "0.3.0")
        _assert_schema(self.other, body)
        self.assertTrue(list(self.a2a.iter_errors(body)))

    def test_missing_protocol_version_is_other_card(self) -> None:
        card = _v03()
        del card["protocolVersion"]
        card["name"] = "nvidia-architecture-discovery"
        card["url"] = "https://astra.nvidia.com/agents/nvidia-architecture-discovery"
        filename, body = shape_agent_card(card)
        self.assertEqual(filename, "other-card.json")
        self.assertNotIn("protocolVersion", body)
        _assert_schema(self.other, body)
        self.assertTrue(list(self.a2a.iter_errors(body)))

    def test_complete_a2a_stays_a2a_card(self) -> None:
        card = _v03(
            skills=[{"id": "cook", "name": "Cook", "description": "Cooks", "tags": ["food"]}]
        )
        filename, body = shape_agent_card(card)
        self.assertEqual(filename, "a2a-card.json")
        _assert_schema(self.a2a, body)

    def test_empty_skills_array_is_still_a2a(self) -> None:
        filename, body = shape_agent_card(_v03())
        self.assertEqual(filename, "a2a-card.json")
        _assert_schema(self.a2a, body)

    def test_v1_interfaces_without_top_level_url(self) -> None:
        card = {
            "name": "V1 Agent",
            "description": "Interfaces only",
            "version": "1.0.0",
            "supportedInterfaces": [{"url": "https://agents.example.com/v1", "protocolBinding": "JSONRPC"}],
        }
        filename, body = shape_agent_card(card)
        self.assertEqual(filename, "a2a-v1-card.json")
        self.assertNotIn("url", body)
        _assert_schema(self.v1, body)

    def test_snake_case_interfaces_are_v1(self) -> None:
        card = {
            "name": "V1 Agent",
            "supported_interfaces": [{"url": "https://agents.example.com/v1"}],
        }
        filename, _body = shape_agent_card(card)
        self.assertEqual(filename, "a2a-v1-card.json")

    def test_v1_property_list_matches_fabric_schema(self) -> None:
        schema_dir = _schema_dir()
        card = json.loads((schema_dir / "a2a_v1.json").read_text(encoding="utf-8"))
        properties = set(card["definitions"]["Agent Card"]["properties"])
        self.assertEqual(A2A_V1_PROPERTIES, properties)
        self.assertFalse(card["definitions"]["Agent Card"].get("additionalProperties", True))

    def test_v1_card_with_vendor_field_is_other_card(self) -> None:
        card = {
            "name": "Vendor Agent",
            "supportedInterfaces": [{"url": "https://agents.example.com/v1"}],
            "vendorField": "astra",
        }
        filename, body = shape_agent_card(card)
        self.assertEqual(filename, "other-card.json")
        self.assertEqual(body["vendorField"], "astra")
        _assert_schema(self.other, body)
        self.assertTrue(list(self.v1.iter_errors(body)))

    def test_partial_a2a_with_top_level_url_does_not_become_v1(self) -> None:
        card = _v03()
        del card["skills"]
        card["supportedInterfaces"] = [{"url": "https://agents.example.com/v1"}]
        filename, _body = shape_agent_card(card)
        self.assertEqual(filename, "other-card.json")

    def test_interface_url_alone_is_enough_for_other_when_not_v1(self) -> None:
        card = {
            "name": "Partial",
            "url": "not-a-url",
            "supportedInterfaces": [{"url": "https://agents.example.com/other"}],
        }
        filename, body = shape_agent_card(card)
        self.assertEqual(filename, "other-card.json")
        self.assertEqual(body["url"], "not-a-url")
        _assert_schema(self.other, body)

    def test_no_http_url_is_refused(self) -> None:
        with self.assertRaises(ShapeRefusal) as raised:
            shape_agent_card({"name": "Orders Agent"})
        self.assertIn("HTTP", raised.exception.why)
        self.assertNotIn("skills", raised.exception.why)
        self.assertNotIn("protocolVersion", raised.exception.why)

    def test_non_http_url_is_refused(self) -> None:
        with self.assertRaises(ShapeRefusal):
            shape_agent_card({"name": "Orders Agent", "url": "ftp://agents.example.com/x"})

    def test_zip_for_non_a2a_contains_only_other_card(self) -> None:
        card = _v03(name="hw-adlr-agent")
        del card["skills"]
        payload = build_agent_zip("hw-adlr-agent", "HW ADLR Agent", card, description="Astra")
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            names = set(archive.namelist())
            config = json.loads(archive.read("hw-adlr-agent/specification/config.json"))
            artifact = json.loads(archive.read("hw-adlr-agent/specification/other-card.json"))
        self.assertEqual(
            names,
            {
                "hw-adlr-agent/specification/config.json",
                "hw-adlr-agent/specification/other-card.json",
            },
        )
        self.assertEqual(config["type"], "agent")
        self.assertEqual(config["name"], "HW ADLR Agent")
        self.assertNotIn("skills", artifact)
        _assert_schema(self.other, artifact)

    def test_does_not_invent_a2a_keys_on_other_card(self) -> None:
        filename, body = shape_agent_card(
            {"name": "plain", "url": "https://agents.example.com/plain"}
        )
        self.assertEqual(filename, "other-card.json")
        self.assertEqual(set(body), {"name", "url"})
        _assert_schema(self.other, body)

    def test_schema_refs_resolve(self) -> None:
        try:
            _assert_schema(self.other, {"name": "plain", "url": "https://agents.example.com/plain"})
        except RefResolutionError as exc:  # pragma: no cover - registry bug
            self.fail(str(exc))


class PublishedSkillContractTests(unittest.TestCase):
    def test_skill_and_contract_use_the_same_choice(self) -> None:
        skill = (SKILL_ROOT / "SKILL.md").read_text(encoding="utf-8")
        contract = (SKILL_ROOT / "references" / "scanner-contract.md").read_text(encoding="utf-8")
        for document in (skill, contract):
            self.assertIn(CHOOSE_RULE, document)
            self.assertIn("`other-card.json`", document)
        self.assertNotIn(
            "(`a2a-card.json` or `a2a-v1-card.json`, `mcp-metadata.json`, or `oas.json`)",
            skill,
        )
        self.assertNotIn(
            "For `agent`, every required A2A v0.3 field has a row",
            skill,
        )
        self.assertNotIn(
            "If a required field is missing, print FAILED and do not upload that object.",
            skill,
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
