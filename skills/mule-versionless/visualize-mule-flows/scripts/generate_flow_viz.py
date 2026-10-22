#!/usr/bin/env python3
"""Generate a self-contained HTML visualization of a Mule app's flows.

Parses every ``src/main/mule/*.xml`` file in a Mule project into a step/branch
tree (the same shape the dx-ui-storyboard mule-flow-visualizer renders) and
injects it as JSON into a self-contained HTML template. The template renders the
flows with React + CSS — stacked component cards with vertical connectors and
nested branch columns for choice/foreach/try/etc. — plus a left-hand file
explorer of src/main/mule.

Usage:
    python3 generate_flow_viz.py <app-dir-or-mule-dir> [-o output.html]

``<app-dir-or-mule-dir>`` may be the project root (we look for ``src/main/mule``)
or a directory that already contains the ``*.xml`` flow files.

Run with ``python3 -I`` when the target path is untrusted; the script imports
nothing from the working directory.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

DOC_NS = "http://www.mulesoft.org/schema/mule/documentation"

# Known Mule namespace URIs -> short prefix. Core maps to "" (no prefix shown).
NS_PREFIX = {
    "http://www.mulesoft.org/schema/mule/core": "",
    "http://www.mulesoft.org/schema/mule/documentation": "doc",
    "http://www.mulesoft.org/schema/mule/ee/core": "ee",
    "http://www.mulesoft.org/schema/mule/http": "http",
    "http://www.mulesoft.org/schema/mule/mule-apikit": "apikit",
    "http://www.mulesoft.org/schema/mule/scripting": "scripting",
}

# Scopes whose children are *branch containers* laid out as parallel columns.
BRANCHING = {"choice", "scatter-gather", "round-robin", "first-successful"}
# Scopes with a single sequential body (rendered as one labeled column).
SINGLE_SCOPE = {"foreach", "parallel-foreach", "async", "until-successful"}
# Error handling, handled specially below.
ERROR_SCOPES = {"error-handler", "on-error-continue", "on-error-propagate"}
SCOPE_ALL = BRANCHING | SINGLE_SCOPE | {"try"} | ERROR_SCOPES

# Branch-container local names that live inside a BRANCHING scope.
BRANCH_CHILDREN = {"when", "otherwise", "route"}

HUMAN = {
    "choice": "Choice",
    "when": "When",
    "otherwise": "Otherwise",
    "foreach": "For Each",
    "parallel-foreach": "Parallel For Each",
    "async": "Async",
    "try": "Try",
    "until-successful": "Until Successful",
    "scatter-gather": "Scatter-Gather",
    "round-robin": "Round Robin",
    "first-successful": "First Successful",
    "route": "Route",
    "error-handler": "Error Handler",
    "on-error-continue": "On Error Continue",
    "on-error-propagate": "On Error Propagate",
}

# Component card accent colors (colored icon square).
COLORS = {
    "trigger": "#4CAF50",     # green  — listeners / schedulers
    "connector": "#00A1E0",   # blue   — *:request, db, salesforce, ...
    "transform": "#FF9800",   # orange — ee:transform, set-payload
    "variable": "#F5A623",    # amber  — set/remove variable
    "logger": "#795548",      # brown  — logger
    "ref": "#607D8B",         # slate  — flow-ref
    "router": "#9C27B0",      # purple — apikit:router
    "choice": "#9C27B0",      # purple — choice header
    "scope": "#00897B",       # teal   — foreach/async/try/scatter headers
    "error": "#E53935",       # red    — error handlers
    "default": "#9B9B9B",
}

# Branch pill colors keyed by branch type.
BRANCH_COLORS = {
    "when": "#2196F3",
    "otherwise": "#FF9800",
    "route": "#00897B",
    "scope": "#9C27B0",
    "error": "#E53935",
}

TOP_LEVEL = {"flow", "sub-flow", "error-handler"}


def guess_prefix(uri: str) -> str:
    seg = uri.rstrip("/").split("/")[-1]
    return "" if seg == "core" else seg


def split_tag(tag) -> tuple[str, str]:
    if isinstance(tag, str) and tag.startswith("{"):
        uri, local = tag[1:].split("}", 1)
        prefix = NS_PREFIX.get(uri)
        if prefix is None:
            prefix = guess_prefix(uri)
        return prefix, local
    return "", tag


def kind_of(elem: ET.Element) -> str:
    prefix, local = split_tag(elem.tag)
    return f"{prefix}:{local}" if prefix else local


def local_of(elem: ET.Element) -> str:
    return split_tag(elem.tag)[1]


def doc_name(elem: ET.Element):
    return elem.get(f"{{{DOC_NS}}}name")


def doc_desc(elem: ET.Element):
    return elem.get(f"{{{DOC_NS}}}description")


def is_step(child) -> bool:
    if not isinstance(child.tag, str):  # comment / PI
        return False
    return split_tag(child.tag)[0] != "doc"


def step_children(elem: ET.Element):
    return [c for c in list(elem) if is_step(c)]


def truncate(text, limit: int = 160) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


# Matches a single identifier-like token (camelCase / PascalCase / snake / digits).
_IDENTIFIER = re.compile(r"[A-Za-z][A-Za-z0-9_]*")
# Splits a camelCase / PascalCase token into its constituent words.
_CAMEL = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+")


def _cap_first_alpha(word: str) -> str:
    """Capitalize the first alphabetic character of a word, leaving the rest."""
    for i, ch in enumerate(word):
        if ch.isalpha():
            return word[:i] + ch.upper() + word[i + 1:]
        if ch.isdigit():
            return word
    return word


def proper_case(text: str) -> str:
    """Proper-case a node header without mangling identifiers or acronyms.

    - A lone identifier (``moduleName``, ``common_fields``) is split on
      camelCase / snake boundaries and each word capitalized -> ``Module Name``.
    - A multi-word title only capitalizes words that contain no uppercase of
      their own, so acronyms (``PII``, ``JSON``) and embedded identifiers
      (``vars.commonResponseStatusFields``) are preserved verbatim.
    """
    text = " ".join((text or "").split())
    if not text:
        return text
    if _IDENTIFIER.fullmatch(text):
        parts = _CAMEL.findall(text) or [text]
        return " ".join(p[:1].upper() + p[1:] for p in parts)
    return " ".join(
        w if any(c.isupper() for c in w) else _cap_first_alpha(w)
        for w in text.split(" ")
    )


def category_of(kind: str) -> str:
    local = kind.split(":")[-1]
    if local in ("listener", "scheduler"):
        return "trigger"
    if local == "request":
        return "connector"
    if local in ("transform", "set-payload"):
        return "transform"
    if local in ("set-variable", "remove-variable"):
        return "variable"
    if local == "logger":
        return "logger"
    if local == "flow-ref":
        return "ref"
    if local == "router":
        return "router"
    if local == "choice":
        return "choice"
    if local in ERROR_SCOPES:
        return "error"
    if local in SCOPE_ALL:
        return "scope"
    return "default"


def label_of(elem: ET.Element) -> str:
    name = doc_name(elem)
    if name:
        return name
    local = local_of(elem)
    return HUMAN.get(local, kind_of(elem))


def details_of(elem: ET.Element) -> dict:
    local = local_of(elem)
    g = elem.get
    if local in ("listener",):
        return _clean({"Method": g("allowedMethods") or g("method"),
                        "Path": g("path"), "Config": g("config-ref")})
    if local == "request":
        return _clean({"Method": g("method"), "Path": g("path"),
                       "Config": g("config-ref")})
    if local == "set-variable":
        return _clean({"Variable": g("variableName"), "Value": g("value")})
    if local == "set-payload":
        return _clean({"Value": g("value")})
    if local == "logger":
        return _clean({"Level": g("level"), "Message": g("message")})
    if local == "flow-ref":
        return _clean({"Flow": g("name")})
    if local == "router":
        return _clean({"Config": g("config-ref")})
    if local == "foreach":
        return _clean({"Collection": g("collection")})
    return {}


def _clean(d: dict) -> dict:
    return {k: truncate(v) for k, v in d.items() if v not in (None, "")}


def derived_description(elem: ET.Element) -> str:
    """A short human description when doc:description is absent."""
    local = local_of(elem)
    g = elem.get
    if local == "listener":
        return f"{g('allowedMethods') or g('method') or 'ALL'} {g('path') or '/'}"
    if local == "request":
        return f"{g('method') or 'GET'} {g('path') or ''}".strip()
    if local == "set-variable":
        return f"{g('variableName') or ''} = {truncate(g('value') or '', 60)}"
    if local == "flow-ref":
        return f"→ {g('name') or ''}"
    if local == "logger":
        return "Log message"
    return ""


class Ids:
    def __init__(self) -> None:
        self.n = 0

    def next(self) -> str:
        self.n += 1
        return f"s{self.n}"


def make_action(elem: ET.Element, ids: Ids) -> dict:
    kind = kind_of(elem)
    local = local_of(elem)
    category = category_of(kind)
    return {
        "id": ids.next(),
        "type": "trigger" if local in ("listener", "scheduler") else "action",
        "kind": kind,
        "category": category,
        "color": COLORS.get(category, COLORS["default"]),
        "title": proper_case(label_of(elem)),
        "description": doc_desc(elem) or derived_description(elem),
        "details": details_of(elem),
    }


def make_branch(elem: ET.Element, ids: Ids, btype: str, label: str = None) -> dict:
    return {
        "id": ids.next(),
        "type": btype,
        "color": BRANCH_COLORS.get(btype, BRANCH_COLORS["scope"]),
        "label": label or label_of(elem),
        "expression": elem.get("expression") or elem.get("type") or "",
        "description": doc_desc(elem) or "",
        "steps": [parse_step(c, ids) for c in step_children(elem)],
    }


def parse_branches(elem: ET.Element, local: str, ids: Ids) -> list:
    if local in BRANCHING:
        branches = []
        for child in step_children(elem):
            clocal = local_of(child)
            if clocal in BRANCH_CHILDREN:
                btype = clocal if clocal in ("when", "otherwise") else "route"
                label = label_of(child) if clocal != "route" else (
                    doc_name(child) or f"Route {len(branches) + 1}")
                branches.append(make_branch(child, ids, btype, label))
        return branches

    if local == "try":
        branches = []
        body = []
        for child in step_children(elem):
            if local_of(child) == "error-handler":
                for oe in step_children(child):
                    branches.append(make_branch(oe, ids, "error"))
            else:
                body.append(child)
        try_branch = {
            "id": ids.next(), "type": "scope", "color": BRANCH_COLORS["scope"],
            "label": "Try", "expression": "", "description": "",
            "steps": [parse_step(c, ids) for c in body],
        }
        return [try_branch] + branches

    if local == "error-handler":
        return [make_branch(oe, ids, "error") for oe in step_children(elem)]

    # Single-body scope (foreach / async / until-successful / on-error-*).
    btype = "error" if local in ERROR_SCOPES else "scope"
    return [make_branch(elem, ids, btype, label=label_of(elem))]


def parse_step(elem: ET.Element, ids: Ids) -> dict:
    local = local_of(elem)
    kids = step_children(elem)
    if local in SCOPE_ALL and kids:
        kind = kind_of(elem)
        category = category_of(kind)
        return {
            "id": ids.next(),
            "type": "branch",
            "kind": kind,
            "category": category,
            "color": COLORS.get(category, COLORS["default"]),
            "title": proper_case(label_of(elem)),
            "description": doc_desc(elem) or "",
            "details": details_of(elem),
            "branches": parse_branches(elem, local, ids),
        }
    return make_action(elem, ids)


def build_flow(flow_elem: ET.Element) -> dict:
    ids = Ids()
    return {
        "name": flow_elem.get("name") or label_of(flow_elem),
        "type": local_of(flow_elem),
        "description": doc_desc(flow_elem) or "",
        "steps": [parse_step(c, ids) for c in step_children(flow_elem)],
    }


def parse_mule_file(path: Path) -> list:
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError as exc:
        print(f"  ! skipping {path.name}: XML parse error ({exc})", file=sys.stderr)
        return []
    flows = []
    for child in list(root):
        if not isinstance(child.tag, str):
            continue
        local = local_of(child)
        if local in TOP_LEVEL:
            if local == "error-handler" and not step_children(child):
                continue  # a bare ref= handler is not a graph
            flows.append(build_flow(child))
    return flows


def resolve_mule_dir(target: Path) -> Path:
    candidate = target / "src" / "main" / "mule"
    if candidate.is_dir():
        return candidate
    if target.is_dir() and any(target.glob("*.xml")):
        return target
    raise SystemExit(
        f"No Mule flows found: {target} has neither src/main/mule nor *.xml files."
    )


def build_model(mule_dir: Path, app_name: str) -> dict:
    files = []
    for xml_path in sorted(mule_dir.glob("*.xml")):
        flows = parse_mule_file(xml_path)
        if flows:
            files.append({"path": xml_path.name, "flows": flows})
    return {
        "app": app_name,
        "muleDir": str(mule_dir),
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "files": files,
    }


# Libraries inlined into every page (in load order) so the output is fully
# self-contained — no CDN, works offline and inside sandboxed iframes such as
# Claude Desktop artifacts, which only allow a restricted set of script sources.
VENDOR_LIBS = (
    "react.production.min.js",
    "react-dom.production.min.js",
    "htm.js",
)


def build_vendor_scripts(vendor_dir: Path) -> str:
    blocks = []
    for name in VENDOR_LIBS:
        src = (vendor_dir / name).read_text(encoding="utf-8")
        # Guard against an accidental </script> inside a library terminating
        # the inline block early.
        src = src.replace("</script>", "<\\/script>")
        blocks.append(f'<script data-vendor="{name}">\n{src}\n</script>')
    return "\n".join(blocks)


def render_html(model: dict, template_path: Path) -> str:
    template = template_path.read_text(encoding="utf-8")
    data_json = json.dumps(model, ensure_ascii=False).replace("<", "\\u003c")
    vendor_dir = template_path.parent / "vendor"
    vendor_scripts = build_vendor_scripts(vendor_dir)
    return (
        template.replace("__VENDOR_SCRIPTS__", vendor_scripts)
        .replace("__FLOW_DATA__", data_json)
        .replace("__APP_NAME__", model["app"])
        .replace("__GENERATED_AT__", model["generatedAt"])
    )


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", help="Mule project root or a dir of flow XML files")
    parser.add_argument(
        "-o", "--output", default="mule-flow-visualization.html",
        help="output HTML path (default: ./mule-flow-visualization.html)",
    )
    args = parser.parse_args(argv)

    target = Path(args.target).expanduser().resolve()
    mule_dir = resolve_mule_dir(target)
    raw_name = target.name if (target / "src" / "main" / "mule").is_dir() else mule_dir.name
    app_name = proper_case(raw_name.replace("-", " ").replace("_", " "))

    model = build_model(mule_dir, app_name)
    flow_count = sum(len(f["flows"]) for f in model["files"])
    if flow_count == 0:
        raise SystemExit(f"No flows parsed from {mule_dir}.")

    template_path = Path(__file__).resolve().parent.parent / "assets" / "template.html"
    html = render_html(model, template_path)

    out_path = Path(args.output).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html, encoding="utf-8")

    print(f"Parsed {flow_count} flow(s) across {len(model['files'])} file(s) in {mule_dir}")
    for f in model["files"]:
        print(f"  {f['path']}: {', '.join(fl['name'] for fl in f['flows'])}")
    print(f"\nWrote {out_path}")
    print(f"Open it in a browser:  open {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
