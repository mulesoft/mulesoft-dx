"""Choose the agent ZIP artifact the self-managed scanner accepts.

The push API is not A2A-only. ``PushAssetParser`` accepts exactly one of
``a2a-card.json``, ``a2a-v1-card.json``, or ``other-card.json``. A2A v0.3
required keys apply only to ``a2a-card.json``. ``other-card.json`` has no A2A
required keys; the parser still requires one http(s) URL on ``url`` or on
``supportedInterfaces`` / ``supported_interfaces``.

This module is the reference for that choice. It is not shipped to customers.
"""

from __future__ import annotations

import copy
import io
import json
import zipfile
from typing import Any
from urllib.parse import urlparse


class ShapeRefusal(Exception):
    """The agent cannot be uploaded. ``why`` is the customer-facing reason."""

    def __init__(self, why: str) -> None:
        super().__init__(why)
        self.why = why


def is_http_url(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    text = value.strip()
    if not text:
        return False
    try:
        scheme = urlparse(text).scheme
    except ValueError:
        return False
    return scheme.lower() in {"http", "https"}


def _first_interface_http_url(card: dict) -> str | None:
    for key in ("supportedInterfaces", "supported_interfaces"):
        interfaces = card.get(key)
        if not isinstance(interfaces, list):
            continue
        for item in interfaces:
            if not isinstance(item, dict):
                continue
            url = item.get("url")
            if is_http_url(url):
                return url.strip()
    return None


def callable_http_url(card: dict) -> str | None:
    """Same endpoint pick as PushAssetParser.pushHttpEndpoint."""
    url = card.get("url")
    if is_http_url(url):
        return url.strip()
    return _first_interface_http_url(card)


def _nonempty_str(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _string_list(value: Any, minimum: int) -> bool:
    return (
        isinstance(value, list)
        and len(value) >= minimum
        and all(isinstance(item, str) for item in value)
    )


def is_complete_a2a_v03(card: dict) -> bool:
    if not all(
        _nonempty_str(card.get(key))
        for key in ("name", "description", "protocolVersion", "version")
    ):
        return False
    if not is_http_url(card.get("url")):
        return False
    if not isinstance(card.get("capabilities"), dict):
        return False
    if not _string_list(card.get("defaultInputModes"), 1):
        return False
    if not _string_list(card.get("defaultOutputModes"), 1):
        return False
    skills = card.get("skills")
    if not isinstance(skills, list):
        return False
    for skill in skills:
        if not isinstance(skill, dict):
            return False
        if not all(_nonempty_str(skill.get(key)) for key in ("id", "name", "description")):
            return False
        if not _string_list(skill.get("tags"), 0):
            return False
    return True


def _has_top_level_url(card: dict) -> bool:
    url = card.get("url")
    return isinstance(url, str) and bool(url.strip())


# Agent Card properties from agent-fabric a2a_v1.json (1.2609.1). additionalProperties is false.
# A top-level url is not one of them; the parser moves it onto supportedInterfaces before validation.
A2A_V1_PROPERTIES = frozenset(
    {
        "capabilities",
        "defaultInputModes",
        "defaultOutputModes",
        "default_input_modes",
        "default_output_modes",
        "description",
        "documentationUrl",
        "documentation_url",
        "iconUrl",
        "icon_url",
        "name",
        "provider",
        "security",
        "securityRequirements",
        "securitySchemes",
        "security_requirements",
        "security_schemes",
        "signatures",
        "skills",
        "supportedInterfaces",
        "supported_interfaces",
        "version",
    }
)


def is_a2a_v1(card: dict) -> bool:
    if _has_top_level_url(card):
        return False
    extra = set(card) - A2A_V1_PROPERTIES
    if extra:
        return False
    return _first_interface_http_url(card) is not None


def shape_agent_card(card: dict) -> tuple[str, dict]:
    """Return ``(artifact filename, card body)`` or raise ``ShapeRefusal``."""
    if not isinstance(card, dict):
        raise ShapeRefusal("agent card is not a JSON object")
    body = copy.deepcopy(card)
    if is_complete_a2a_v03(body):
        return "a2a-card.json", body
    if is_a2a_v1(body):
        return "a2a-v1-card.json", body
    if callable_http_url(body):
        return "other-card.json", body
    raise ShapeRefusal("agent has no callable HTTP url")


def build_agent_zip(external_id: str, display_name: str, card: dict, description: str = "") -> bytes:
    if not isinstance(external_id, str) or not external_id.strip():
        raise ShapeRefusal("external id is empty")
    if len(external_id) > 255:
        raise ShapeRefusal("external id is longer than 255 characters")
    filename, body = shape_agent_card(card)
    config: dict[str, str] = {"name": display_name, "type": "agent"}
    if description:
        config["description"] = description
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        prefix = f"{external_id}/specification"
        archive.writestr(f"{prefix}/config.json", json.dumps(config))
        archive.writestr(f"{prefix}/{filename}", json.dumps(body))
    return buffer.getvalue()
