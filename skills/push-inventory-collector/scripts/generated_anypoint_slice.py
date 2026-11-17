#!/usr/bin/env python3
"""Slice of a generated collector: Anypoint login + create-or-existing.

This is the contract the skill must emit. It is not a full inventory collector.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from anypoint_token import infer_anypoint_auth_mode, mint_anypoint_token
from scanner_create import build_scanner_create_body, match_target_system

ASSET_TYPE = "agent"

HELP_EPILOG = """
Inputs and where to obtain them:
  --anypoint-base / ANYPOINT_BASE: Anypoint host. Scanner path is that host plus /agent-scanner.
  --org / ANYPOINT_ORG_ID: organization id from Exchange or Access Management
  --auth-mode / ANYPOINT_AUTH_MODE: connected-app or username-password
  --config / SCANNER_CONFIGURATION_ID: existing configuration id. Empty creates one.
  --scanner-name / SCANNER_NAME: Name field; used only when creating
  --scanner-description / SCANNER_DESCRIPTION: Description field; optional; create only
  --client-id / ANYPOINT_CLIENT_ID: Connected App Client ID (connected-app)
  Connected App Client Secret: ANYPOINT_CLIENT_SECRET. Never a process argument. No --client-secret.
  --username / ANYPOINT_USERNAME: Anypoint username (username-password)
  Anypoint Password: ANYPOINT_PASSWORD. Never a process argument. No --password.
Caps: 1000 assets per run, 12 MB zip, 5 MB per file, one zip = one asset,
  org-wide default 20000.
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Push inventory collector",
        epilog=HELP_EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--anypoint-base", dest="anypoint_base", default=os.getenv("ANYPOINT_BASE"))
    parser.add_argument("--org", dest="anypoint_org_id", default=os.getenv("ANYPOINT_ORG_ID"))
    parser.add_argument("--auth-mode", dest="anypoint_auth_mode", default=os.getenv("ANYPOINT_AUTH_MODE", ""))
    parser.add_argument("--config", dest="scanner_configuration_id", default=os.getenv("SCANNER_CONFIGURATION_ID", ""))
    parser.add_argument("--scanner-name", dest="scanner_name", default=os.getenv("SCANNER_NAME", ""))
    parser.add_argument(
        "--scanner-description",
        dest="scanner_description",
        default=os.getenv("SCANNER_DESCRIPTION", ""),
    )
    parser.add_argument("--client-id", dest="anypoint_client_id", default=os.getenv("ANYPOINT_CLIENT_ID", ""))
    parser.add_argument("--username", dest="anypoint_username", default=os.getenv("ANYPOINT_USERNAME", ""))
    parser.add_argument("--dry-run", dest="dry_run", action="store_true")
    parser.add_argument("--mint-only", dest="mint_only", action="store_true")
    return parser


def ensure_configuration(token: str, args: argparse.Namespace, target_rows: list[dict]) -> tuple[str, bool]:
    del token  # caller holds the bearer; this slice only builds the create body
    config_id = (args.scanner_configuration_id or "").strip()
    if config_id:
        return config_id, False
    target = match_target_system(ASSET_TYPE, target_rows)
    body = build_scanner_create_body(
        args.scanner_name,
        args.anypoint_org_id,
        target["id"],
        args.scanner_description,
    )
    return body, True


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.dry_run:
        return 0
    mode = infer_anypoint_auth_mode(
        args.anypoint_auth_mode,
        args.anypoint_client_id,
        os.getenv("ANYPOINT_CLIENT_SECRET", ""),
        args.anypoint_username,
        os.getenv("ANYPOINT_PASSWORD", ""),
    )
    if args.mint_only:
        token = mint_anypoint_token(
            args.anypoint_base,
            mode,
            client_id=args.anypoint_client_id,
            client_secret=os.getenv("ANYPOINT_CLIENT_SECRET", ""),
            username=args.anypoint_username,
            password=os.getenv("ANYPOINT_PASSWORD", ""),
        )
        print("ok" if token else "missing")
        return 0
    print(mode)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
