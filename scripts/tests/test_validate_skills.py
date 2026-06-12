"""Tests for the skill validator (validate_skills.py).

RED PHASE (TDD) for W-22498256 — the module under test does NOT exist yet.
These tests are expected to fail at import/collection until step 6 implements
``scripts/build/validate_skills.py``.

Contract assumed (per design.md):
- ``SkillContext`` dataclass: parsed frontmatter + raw content + dir + repo roots.
- ``Violation`` dataclass with at least ``rule`` (rule id, e.g. "R1") and a path.
- ``RULE_REGISTRY``: list of pure functions ``rule_fn(ctx) -> List[Violation]``;
  each function carries a ``rule_id`` attribute ("R1".."R7") so a test can pick it.
- ``main(argv) -> int`` with exit codes 0 (pass) / 1 (violations) / 2 (env error).
- ``MIN_DESCRIPTION_LENGTH == 40``.
- ``build_skill_context(skill_md_path, repo_root) -> SkillContext`` factory and
  ``build_index(repo_root) -> object`` cross-skill/api/mcp index, both consumed
  by the rule functions.
"""
import sys
import textwrap
from pathlib import Path

import pytest

# Mirror test_validate_descriptions.py: add scripts/build to path.
sys.path.insert(0, str(Path(__file__).parent.parent / 'build'))

from validate_skills import (  # noqa: E402  (import after sys.path tweak)
    SkillContext,
    Violation,
    RULE_REGISTRY,
    MIN_DESCRIPTION_LENGTH,
    build_skill_context,
    build_index,
    main,
)


# --------------------------------------------------------------------------- #
# Fixtures / helpers — materialize a minimal repo in tmp_path.
# --------------------------------------------------------------------------- #

def _frontmatter(name: str, description: str) -> str:
    return f"---\nname: {name}\ndescription: {description}\n---\n"


def _write(path: Path, content: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    return path


@pytest.fixture
def repo(tmp_path):
    """A minimal repo root with empty skills/, apis/, mcps/ trees."""
    (tmp_path / 'skills').mkdir()
    (tmp_path / 'apis').mkdir()
    (tmp_path / 'mcps').mkdir()
    return tmp_path


def _add_api(repo_root: Path, slug: str) -> Path:
    d = repo_root / 'apis' / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / 'api.yaml').write_text('openapi: 3.0.0\ninfo:\n  title: X API\n  version: 1.0.0\n')
    return d


def _add_mcp(repo_root: Path, slug: str) -> Path:
    d = repo_root / 'mcps' / slug
    d.mkdir(parents=True, exist_ok=True)
    (d / 'mcp.yaml').write_text('capabilities: {}\n')
    return d


def _add_skill(repo_root: Path, rel_dir: str, name: str, description: str,
               body: str = '', metadata_type: str = None) -> Path:
    """Create skills/<rel_dir>/SKILL.md and optionally a skills-metadata.yaml.

    ``rel_dir`` is relative to skills/, e.g. "deploy-app" or "mule-development/foo".
    ``metadata_type`` writes a skills-metadata.yaml in the skill's OWN dir.
    Returns the SKILL.md path.
    """
    skill_dir = repo_root / 'skills' / rel_dir
    md = skill_dir / 'SKILL.md'
    _write(md, _frontmatter(name, description) + body)
    if metadata_type is not None:
        (skill_dir / 'skills-metadata.yaml').write_text(f'type: {metadata_type}\n')
    return md


def _ctx(repo_root: Path, skill_md: Path) -> SkillContext:
    return build_skill_context(skill_md, repo_root)


def _run_rule(rule_id: str, ctx, index=None):
    """Invoke the single rule function whose ``rule_id`` matches.

    Rules that need the cross-skill index receive it via ctx (the context is
    expected to carry/reference the index); we pass index where the signature
    accepts it by attaching it to the context.
    """
    fn = next(f for f in RULE_REGISTRY if getattr(f, 'rule_id', None) == rule_id)
    if index is not None:
        ctx.index = index
    return fn(ctx)


