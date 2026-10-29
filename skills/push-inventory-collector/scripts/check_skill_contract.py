#!/usr/bin/env python3
"""Validate push-inventory-collector skill contract (questions, caps, dual auth)."""

from __future__ import annotations

import argparse
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from anypoint_token import (  # noqa: E402
    CONNECTED_APP,
    USERNAME_PASSWORD,
    infer_anypoint_auth_mode,
    mint_anypoint_token,
    zip_within_caps,
)
from retry_policy import (  # noqa: E402
    anypoint_401_action,
    classify_push_status,
    next_complete_after_failure,
    should_retry_transient,
)
from scanner_create import (  # noqa: E402
    build_scanner_create_body,
    match_target_system,
)


def read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8")


class SkillContentTests(unittest.TestCase):
    def setUp(self) -> None:
        self.skill = read("SKILL.md")
        self.contract = read("references/scanner-contract.md")
        self.standard = read("references/generated-script-standard.md")

    def test_config_question_is_first(self) -> None:
        self.assertIn(
            "Do you already have a self-managed scanner configuration id, or should this script create a new scanner and push to it?",
            self.skill,
        )
        self.assertIn("Reply with the configuration id, or with create.", self.skill)
        self.assertIn("Do not tell them to create the scanner in the UI.", self.skill)

    def test_ui_create_fields(self) -> None:
        self.assertIn(
            "What name should the new scanner have? This is the Name field on the Self-managed Scanner page.",
            self.skill,
        )
        self.assertIn(
            "Optional description for the new scanner. Reply skip if none. This is the Description field on the Self-managed Scanner page.",
            self.skill,
        )
        self.assertIn(
            "What service type should this scanner accept? Reply with one of: agent, mcp, or rest-api.",
            self.skill,
        )
        self.assertIn("This is the Service type field on the Self-managed Scanner page.", self.skill)
        self.assertIn('"description": "<SCANNER_DESCRIPTION>"', self.contract)

    def test_anypoint_dual_auth_question(self) -> None:
        self.assertIn(
            "How should this script log in to Anypoint? Reply with connected-app or username-password.",
            self.skill,
        )
        self.assertIn("POST /accounts/login", self.skill)
        self.assertIn("client_credentials", self.skill)
        self.assertIn("/accounts/api/v2/oauth2/token", self.contract)
        self.assertIn("/accounts/login", self.contract)
        self.assertIn("ANYPOINT_USERNAME", self.skill)
        self.assertIn("ANYPOINT_PASSWORD", self.skill)
        self.assertIn("ANYPOINT_AUTH_MODE", self.skill)
        self.assertIn("--username", self.standard)
        self.assertIn("No `--password`", self.standard)
        self.assertNotIn("never asks for an Anypoint username", self.skill.lower())

    def test_caps_explicit_in_skill(self) -> None:
        for needle in (
            "1000",
            "12 MB",
            "5 MB",
            "one zip = one asset",
            "20000",
            "Do not tell the customer the org-wide cap is 10000",
        ):
            self.assertIn(needle, self.skill, needle)
        self.assertIn("org-wide default 20000 (not 10000)", self.skill)
        self.assertIn("Do not tell the customer this is 10000", self.contract)

    def test_retry_and_multi_account_are_required_reading(self) -> None:
        self.assertIn("references/failure-and-retry.md", self.skill)
        self.assertIn("references/multi-account.md", self.skill)
        failure = " ".join(read("references/failure-and-retry.md").split())
        multi = " ".join(read("references/multi-account.md").split())
        self.assertIn("Remint **once** with the **same** `ANYPOINT_AUTH_MODE`", failure)
        self.assertIn("Do not create one scanner per account", multi)
        self.assertIn("aws-cross-account-scanning-enabled", multi)
        skill = " ".join(self.skill.split())
        self.assertIn(
            "Do not tell them to turn on a pull-scanner cross-account feature flag",
            skill,
        )
        self.assertIn("401 after a good token", self.standard)
        self.assertIn("409", self.standard)

    def test_question_order(self) -> None:
        order = [
            "Existing configuration id vs create",
            "Name, only when creating",
            "Description, only when creating",
            "Service type (`agent`, `mcp`, or `rest-api`)",
            "Inventory documentation for that type",
            "Provider authentication documentation",
            "Several provider accounts, only when their docs name more than one",
            "Anypoint login mode",
            "Programming language",
            "Mapping approval",
        ]
        positions = [self.skill.index(item) for item in order]
        self.assertEqual(positions, sorted(positions))


