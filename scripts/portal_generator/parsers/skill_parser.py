"""
Skill parser for SKILL.md files with frontmatter.

Extracts step headings and YAML code blocks with API calls, inputs, and outputs.
"""

import re
from pathlib import Path
from typing import Dict, Any, List

import frontmatter
from markdown_it import MarkdownIt

_md = MarkdownIt().enable('table')

try:
    from ruamel.yaml import YAML
    _yaml = YAML()
    _yaml.preserve_quotes = True
except ImportError:
    _yaml = None


def _extract_yaml_blocks(content: str) -> List[Dict]:
    """Extract YAML code blocks from markdown content and parse them.
    Returns list of parsed YAML dicts (one per ```yaml block)."""
    blocks = []
    # Match fenced yaml code blocks
    pattern = re.compile(r'```ya?ml\s*\n(.*?)```', re.DOTALL)
    for match in pattern.finditer(content):
        raw = match.group(1)
        if _yaml and raw.strip():
            try:
                parsed = _yaml.load(raw)
                if isinstance(parsed, dict) and 'api' in parsed:
                    blocks.append(_convert_to_plain(parsed))
            except Exception:
                pass
    return blocks


_yaml_fence_pattern = re.compile(r'```ya?ml\s*\n.*?```', re.DOTALL)

# Pattern for execution paths: - **Path name**: Steps N, N, N
_exec_path_pattern = re.compile(
    r'^\- \*\*(.+?)\*\*:\s*Steps\s+(.+?)$',
    re.MULTILINE,
)
_entry_point_vars_pattern = re.compile(r'`(\w+)`')

# Patterns for prose blocks that duplicate structured data (inputs table, API call header)
_redundant_prose_patterns = [
    # "**What you'll need:**" followed by a bullet list
    re.compile(r'\*\*What you\'ll need:\*\*\s*\n(?:-\s+.*\n?)*', re.MULTILINE),
    # "**Action:**" single line
    re.compile(r'\*\*Action:\*\*.*\n?', re.MULTILINE),
]


def _strip_redundant_prose(text: str) -> str:
    """Remove prose blocks that duplicate the structured YAML data."""
    for pattern in _redundant_prose_patterns:
        text = pattern.sub('', text)
    return text.strip()


def _extract_entry_points(content: str) -> List[Dict]:
    """Extract structured execution paths from an Execution Paths section.

    Format: - **Path name**: Steps 1, 2, 3
              - When: <condition>
              - You'll need: `var1`, `var2`
    """
    if not content:
        return []
    entry_points = []
    lines = content.split('\n')
    current_ep = None
    for line in lines:
        match = _exec_path_pattern.match(line)
        if match:
            if current_ep:
                entry_points.append(current_ep)
            steps = [
                int(s.strip()) for s in match.group(2).split(',')
                if s.strip().isdigit()
            ]
            current_ep = {
                'name': match.group(1).strip(),
                'step': steps[0] if steps else 1,
                'condition': '',
                'required_vars': [],
                'steps': steps,
            }
        elif current_ep:
            when_match = re.match(r'^\s+-\s+When:\s*(.+)', line, re.IGNORECASE)
            if when_match:
                current_ep['condition'] = when_match.group(1).strip()
            elif "you'll need:" in line.lower():
                current_ep['required_vars'] = _entry_point_vars_pattern.findall(line)
    if current_ep:
        entry_points.append(current_ep)
    return entry_points


def _extract_step_details(content: str) -> List[Dict]:
    """Extract step details including heading, prose, and YAML blocks.
    Splits on ## Step N: headers and extracts each step's content."""
    steps = []
    # Split on step headers, keeping the header text
    parts = re.split(r'^(## Step \d+:.*?)$', content, flags=re.MULTILINE)

    i = 1  # Skip content before first step
    while i < len(parts) - 1:
        header = parts[i].replace('## ', '', 1).strip()
        body = parts[i + 1] if i + 1 < len(parts) else ''

        # Extract YAML block from this step's body
        yaml_blocks = _extract_yaml_blocks(body)
        yaml_data = yaml_blocks[0] if yaml_blocks else None

        # Split prose around the YAML fence block
        fence_match = _yaml_fence_pattern.search(body)
        if fence_match:
            prose_before = _strip_redundant_prose(body[:fence_match.start()])
            raw_after = body[fence_match.end():]
            # Stop prose_after at the next ## heading (e.g. "## Completion Checklist")
            # to avoid bleeding post-workflow sections into the last step
            heading_match = re.search(r'^## ', raw_after, re.MULTILINE)
            if heading_match:
                prose_after = raw_after[:heading_match.start()].strip()
            else:
                prose_after = raw_after.strip()
        else:
            prose_before = _strip_redundant_prose(body)
            prose_after = ''

        steps.append({
            'title': header,
            'yaml': yaml_data,
            'prose_before_html': _md.render(prose_before) if prose_before else '',
            'prose_after_html': _md.render(prose_after) if prose_after else '',
        })
        i += 2

    return steps