DESC_OK = 'Deploy an application to CloudHub with rollback support.'  # >40 chars

JTBD_BODY = textwrap.dedent("""\
    ## Step 1: List targets
    Retrieve deployment targets.

    ```yaml
    api: urn:api:test-api
    operation: listResources
    ```
""")

PROSE_BODY = textwrap.dedent("""\
    ## Overview
    A narrative guide with no API calls.

    ## Tips
    Start with the registry.
""")

PROSE_WITH_STEP_HEADERS_BODY = textwrap.dedent("""\
    ## Overview
    Build a Mule app by hand.

    ## Step 1: Create project
    Create a new Mule project in your IDE.

    ## Step 2: Add connector
    Add the HTTP connector — no API block here.
""")


# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #

def test_min_description_length_is_40():
    assert MIN_DESCRIPTION_LENGTH == 40


# --------------------------------------------------------------------------- #
# R1 — name matches directory
# --------------------------------------------------------------------------- #

def test_r1_name_matches_dir_passes(repo):
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    assert _run_rule('R1', _ctx(repo, md)) == []


def test_r1_name_mismatch_fails(repo):
    md = _add_skill(repo, 'deploy-app', 'something-else', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    violations = _run_rule('R1', _ctx(repo, md))
    assert len(violations) == 1
    assert violations[0].rule == 'R1'


# --------------------------------------------------------------------------- #
# R2 — name is kebab-case
# --------------------------------------------------------------------------- #

def test_r2_kebab_case_passes(repo):
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    assert _run_rule('R2', _ctx(repo, md)) == []


@pytest.mark.parametrize('bad_name', ['Bad_Name', 'UPPER', 'deploy_app', 'Deploy-App'])
def test_r2_non_kebab_fails(repo, bad_name):
    # name must equal dir for the context to build the same way; use bad name as dir too.
    md = _add_skill(repo, bad_name, bad_name, DESC_OK, JTBD_BODY, metadata_type='jtbd')
    violations = _run_rule('R2', _ctx(repo, md))
    assert any(v.rule == 'R2' for v in violations)


# --------------------------------------------------------------------------- #
# R3 — uniqueness (slug and case-insensitive name), naming BOTH paths
# --------------------------------------------------------------------------- #

def test_r3_unique_passes(repo):
    _add_skill(repo, 'alpha', 'alpha', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    _add_skill(repo, 'beta', 'beta', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    index = build_index(repo)
    md = repo / 'skills' / 'alpha' / 'SKILL.md'
    assert _run_rule('R3', _ctx(repo, md), index=index) == []


def test_r3_duplicate_slug_fails_naming_both(repo):
    # Same directory slug under two different categories -> slug collision.
    _add_skill(repo, 'cat-a/dup', 'dup-a', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    _add_skill(repo, 'cat-b/dup', 'dup-b', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    index = build_index(repo)
    md = repo / 'skills' / 'cat-a' / 'dup' / 'SKILL.md'
    violations = _run_rule('R3', _ctx(repo, md), index=index)
    assert any(v.rule == 'R3' for v in violations)
    # Both offending paths must be named in the message.
    msg = ' '.join(v.message for v in violations)
    assert 'cat-a' in msg and 'cat-b' in msg


def test_r3_duplicate_name_case_insensitive_fails_naming_both(repo):
    _add_skill(repo, 'first', 'deploy-app', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    _add_skill(repo, 'second', 'Deploy-App', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    index = build_index(repo)
    md = repo / 'skills' / 'first' / 'SKILL.md'
    violations = _run_rule('R3', _ctx(repo, md), index=index)
    assert any(v.rule == 'R3' for v in violations)
    msg = ' '.join(v.message for v in violations)
    assert 'first' in msg and 'second' in msg


def test_r3_slug_vs_name_collisions_are_distinguishable(repo):
    # Two skills in DIFFERENT dirs (no slug clash) whose frontmatter NAME collides.
    # The reported message must identify this as a NAME collision, distinct from a slug clash.
    _add_skill(repo, 'first', 'deploy-app', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    _add_skill(repo, 'second', 'deploy-app', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    index = build_index(repo)
    md = repo / 'skills' / 'first' / 'SKILL.md'
    violations = _run_rule('R3', _ctx(repo, md), index=index)
    assert any(v.rule == 'R3' for v in violations)
    msg = ' '.join(v.message for v in violations).lower()
    # Distinguishable: a name collision says "name", not "slug".
    assert 'name' in msg and 'slug' not in msg


# --------------------------------------------------------------------------- #
# R4 — required metadata + min-length boundary (39 fail / 40 pass)
# --------------------------------------------------------------------------- #

def test_r4_valid_metadata_passes(repo):
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    assert _run_rule('R4', _ctx(repo, md)) == []


def test_r4_missing_name_fails(repo):
    skill_dir = repo / 'skills' / 'deploy-app'
    _write(skill_dir / 'SKILL.md', f'---\ndescription: {DESC_OK}\n---\n' + JTBD_BODY)
    (skill_dir / 'skills-metadata.yaml').write_text('type: jtbd\n')
    md = skill_dir / 'SKILL.md'
    assert any(v.rule == 'R4' for v in _run_rule('R4', _ctx(repo, md)))


def test_r4_missing_description_fails(repo):
    skill_dir = repo / 'skills' / 'deploy-app'
    _write(skill_dir / 'SKILL.md', '---\nname: deploy-app\n---\n' + JTBD_BODY)
    (skill_dir / 'skills-metadata.yaml').write_text('type: jtbd\n')
    md = skill_dir / 'SKILL.md'
    assert any(v.rule == 'R4' for v in _run_rule('R4', _ctx(repo, md)))


def test_r4_description_39_chars_fails(repo):
    desc_39 = 'x' * 39
    md = _add_skill(repo, 'deploy-app', 'deploy-app', desc_39, JTBD_BODY, metadata_type='jtbd')
    assert any(v.rule == 'R4' for v in _run_rule('R4', _ctx(repo, md)))


def test_r4_description_40_chars_passes(repo):
    desc_40 = 'x' * 40
    md = _add_skill(repo, 'deploy-app', 'deploy-app', desc_40, JTBD_BODY, metadata_type='jtbd')
    assert _run_rule('R4', _ctx(repo, md)) == []


# --------------------------------------------------------------------------- #
# R5 — cross-references resolve; refs inside fenced code blocks are ignored
# --------------------------------------------------------------------------- #

def test_r5_resolvable_refs_pass(repo):
    _add_api(repo, 'test-api')
    _add_mcp(repo, 'test-mcp')
    _add_skill(repo, 'other-skill', 'other-skill', DESC_OK, PROSE_BODY, metadata_type='prose')
    body = textwrap.dedent("""\
        ## Overview
        See urn:api:test-api and urn:mcp:test-mcp and skill other-skill.
    """)
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, body, metadata_type='prose')
    index = build_index(repo)
    assert _run_rule('R5', _ctx(repo, md), index=index) == []


def test_r5_dead_api_ref_fails(repo):
    body = '## Overview\nReferences urn:api:does-not-exist here.\n'
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, body, metadata_type='prose')
    index = build_index(repo)
    violations = _run_rule('R5', _ctx(repo, md), index=index)
    assert any(v.rule == 'R5' for v in violations)
    assert 'does-not-exist' in ' '.join(v.message for v in violations)


def test_r5_dead_ref_inside_code_fence_is_ignored(repo):
    body = textwrap.dedent("""\
        ## Overview
        Here is an illustrative snippet:

        ```yaml
        api: urn:api:ghost-api
        ```
    """)
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, body, metadata_type='prose')
    index = build_index(repo)
    assert _run_rule('R5', _ctx(repo, md), index=index) == []


def test_r5_same_ref_outside_fence_fails(repo):
    body = textwrap.dedent("""\
        ## Overview
        This real reference is dead: urn:api:ghost-api.

        ```yaml
        api: urn:api:ghost-api
        ```
    """)
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, body, metadata_type='prose')
    index = build_index(repo)
    violations = _run_rule('R5', _ctx(repo, md), index=index)
    assert any(v.rule == 'R5' for v in violations)
    assert 'ghost-api' in ' '.join(v.message for v in violations)


def test_r5_dead_mcp_ref_fails(repo):
    # urn:mcp: resolution is validated NOWHERE today — a broken MCP resolver must be caught.
    _add_api(repo, 'test-api')  # api exists; only the mcp ref is dead
    body = '## Overview\nUses the server urn:mcp:ghost-mcp for assets.\n'
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, body, metadata_type='prose')
    index = build_index(repo)
    violations = _run_rule('R5', _ctx(repo, md), index=index)
    assert any(v.rule == 'R5' for v in violations)
    assert 'ghost-mcp' in ' '.join(v.message for v in violations)


def test_r5_dead_skill_link_fails(repo):
    # Inter-skill link resolution is validated NOWHERE today — broken skill links must be caught.
    body = '## Overview\nSee the companion skill ghost-skill for follow-up.\n'
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, body, metadata_type='prose')
    index = build_index(repo)
    violations = _run_rule('R5', _ctx(repo, md), index=index)
    assert any(v.rule == 'R5' for v in violations)
    assert 'ghost-skill' in ' '.join(v.message for v in violations)


# --------------------------------------------------------------------------- #
# R6 — skill type must resolve (own dir -> parent dir)
# --------------------------------------------------------------------------- #

def test_r6_no_metadata_anywhere_fails(repo):
    # No skills-metadata.yaml in own dir nor parent (skills/).
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, JTBD_BODY, metadata_type=None)
    assert any(v.rule == 'R6' for v in _run_rule('R6', _ctx(repo, md)))


def test_r6_parent_default_passes(repo):
    # Parent-dir default (top-level skills/skills-metadata.yaml) covers the skill.
    (repo / 'skills' / 'skills-metadata.yaml').write_text('type: jtbd\n')
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, JTBD_BODY, metadata_type=None)
    assert _run_rule('R6', _ctx(repo, md)) == []


# --------------------------------------------------------------------------- #
# R7 — type/structure coherence (keyed on presence of api: YAML blocks)
# --------------------------------------------------------------------------- #

def test_r7_jtbd_with_api_block_passes(repo):
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, JTBD_BODY, metadata_type='jtbd')
    assert _run_rule('R7', _ctx(repo, md)) == []