class TokenHelperTests(unittest.TestCase):
    def test_infer_connected_app(self) -> None:
        self.assertEqual(
            infer_anypoint_auth_mode("", "id", "secret", "", ""),
            CONNECTED_APP,
        )
        self.assertEqual(
            infer_anypoint_auth_mode("connected-app", "id", "secret", "", ""),
            CONNECTED_APP,
        )

    def test_infer_username_password(self) -> None:
        self.assertEqual(
            infer_anypoint_auth_mode("", "", "", "user", "pass"),
            USERNAME_PASSWORD,
        )
        self.assertEqual(
            infer_anypoint_auth_mode("username-password", "", "", "user", "pass"),
            USERNAME_PASSWORD,
        )

    def test_infer_rejects_mixed_or_empty(self) -> None:
        with self.assertRaises(ValueError):
            infer_anypoint_auth_mode("", "id", "secret", "user", "pass")
        with self.assertRaises(ValueError):
            infer_anypoint_auth_mode("", "", "", "", "")
        with self.assertRaises(ValueError):
            infer_anypoint_auth_mode("connected-app", "", "", "user", "pass")

    def test_mint_connected_app_is_form_not_json(self) -> None:
        captured = {}

        def opener(req):
            captured["url"] = req.full_url
            captured["content_type"] = req.headers.get("Content-type") or req.headers.get(
                "Content-Type"
            )
            captured["body"] = req.data
            resp = MagicMock()
            resp.read.return_value = b'{"access_token":"tok-app","token_type":"bearer"}'
            resp.__enter__.return_value = resp
            resp.__exit__.return_value = False
            return resp

        token = mint_anypoint_token(
            "https://anypoint.mulesoft.com",
            "connected-app",
            client_id="cid",
            client_secret="csec",
            opener=opener,
        )
        self.assertEqual(token, "tok-app")
        self.assertTrue(captured["url"].endswith("/accounts/api/v2/oauth2/token"))
        self.assertEqual(captured["content_type"], "application/x-www-form-urlencoded")
        self.assertIn(b"grant_type=client_credentials", captured["body"])
        self.assertNotIn(b"{", captured["body"])

    def test_mint_username_password_is_json_login(self) -> None:
        captured = {}

        def opener(req):
            captured["url"] = req.full_url
            captured["content_type"] = req.headers.get("Content-type") or req.headers.get(
                "Content-Type"
            )
            captured["body"] = req.data
            resp = MagicMock()
            resp.read.return_value = b'{"access_token":"tok-user","token_type":"bearer"}'
            resp.__enter__.return_value = resp
            resp.__exit__.return_value = False
            return resp

        token = mint_anypoint_token(
            "https://devx.anypoint.mulesoft.com/",
            "username-password",
            username="demo-user",
            password="demo-pass",
            opener=opener,
        )
        self.assertEqual(token, "tok-user")
        self.assertTrue(captured["url"].endswith("/accounts/login"))
        self.assertNotIn("/oauth2/token", captured["url"])
        self.assertEqual(captured["content_type"], "application/json")
        self.assertEqual(
            json.loads(captured["body"].decode()),
            {"username": "demo-user", "password": "demo-pass"},
        )

    def test_mint_does_not_fallback_on_401(self) -> None:
        def opener(req):
            raise HTTPError(req.full_url, 401, "Unauthorized", hdrs=None, fp=io.BytesIO(b"{}"))

        with self.assertRaises(RuntimeError) as ctx:
            mint_anypoint_token(
                "https://anypoint.mulesoft.com",
                "username-password",
                username="demo-user",
                password="bad",
                opener=opener,
            )
        self.assertIn("401", str(ctx.exception))
        self.assertIn("/accounts/login", str(ctx.exception))

    def test_zip_caps(self) -> None:
        zip_within_caps(b"x" * 100, [100])
        with self.assertRaises(ValueError):
            zip_within_caps(b"x" * (12 * 1024 * 1024 + 1), [1])
        with self.assertRaises(ValueError):
            zip_within_caps(b"ok", [5 * 1024 * 1024 + 1])