def _convert_to_plain(obj):
    """Convert ruamel.yaml types to plain Python for safe rendering."""
    if isinstance(obj, dict):
        return {str(k): _convert_to_plain(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_to_plain(item) for item in obj]
    elif isinstance(obj, bool):
        return bool(obj)
    elif isinstance(obj, int):
        return int(obj)
    elif isinstance(obj, float):
        return float(obj)
    return str(obj) if obj is not None else ''


_related_job_pattern = re.compile(r'^\- \*\*([a-z0-9-]+)\*\*:\s*(.+)$', re.MULTILINE)


def _extract_related_jobs(content: str) -> List[Dict[str, str]]:
    """Extract structured related job entries from markdown list.
    Pattern: - **slug-name**: description text"""
    return [
        {'slug': m.group(1), 'description': m.group(2).strip()}
        for m in _related_job_pattern.finditer(content)
    ]


def _extract_section(content: str, heading: str) -> str:
    """Extract markdown content under a ## heading until the next ## heading."""
    pattern = re.compile(
        rf'^## {re.escape(heading)}\s*\n(.*?)(?=^## |\Z)',
        re.MULTILINE | re.DOTALL
    )
    match = pattern.search(content)
    return match.group(1).strip() if match else ''


def parse_skill(skill_path: Path) -> Dict[str, Any]:
    """Parse SKILL.md with frontmatter and extract step YAML blocks."""
    try:
        # Read raw file content (with frontmatter) for download
        with open(skill_path, 'r', encoding='utf-8') as f:
            raw_content = f.read()

        post = frontmatter.loads(raw_content)

        # Extract step headings
        step_headings = re.findall(r'^## (Step \d+:.*?)$', post.content, re.MULTILINE)

        # Extract detailed step info with YAML blocks
        step_details = _extract_step_details(post.content)

        # Extract overview, prerequisites, and starting point for structured view
        overview = _extract_section(post.content, 'Overview')
        prerequisites = _extract_section(post.content, 'Prerequisites')
        starting_point = _extract_section(post.content, 'Execution Paths')
        entry_points = _extract_entry_points(starting_point)

        # Extract post-workflow sections
        completion_checklist = _extract_section(post.content, 'Completion Checklist')
        what_youve_built = _extract_section(post.content, "What You've Built")
        next_steps = _extract_section(post.content, 'Next Steps')
        tips = _extract_section(post.content, 'Tips and Best Practices')
        troubleshooting = _extract_section(post.content, 'Troubleshooting')
        related_jobs = _extract_section(post.content, 'Related Jobs')
        additional_resources = _extract_section(post.content, 'Additional Resources')

        # Build full display markdown with frontmatter shown as YAML code block
        parts = raw_content.split('---', 2)
        if len(parts) >= 3:
            display_md = f"```yaml\n---\n{parts[1].strip()}\n---\n```\n\n{post.content}"
        else:
            display_md = post.content

        # Tags from frontmatter: accept a YAML list or a comma-separated string.
        raw_tags = post.get('tags')
        tag_names: List[str] = []
        if isinstance(raw_tags, list):
            for t in raw_tags:
                if isinstance(t, dict) and t.get('name'):
                    tag_names.append(str(t['name']))
                elif isinstance(t, str) and t.strip():
                    tag_names.append(t.strip())
        elif isinstance(raw_tags, str):
            tag_names = [p.strip() for p in raw_tags.split(',') if p.strip()]

        return {
            'name': post.get('name', skill_path.parent.name),
            'description': post.get('description', '').strip(),
            'category': (post.get('category') or '').strip() if isinstance(post.get('category'), str) else '',
            'tag_names': tag_names,
            'content': post.content,
            'content_html': _md.render(display_md),
            'raw_content': raw_content,
            'source_path': str(skill_path),
            'overview_html': _md.render(overview) if overview else '',
            'prerequisites_html': _md.render(prerequisites) if prerequisites else '',
            'starting_point_html': _md.render(starting_point) if starting_point else '',
            'entry_points': entry_points,
            'steps': step_headings,
            'step_details': step_details,
            'step_count': len(step_headings),
            'slug': skill_path.parent.name,
            'completion_checklist_html': _md.render(completion_checklist) if completion_checklist else '',
            'what_youve_built_html': _md.render(what_youve_built) if what_youve_built else '',
            'next_steps_html': _md.render(next_steps) if next_steps else '',
            'tips_html': _md.render(tips) if tips else '',
            'troubleshooting_html': _md.render(troubleshooting) if troubleshooting else '',
            'related_jobs_list': _extract_related_jobs(related_jobs) if related_jobs else [],
            'additional_resources_html': _md.render(additional_resources) if additional_resources else '',
        }

    except Exception as e:
        print(f"  ⚠️  Error parsing skill {skill_path}: {e}")
        return None