def test_r7_jtbd_without_api_block_fails(repo):
    md = _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, PROSE_BODY, metadata_type='jtbd')
    assert any(v.rule == 'R7' for v in _run_rule('R7', _ctx(repo, md)))


def test_r7_prose_with_api_block_fails(repo):
    md = _add_skill(repo, 'guide', 'guide', DESC_OK, JTBD_BODY, metadata_type='prose')
    assert any(v.rule == 'R7' for v in _run_rule('R7', _ctx(repo, md)))


def test_r7_prose_with_step_headers_no_api_block_passes(repo):
    # The critical false-fail guard: ## Step N: headers but NO api: block -> prose OK.
    md = _add_skill(repo, 'build-mule-app', 'build-mule-app', DESC_OK,
                    PROSE_WITH_STEP_HEADERS_BODY, metadata_type='prose')
    assert _run_rule('R7', _ctx(repo, md)) == []


# --------------------------------------------------------------------------- #
# main() exit codes
# --------------------------------------------------------------------------- #

def test_main_clean_tree_exits_zero(repo):
    _add_api(repo, 'test-api')
    (repo / 'skills' / 'skills-metadata.yaml').write_text('type: jtbd\n')
    _add_skill(repo, 'deploy-app', 'deploy-app', DESC_OK, JTBD_BODY, metadata_type=None)
    assert main(['--repo-root', str(repo)]) == 0