class CreateBodyTests(unittest.TestCase):
    def test_matches_ui_fields(self) -> None:
        body = build_scanner_create_body(
            name="Production Account - Marketing",
            description="Add a description…",
            org_id="org-1",
            target_system_id="ts-agent",
        )
        self.assertEqual(body["name"], "Production Account - Marketing")
        self.assertEqual(body["description"], "Add a description…")
        self.assertEqual(body["state"], "STOPPED")
        self.assertEqual(body["connection"]["authScheme"], "customer-upload")
        self.assertNotIn("schedule", body)
        self.assertNotIn("authParameters", body["connection"])

    def test_omits_empty_description(self) -> None:
        body = build_scanner_create_body("N", "org-1", "ts-1", description="  ")
        self.assertNotIn("description", body)

    def test_target_system_match(self) -> None:
        row = match_target_system(
            "mcp",
            [{"id": "1", "type": "PUSH_MCP"}, {"id": "2", "type": "PUSH_AGENT"}],
        )
        self.assertEqual(row["id"], "1")
        with self.assertRaises(ValueError):
            match_target_system("rest-api", [{"id": "1", "type": "PUSH_AGENT"}])

    def test_requires_name(self) -> None:
        with self.assertRaises(ValueError):
            build_scanner_create_body("  ", "org-1", "ts-1")


class GeneratedSliceTests(unittest.TestCase):
    def test_help_lists_caps_and_both_secrets(self) -> None:
        from generated_anypoint_slice import build_parser

        parser = build_parser()
        help_text = parser.format_help()
        for needle in (
            "1000 assets per run",
            "12 MB zip",
            "5 MB per file",
            "one zip = one asset",
            "org-wide default 20000",
            "Connected App Client Secret",
            "ANYPOINT_CLIENT_SECRET",
            "Anypoint Password",
            "ANYPOINT_PASSWORD",
            "--username",
            "--scanner-description",
            "--auth-mode",
        ):
            self.assertIn(needle, help_text, needle)
        self.assertNotIn("--client-secret", parser._option_string_actions)
        self.assertNotIn("--password", parser._option_string_actions)
        self.assertNotIn("--asset-type", parser._option_string_actions)
        self.assertIn("No --client-secret.", help_text)
        self.assertIn("No --password.", help_text)

    def test_existing_config_does_not_create(self) -> None:
        from generated_anypoint_slice import ensure_configuration

        args = argparse.Namespace(
            scanner_configuration_id="cfg-1",
            scanner_name="ignored",
            scanner_description="",
            anypoint_org_id="org-1",
        )
        config_id, created = ensure_configuration("tok", args, [{"id": "ts", "type": "pushagent"}])
        self.assertEqual(config_id, "cfg-1")
        self.assertFalse(created)

    def test_empty_config_builds_ui_create_body(self) -> None:
        from generated_anypoint_slice import ensure_configuration

        args = argparse.Namespace(
            scanner_configuration_id="",
            scanner_name="Production Account - Marketing",
            scanner_description="from UI",
            anypoint_org_id="org-1",
        )
        body, created = ensure_configuration(
            "tok", args, [{"id": "ts-9", "type": "PUSH_AGENT"}]
        )
        self.assertTrue(created)
        self.assertEqual(body["name"], "Production Account - Marketing")
        self.assertEqual(body["description"], "from UI")
        self.assertEqual(body["connection"]["targetSystemId"], "ts-9")
        self.assertEqual(body["connection"]["authScheme"], "customer-upload")

    def test_slice_compiles_and_infers_username_password(self) -> None:
        import os
        import subprocess

        subprocess.run(
            [sys.executable, "-m", "py_compile", str(ROOT / "scripts" / "generated_anypoint_slice.py")],
            check=True,
        )
        env = {
            **os.environ,
            "ANYPOINT_USERNAME": "demo-user",
            "ANYPOINT_PASSWORD": "demo-pass",
        }
        proc = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "generated_anypoint_slice.py"),
                "--anypoint-base",
                "https://example.invalid",
                "--org",
                "org-1",
                "--username",
                "demo-user",
            ],
            env=env,
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(proc.stdout.strip(), "username-password")


