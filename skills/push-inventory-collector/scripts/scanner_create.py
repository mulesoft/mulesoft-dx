#!/usr/bin/env python3
"""Build the self-managed scanner create body (same fields as the UI)."""

from __future__ import annotations

from typing import Any, Iterable

ASSET_TYPE_TO_TARGET = {
    "agent": {"pushagent", "push_agent"},
    "mcp": {"pushmcp", "push_mcp"},
    "rest-api": {"pushapi", "push_api"},
}


def _norm(value: str) -> str:
    return (value or "").strip().lower().replace("-", "_")


def match_target_system(asset_type: str, rows: Iterable[dict]) -> dict:
    wanted = ASSET_TYPE_TO_TARGET.get((asset_type or "").strip().lower())
    if not wanted:
        raise ValueError(f"unknown service type {asset_type!r}")
    for row in rows:
        if _norm(str(row.get("type") or "")) in wanted:
            return row
    raise ValueError(
        f"no self-managed target system for service type {asset_type!r}"
    )


def build_scanner_create_body(
    name: str,
    org_id: str,
    target_system_id: str,
    description: str = "",
) -> dict[str, Any]:
    trimmed = (name or "").strip()
    if not trimmed:
        raise ValueError("Name is required (Self-managed Scanner Name field)")
    if not (org_id or "").strip():
        raise ValueError("ANYPOINT_ORG_ID is required")
    if not (target_system_id or "").strip():
        raise ValueError("targetSystemId is required")
    body: dict[str, Any] = {
        "name": trimmed,
        "state": "STOPPED",
        "runPolicy": "{}",
        "notificationEnabled": False,
        "importMode": "ask-for-review",
        "connection": {
            "name": f"{trimmed}-connection",
            "orgId": org_id.strip(),
            "targetSystemId": target_system_id.strip(),
            "authScheme": "customer-upload",
        },
    }
    desc = (description or "").strip()
    if desc:
        body["description"] = desc
    return body