def test_main_with_violation_exits_one(repo):
    (repo / 'skills' / 'skills-metadata.yaml').write_text('type: jtbd\n')
    # name != dir -> R1 violation.
    _add_skill(repo, 'deploy-app', 'WRONG', DESC_OK, JTBD_BODY, metadata_type=None)
    assert main(['--repo-root', str(repo)]) == 1


# --------------------------------------------------------------------------- #
# Input safety — malformed / absent frontmatter must error cleanly, not crash.
# The validator must turn bad input into a reported Violation, never a stack trace.
# (Rule id "R4" — required-metadata — owns the "can't read metadata" failure.)
# --------------------------------------------------------------------------- #

def test_malformed_frontmatter_reports_violation_no_crash(repo):
    skill_dir = repo / 'skills' / 'broken'
    # Unparseable YAML frontmatter (unclosed flow sequence).
    _write(skill_dir / 'SKILL.md', '---\nname: [unclosed\ndescription: oops\n---\n' + PROSE_BODY)
    (skill_dir / 'skills-metadata.yaml').write_text('type: prose\n')
    md = skill_dir / 'SKILL.md'
    # MUST NOT raise — building the context and running R4 should yield a clean violation.
    ctx = _ctx(repo, md)
    violations = _run_rule('R4', ctx)
    assert any(v.rule == 'R4' for v in violations)