class RetryPolicyTests(unittest.TestCase):
    def test_retries_transient_three_times(self) -> None:
        self.assertTrue(should_retry_transient(503, 1))
        self.assertTrue(should_retry_transient(429, 3))
        self.assertFalse(should_retry_transient(503, 4))
        self.assertFalse(should_retry_transient(400, 1))
        self.assertFalse(should_retry_transient(422, 1))
        self.assertFalse(should_retry_transient(415, 1))

    def test_anypoint_401_remints_once(self) -> None:
        self.assertEqual(
            anypoint_401_action(had_successful_token=False, already_reminted=False),
            "fail-auth",
        )
        self.assertEqual(
            anypoint_401_action(had_successful_token=True, already_reminted=False),
            "remint",
        )
        self.assertEqual(
            anypoint_401_action(had_successful_token=True, already_reminted=True),
            "fail-expired",
        )

    def test_classify_push_and_complete(self) -> None:
        self.assertEqual(classify_push_status(202), "success")
        self.assertEqual(classify_push_status(503), "retry")
        self.assertEqual(classify_push_status(401), "remint")
        self.assertEqual(classify_push_status(409), "stale-workspace")
        self.assertEqual(classify_push_status(422), "fail")
        self.assertIsNone(
            next_complete_after_failure(staged=False, first_list_failed=True)
        )
        self.assertFalse(
            next_complete_after_failure(staged=True, first_list_failed=False)
        )


class SchemaTests(unittest.TestCase):
    def test_schemas_parse(self) -> None:
        schema_dir = ROOT / "schemas"
        files = sorted(schema_dir.glob("*.json"))
        self.assertGreaterEqual(len(files), 8)
        for path in files:
            json.loads(path.read_text(encoding="utf-8"))

    def test_evals_cover_new_questions(self) -> None:
        evals_path = ROOT / "evals" / "evals.json"
        if not evals_path.exists():
            self.skipTest("evals live in the customer-push-collector copy")
        data = json.loads(evals_path.read_text(encoding="utf-8"))
        blob = " ".join(
            e.get("prompt", "") + " " + e.get("expected_output", "")
            for e in data["evals"]
        )
        self.assertIn("Reply with the configuration id, or with create", blob)
        self.assertIn("username-password", blob)
        self.assertIn("POST /accounts/login", blob)
        self.assertIn("1000", blob)
        self.assertIn("20000", blob)
        self.assertIn("Self-managed Scanner page", blob)
        ids = [e["id"] for e in data["evals"]]
        self.assertIn(22, ids)
        self.assertIn(25, ids)
        self.assertIn(26, ids)
        self.assertIn(27, ids)
        self.assertIn(28, ids)
        self.assertIn("one scanner per account", blob.lower())
        self.assertIn("503", blob)
        self.assertIn("aws-cross-account-scanning-enabled", blob)


if __name__ == "__main__":
    unittest.main(verbosity=2)
