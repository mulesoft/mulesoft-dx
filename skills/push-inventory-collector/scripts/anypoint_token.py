"""Anypoint token mint used by generated collectors (copy into the script).

Two backward-compatible modes, one selected per run:

* connected-app — POST /accounts/api/v2/oauth2/token as form-urlencoded
  grant_type=client_credentials
* username-password — POST /accounts/login as JSON {"username","password"}

Do not probe the other mode after a 401. Do not log secrets.
"""

from __future__ import annotations

import json
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

CONNECTED_APP = "connected-app"
USERNAME_PASSWORD = "username-password"
TOKEN_PATH_CONNECTED_APP = "/accounts/api/v2/oauth2/token"
TOKEN_PATH_USER_PASSWORD = "/accounts/login"


def infer_anypoint_auth_mode(
    mode: str,
    client_id: str,
    client_secret: str,
    username: str,
    password: str,
) -> str:
    """Return connected-app or username-password. Raise ValueError if mixed/empty."""
    selected = (mode or "").strip().lower()
    has_app = bool(client_id and client_secret)
    has_user = bool(username and password)
    if selected in {CONNECTED_APP, USERNAME_PASSWORD}:
        if selected == CONNECTED_APP and not has_app:
            raise ValueError(
                "ANYPOINT_AUTH_MODE=connected-app requires ANYPOINT_CLIENT_ID and ANYPOINT_CLIENT_SECRET"
            )
        if selected == USERNAME_PASSWORD and not has_user:
            raise ValueError(
                "ANYPOINT_AUTH_MODE=username-password requires ANYPOINT_USERNAME and ANYPOINT_PASSWORD"
            )
        if selected == CONNECTED_APP and has_user:
            raise ValueError(
                "connected-app selected; leave ANYPOINT_USERNAME and ANYPOINT_PASSWORD empty"
            )
        if selected == USERNAME_PASSWORD and has_app:
            raise ValueError(
                "username-password selected; leave ANYPOINT_CLIENT_ID and ANYPOINT_CLIENT_SECRET empty"
            )
        return selected
    if has_app and not has_user:
        return CONNECTED_APP
    if has_user and not has_app:
        return USERNAME_PASSWORD
    raise ValueError(
        "set ANYPOINT_AUTH_MODE to connected-app or username-password, "
        "and supply exactly one credential pair"
    )


def mint_anypoint_token(
    base: str,
    mode: str,
    client_id: str = "",
    client_secret: str = "",
    username: str = "",
    password: str = "",
    opener=None,
) -> str:
    """Return access_token. `opener` is urlopen (injectable in tests)."""
    if opener is None:
        opener = urlopen
    host = (base or "").rstrip("/")
    if not host:
        raise ValueError("ANYPOINT_BASE is required")
    selected = infer_anypoint_auth_mode(mode, client_id, client_secret, username, password)
    if selected == CONNECTED_APP:
        body = (
            "grant_type=client_credentials"
            f"&client_id={quote(client_id, safe='')}"
            f"&client_secret={quote(client_secret, safe='')}"
        ).encode()
        req = Request(
            f"{host}{TOKEN_PATH_CONNECTED_APP}",
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
    else:
        body = json.dumps({"username": username, "password": password}).encode()
        req = Request(
            f"{host}{TOKEN_PATH_USER_PASSWORD}",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
    try:
        with opener(req) as resp:
            payload = json.loads(resp.read().decode())
    except HTTPError as exc:
        raise RuntimeError(f"anypoint-login HTTP {exc.code} path={req.full_url}") from exc
    token = payload.get("access_token")
    if not token:
        raise RuntimeError("anypoint-login response missing access_token")
    return token


def zip_within_caps(zip_bytes: bytes, entry_sizes: list[int]) -> None:
    """Refuse a ZIP over 12 MB or an entry over 5 MB."""
    if len(zip_bytes) > 12 * 1024 * 1024:
        raise ValueError("ZIP exceeds 12 MB cap")
    if any(size > 5 * 1024 * 1024 for size in entry_sizes):
        raise ValueError("ZIP entry exceeds 5 MB cap")