def test_absent_frontmatter_reports_violation_no_crash(repo):
    skill_dir = repo / 'skills' / 'no-fm'
    # No frontmatter block at all — just body content.
    _write(skill_dir / 'SKILL.md', PROSE_BODY)
    (skill_dir / 'skills-metadata.yaml').write_text('type: prose\n')
    md = skill_dir / 'SKILL.md'
    ctx = _ctx(repo, md)
    violations = _run_rule('R4', ctx)
    assert any(v.rule == 'R4' for v in violations)


def test_main_with_malformed_frontmatter_exits_one_no_crash(repo):
    (repo / 'skills' / 'skills-metadata.yaml').write_text('type: prose\n')
    skill_dir = repo / 'skills' / 'broken'
    _write(skill_dir / 'SKILL.md', '---\nname: [unclosed\n---\n' + PROSE_BODY)
    # End-to-end: a malformed skill must make main() exit 1, never raise.
    assert main(['--repo-root', str(repo)]) == 1


# --------------------------------------------------------------------------- #
# R10 green-baseline AC guard — all shipping skills pass over the REAL repo tree.
# RED-PHASE NOTE: this fails today for TWO reasons — (1) validate_skills.py does
# not exist yet, and (2) skills/skills-metadata.yaml has not been added (task 3).
# It goes GREEN only after task 3 + the validator implementation. It is the
# executable form of the R10 acceptance criterion ("all 22 existing skills pass").
# --------------------------------------------------------------------------- #

def _find_repo_root() -> Path:
    """Walk up from this test file to the worktree root (contains skills/)."""
    for parent in Path(__file__).resolve().parents:
        if (parent / 'skills').is_dir() and (parent / 'apis').is_dir():
            return parent
    return Path(__file__).resolve().parents[2]


def test_r10_real_skills_tree_passes_green_baseline():
    repo_root = _find_repo_root()
    skills_dir = repo_root / 'skills'
    if not skills_dir.is_dir():
        pytest.skip('skills/ not found from this checkout; cannot run green-baseline')
    # All shipping skills must pass once skills-metadata.yaml exists (R10 AC).
    assert main(['--repo-root', str(repo_root)]) == 0
