#!/usr/bin/env python3
"""
Skill validator (validate_skills.py).

Walks every ``skills/**/SKILL.md`` file and applies the seven submission-time
rules (R1-R7) common to ALL skills, regardless of type. Additive and
complementary to ``validate_jtbd.py`` (which owns JTBD step sequencing and
``operationId`` resolution): this validator owns naming, uniqueness,
required-metadata, cross-reference resolution, skill-type resolvability, and
type/structure coherence.

Rules are a registry of small pure functions (``RULE_REGISTRY``), each taking a
``SkillContext`` and returning a list of ``Violation`` objects. R3 (uniqueness)
and R5 (cross-refs) read from a pre-built index (``build_index``) rather than
re-globbing the filesystem per file.

Discovery (which files count as skills, and how a skill's type resolves) is NOT
re-implemented here: ``iter_skill_files`` and ``_resolve_skill_type`` are
imported from ``portal_generator.discovery`` so the validator and the portal can
never diverge.

Usage:
    python3 scripts/build/validate_skills.py [--repo-root <path>]

Exit codes: 0 (pass) / 1 (violations) / 2 (environment error). Output mirrors
the ``✅/❌`` human-readable style of the sibling validators.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional

# Mirror the tests: make portal_generator importable from scripts/.
_SCRIPTS_DIR = Path(__file__).resolve().parents[1]
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from portal_generator.discovery import (  # noqa: E402
    _resolve_skill_type,
    iter_skill_files,
)

try:
    import yaml  # PyYAML
except ImportError:  # pragma: no cover
    print("ERROR: PyYAML is required. Install with: pip install pyyaml")
    sys.exit(2)


MIN_DESCRIPTION_LENGTH = 40

_KEBAB_RE = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')
_URN_API_RE = re.compile(r'urn:api:([a-z0-9-]+)')
_URN_MCP_RE = re.compile(r'urn:mcp:([a-z0-9-]+)')
# Inter-skill link: the word "skill" followed by a kebab-case slug (>=1 hyphen
# so plain prose like "the skill works" is never matched). Deterministic.
_SKILL_LINK_RE = re.compile(r'\bskill\s+([a-z0-9]+(?:-[a-z0-9]+)+)\b', re.IGNORECASE)
# Fenced code blocks (``` or ~~~), any indentation, any info string.
_FENCE_RE = re.compile(r'^[ \t]*(```|~~~).*?$', re.MULTILINE)


# --------------------------------------------------------------------------- #
# Data model
# --------------------------------------------------------------------------- #

@dataclass
class Violation:
    """A single rule failure. ``rule`` is the rule id ("R1".."R7")."""
    rule: str
    path: str
    message: str

    def __repr__(self) -> str:
        return f"[{self.rule}] {self.path}: {self.message}"


@dataclass
class SkillContext:
    """Everything a rule needs to evaluate one SKILL.md file.

    ``frontmatter`` is the parsed YAML frontmatter (or ``None`` if the block was
    absent or unparseable; ``frontmatter_error`` then carries the reason).
    ``index`` is attached lazily by the driver for index-dependent rules
    (R3, R5); single-file rules ignore it.
    """
    skill_md_path: Path
    repo_root: Path
    skill_dir: Path
    rel_path: str
    body: str
    frontmatter: Optional[Dict]
    frontmatter_error: Optional[str] = None
    index: Optional["SkillIndex"] = None

    @property
    def name(self) -> Optional[str]:
        if not isinstance(self.frontmatter, dict):
            return None
        val = self.frontmatter.get('name')
        return val if isinstance(val, str) else None

    @property
    def description(self) -> Optional[str]:
        if not isinstance(self.frontmatter, dict):
            return None
        val = self.frontmatter.get('description')
        return val if isinstance(val, str) else None


@dataclass
class SkillIndex:
    """Cross-skill / api / mcp index built once over the whole repo."""
    api_slugs: set = field(default_factory=set)
    mcp_slugs: set = field(default_factory=set)
    skill_slugs: set = field(default_factory=set)
    # slug (dir name) -> list of rel paths that resolve to that slug
    slug_to_paths: Dict[str, List[str]] = field(default_factory=dict)
    # lower-cased frontmatter name -> list of rel paths declaring that name
    name_to_paths: Dict[str, List[str]] = field(default_factory=dict)


# --------------------------------------------------------------------------- #
# Frontmatter / body splitting (crash-safe)
# --------------------------------------------------------------------------- #

def _split_frontmatter(raw: str):
    """Return (frontmatter_dict_or_None, error_or_None, body).

    Never raises. Absent frontmatter -> (None, "no frontmatter", whole text).
    Unparseable YAML -> (None, "<reason>", body-after-block).
    """
    if not raw.startswith('---'):
        return None, 'no frontmatter block', raw
    parts = raw.split('---', 2)
    if len(parts) < 3:
        return None, 'malformed frontmatter block', raw
    fm_text, body = parts[1], parts[2]
    try:
        data = yaml.safe_load(fm_text)
    except yaml.YAMLError as e:
        return None, f'unparseable frontmatter YAML: {e}', body
    if data is None:
        return None, 'empty frontmatter block', body
    if not isinstance(data, dict):
        return None, 'frontmatter is not a mapping', body
    return data, None, body


def _strip_code_fences(body: str) -> str:
    """Remove fenced code blocks (``` and ~~~) so refs inside them are ignored."""
    out_lines: List[str] = []
    fence: Optional[str] = None
    for line in body.splitlines():
        stripped = line.lstrip()
        if fence is None:
            if stripped.startswith('```') or stripped.startswith('~~~'):
                fence = '```' if stripped.startswith('```') else '~~~'
                continue
            out_lines.append(line)
        else:
            if stripped.startswith(fence):
                fence = None
            # drop fenced lines entirely
    return '\n'.join(out_lines)


def build_skill_context(skill_md_path, repo_root) -> SkillContext:
    """Build a SkillContext for one SKILL.md. Never raises on bad input."""
    skill_md_path = Path(skill_md_path)
    repo_root = Path(repo_root)
    skill_dir = skill_md_path.parent
    skills_dir = repo_root / 'skills'
    try:
        rel = str(skill_dir.relative_to(skills_dir))
    except ValueError:
        rel = skill_dir.name
    try:
        raw = skill_md_path.read_text(encoding='utf-8')
    except OSError as e:
        return SkillContext(
            skill_md_path=skill_md_path, repo_root=repo_root, skill_dir=skill_dir,
            rel_path=rel, body='', frontmatter=None,
            frontmatter_error=f'cannot read file: {e}',
        )
    fm, err, body = _split_frontmatter(raw)
    return SkillContext(
        skill_md_path=skill_md_path, repo_root=repo_root, skill_dir=skill_dir,
        rel_path=rel, body=body, frontmatter=fm, frontmatter_error=err,
    )


def build_index(repo_root) -> SkillIndex:
    """Build the cross-skill/api/mcp index over the whole repo."""
    repo_root = Path(repo_root)
    idx = SkillIndex()

    apis_dir = repo_root / 'apis'
    if apis_dir.exists():
        for d in apis_dir.iterdir():
            if d.is_dir() and not d.name.startswith('.'):
                idx.api_slugs.add(d.name)

    mcps_dir = repo_root / 'mcps'
    if mcps_dir.exists():
        for d in mcps_dir.iterdir():
            if d.is_dir() and not d.name.startswith('.'):
                idx.mcp_slugs.add(d.name)

    skills_dir = repo_root / 'skills'
    for skill_md in iter_skill_files(skills_dir):
        skill_dir = skill_md.parent
        slug = skill_dir.name
        rel = str(skill_dir.relative_to(skills_dir))
        idx.skill_slugs.add(slug)
        idx.slug_to_paths.setdefault(slug, []).append(rel)
        ctx = build_skill_context(skill_md, repo_root)
        if ctx.name:
            idx.name_to_paths.setdefault(ctx.name.lower(), []).append(rel)
    return idx


# --------------------------------------------------------------------------- #
# Rules (R1-R7) — pure functions, each carrying a ``rule_id`` attribute.
# --------------------------------------------------------------------------- #

def _rule(rule_id: str):
    def deco(fn: Callable) -> Callable:
        fn.rule_id = rule_id
        return fn
    return deco


@_rule('R1')
def rule_name_matches_dir(ctx: SkillContext) -> List[Violation]:
    """R1 — frontmatter name must equal the containing directory name."""
    name = ctx.name
    if name is None:
        return []  # missing name is R4's concern
    dir_name = ctx.skill_dir.name
    if name != dir_name:
        return [Violation('R1', ctx.rel_path,
                          f"frontmatter name '{name}' does not match "
                          f"directory '{dir_name}'")]
    return []


@_rule('R2')
def rule_name_kebab_case(ctx: SkillContext) -> List[Violation]:
    """R2 — name must be kebab-case (^[a-z0-9]+(-[a-z0-9]+)*$)."""
    name = ctx.name
    if name is None:
        return []  # missing name is R4's concern
    if not _KEBAB_RE.match(name):
        return [Violation('R2', ctx.rel_path,
                          f"name '{name}' is not kebab-case "
                          f"(expected ^[a-z0-9]+(-[a-z0-9]+)*$)")]
    return []


@_rule('R3')
def rule_uniqueness(ctx: SkillContext) -> List[Violation]:
    """R3 — directory slug AND frontmatter name (case-insensitive) must be unique.

    Slug collisions and name collisions are reported distinctly: a name
    collision message says "name", a slug collision says "slug".
    """
    idx = ctx.index
    if idx is None:
        return []
    violations: List[Violation] = []

    slug = ctx.skill_dir.name
    slug_paths = idx.slug_to_paths.get(slug, [])
    if len(slug_paths) > 1:
        others = ', '.join(sorted(slug_paths))
        violations.append(Violation(
            'R3', ctx.rel_path,
            f"duplicate directory slug '{slug}' across paths: {others}"))

    name = ctx.name
    if name is not None:
        name_paths = idx.name_to_paths.get(name.lower(), [])
        if len(name_paths) > 1:
            others = ', '.join(sorted(name_paths))
            violations.append(Violation(
                'R3', ctx.rel_path,
                f"duplicate skill name '{name}' (case-insensitive) "
                f"across paths: {others}"))
    return violations


@_rule('R4')
def rule_required_metadata(ctx: SkillContext) -> List[Violation]:
    """R4 — non-empty name + description; description >= MIN_DESCRIPTION_LENGTH.

    Owns the "can't read metadata" failure: malformed/absent frontmatter is a
    clean R4 violation, never a crash.
    """
    if not isinstance(ctx.frontmatter, dict):
        reason = ctx.frontmatter_error or 'missing or unparseable frontmatter'
        return [Violation('R4', ctx.rel_path,
                          f"cannot read frontmatter metadata: {reason}")]

    violations: List[Violation] = []
    name = ctx.name
    if not name or not name.strip():
        violations.append(Violation('R4', ctx.rel_path,
                                    "frontmatter 'name' is missing or empty"))

    desc = ctx.description
    if not desc or not desc.strip():
        violations.append(Violation('R4', ctx.rel_path,
                                    "frontmatter 'description' is missing or empty"))
    else:
        stripped = desc.strip()
        if len(stripped) < MIN_DESCRIPTION_LENGTH:
            violations.append(Violation(
                'R4', ctx.rel_path,
                f"description must be at least {MIN_DESCRIPTION_LENGTH} "
                f"characters; got {len(stripped)}"))
    return violations


@_rule('R5')
def rule_cross_references(ctx: SkillContext) -> List[Violation]:
    """R5 — every cross-reference must resolve. Refs in code fences are ignored.

    urn:api:<slug> -> apis/<slug>/, urn:mcp:<slug> -> mcps/<slug>/,
    inter-skill link 'skill <slug>' -> skills/**/<slug>/.
    """
    idx = ctx.index
    if idx is None:
        return []

    violations: List[Violation] = []

    # Scan frontmatter (raw) + body-with-fences-stripped.
    fm_text = ''
    if isinstance(ctx.frontmatter, dict):
        try:
            fm_text = yaml.safe_dump(ctx.frontmatter)
        except yaml.YAMLError:
            violations.append(Violation('R5', ctx.rel_path,
                                        'could not serialize frontmatter for cross-ref scan'))
            fm_text = ''
    scan = fm_text + '\n' + _strip_code_fences(ctx.body)
    own_slug = ctx.skill_dir.name

    for slug in sorted(set(_URN_API_RE.findall(scan))):
        if slug not in idx.api_slugs:
            violations.append(Violation('R5', ctx.rel_path,
                                        f"unresolved API reference urn:api:{slug}"))
    for slug in sorted(set(_URN_MCP_RE.findall(scan))):
        if slug not in idx.mcp_slugs:
            violations.append(Violation('R5', ctx.rel_path,
                                        f"unresolved MCP reference urn:mcp:{slug}"))
    for slug in sorted({m.lower() for m in _SKILL_LINK_RE.findall(scan)}):
        if slug == own_slug:
            continue
        if slug not in idx.skill_slugs:
            violations.append(Violation('R5', ctx.rel_path,
                                        f"unresolved skill link: skill {slug}"))
    return violations


@_rule('R6')
def rule_resolvable_type(ctx: SkillContext) -> List[Violation]:
    """R6 — a skill type must resolve via the portal's hierarchical lookup."""
    skill_type = _resolve_skill_type(ctx.skill_dir)
    if skill_type not in ('prose', 'jtbd'):
        return [Violation('R6', ctx.rel_path,
                          "no resolvable skill type (no skills-metadata.yaml "
                          "with type: prose|jtbd in own or parent dir)")]
    return []


def _has_api_block(body: str) -> bool:
    """True if any fenced YAML block in the body declares an ``api:`` key.

    Keys on ``api:`` YAML step blocks, NOT on ``## Step N:`` headers, so prose
    skills using narrative step headers without api blocks do not false-fail.
    """
    in_fence = False
    fence: Optional[str] = None
    for line in body.splitlines():
        stripped = line.lstrip()
        if not in_fence:
            if stripped.startswith('```') or stripped.startswith('~~~'):
                in_fence = True
                fence = '```' if stripped.startswith('```') else '~~~'
            continue
        if stripped.startswith(fence):
            in_fence = False
            continue
        if re.match(r'^\s*api\s*:\s*\S', line):
            return True
    return False


@_rule('R7')
def rule_type_structure_coherence(ctx: SkillContext) -> List[Violation]:
    """R7 — declared type must match api:-block presence.

    type: jtbd MUST contain >=1 api: YAML block; type: prose MUST NOT.
    """
    skill_type = _resolve_skill_type(ctx.skill_dir)
    if skill_type not in ('prose', 'jtbd'):
        return []  # R6 owns unresolved-type failures
    has_api = _has_api_block(ctx.body)
    if skill_type == 'jtbd' and not has_api:
        return [Violation('R7', ctx.rel_path,
                          "type 'jtbd' but no api: YAML step block found")]
    if skill_type == 'prose' and has_api:
        return [Violation('R7', ctx.rel_path,
                          "type 'prose' but an api: YAML step block is present")]
    return []


RULE_REGISTRY: List[Callable] = [
    rule_name_matches_dir,
    rule_name_kebab_case,
    rule_uniqueness,
    rule_required_metadata,
    rule_cross_references,
    rule_resolvable_type,
    rule_type_structure_coherence,
]


# --------------------------------------------------------------------------- #
# Driver / CLI
# --------------------------------------------------------------------------- #

def discover_skills_files(repo_root: Path) -> List[Path]:
    """All SKILL.md files under the repo's skills/ tree (shared with portal)."""
    return iter_skill_files(Path(repo_root) / 'skills')


def validate_skill(ctx: SkillContext) -> List[Violation]:
    """Run every rule over one skill context."""
    violations: List[Violation] = []
    for fn in RULE_REGISTRY:
        violations.extend(fn(ctx))
    return violations


def main(argv: List[str]) -> int:
    parser = argparse.ArgumentParser(description="Validate skills/**/SKILL.md files.")
    parser.add_argument('--repo-root', default=None,
                        help="Repo root (defaults to inferred from script location).")
    # Tolerate being called as main(sys.argv) (argv[0] is the program name).
    args, _unknown = parser.parse_known_args(argv)

    if args.repo_root:
        repo_root = Path(args.repo_root).resolve()
    else:
        repo_root = Path(__file__).resolve().parents[2]

    skills_dir = repo_root / 'skills'
    if not skills_dir.exists():
        print(f"ERROR: skills/ directory not found at {skills_dir}")
        return 2

    skill_files = discover_skills_files(repo_root)
    if not skill_files:
        print("No skills/**/SKILL.md files found — nothing to validate.")
        return 0

    index = build_index(repo_root)

    print(f"Validating {len(skill_files)} skill(s)...")
    print("=" * 60)

    total_violations = 0
    failed_files = 0
    for skill_md in skill_files:
        ctx = build_skill_context(skill_md, repo_root)
        ctx.index = index
        violations = validate_skill(ctx)
        rel = ctx.rel_path
        if violations:
            failed_files += 1
            total_violations += len(violations)
            print(f"\n❌ {rel}")
            for v in violations:
                print(f"   • {v.rule}: {v.message}")
        else:
            print(f"✅ {rel}")

    print()
    print("=" * 60)
    if total_violations:
        print(f"❌ {total_violations} violation(s) across {failed_files} skill(s)")
        return 1
    print(f"✅ All {len(skill_files)} skill(s) valid")
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
