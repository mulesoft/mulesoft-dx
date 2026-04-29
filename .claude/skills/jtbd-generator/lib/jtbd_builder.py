#!/usr/bin/env python3
"""
JTBD Builder - Assemble complete JTBD markdown files.

Builds JTBD markdown structure including frontmatter, step sections,
and supporting content.
"""

import yaml
from typing import Dict, Any, List, Optional


def build_frontmatter(name: str, description: str) -> str:
    """
    Generate YAML frontmatter section.

    Args:
        name: Job name (kebab-case, max 64 chars)
        description: Job description (max 1024 chars, should include trigger terms)

    Returns:
        Formatted frontmatter string

    Example:
        fm = build_frontmatter(
            "deploy-api-with-flex-gateway",
            "Deploy API instance to Flex Gateway. Use when deploying APIs, setting up gateways."
        )
    """
    frontmatter_data = {
        'name': name,
        'description': description
    }

    yaml_str = yaml.dump(frontmatter_data, default_flow_style=False, allow_unicode=True)

    return f"---\n{yaml_str}---\n"


def build_step_yaml(
    api_urn: str,
    operation_id: str,
    inputs: Dict[str, Any],
    outputs: List[Dict[str, Any]]
) -> str:
    """
    Generate YAML block for a single step.

    Args:
        api_urn: API URN (e.g., 'urn:api:api-manager')
        operation_id: Operation ID
        inputs: Input definitions dict
        outputs: Output definitions list

    Returns:
        Formatted YAML string (for insertion in markdown code fence)

    Example:
        yaml_block = build_step_yaml(
            'urn:api:api-manager',
            'createOrganizationsEnvironmentsApis',
            inputs={'organizationId': {...}},
            outputs=[{'name': 'environmentApiId', ...}]
        )
    """
    step_data = {
        'api': api_urn,
        'operationId': operation_id,
        'inputs': inputs
    }

    if outputs:
        step_data['outputs'] = outputs

    # Use block style for better readability
    yaml_str = yaml.dump(
        step_data,
        default_flow_style=False,
        allow_unicode=True,
        sort_keys=False,
        width=120
    )

    return yaml_str.rstrip()


def build_step_markdown(
    step_number: int,
    step_name: str,
    step_description: str,
    operation_summary: str,
    yaml_block: str,
    what_you_need: List[str] = None,
    what_happens_next: str = None,
    common_issues: List[Dict[str, str]] = None
) -> str:
    """
    Generate complete step section with prose and YAML.

    Args:
        step_number: Step number (1, 2, 3, ...)
        step_name: Step name (e.g., "Create API Instance")
        step_description: Prose explanation of what this step does
        operation_summary: Brief summary of the operation
        yaml_block: YAML block content (from build_step_yaml)
        what_you_need: Optional list of prerequisites for this step
        what_happens_next: Optional explanation of outcomes
        common_issues: Optional list of common issues (dict with 'issue' and 'solution')

    Returns:
        Complete step markdown section

    Example:
        step_md = build_step_markdown(
            1,
            "Create API Instance",
            "Creates a new API instance from an Exchange asset...",
            "Create a new API instance",
            yaml_block,
            what_you_need=["Organization ID", "Environment ID"],
            what_happens_next="You receive an environmentApiId..."
        )
    """
    lines = []

    # Step header
    lines.append(f"## Step {step_number}: {step_name}\n")

    # Description
    lines.append(f"{step_description}\n")

    # What you'll need (optional)
    if what_you_need:
        lines.append("**What you'll need:**")
        for item in what_you_need:
            lines.append(f"- {item}")
        lines.append("")

    # Action
    lines.append(f"**Action:** {operation_summary}\n")

    # YAML block
    lines.append("```yaml")
    lines.append(yaml_block)
    lines.append("```\n")

    # What happens next (optional)
    if what_happens_next:
        lines.append(f"**What happens next:** {what_happens_next}\n")

    # Common issues (optional)
    if common_issues:
        lines.append("**Common issues:**")
        for issue in common_issues:
            lines.append(f"- **{issue['issue']}**: {issue['solution']}")
        lines.append("")

    return "\n".join(lines)


def build_prerequisites_section(prerequisites: List[str]) -> str:
    """
    Build prerequisites section.

    Args:
        prerequisites: List of prerequisite descriptions

    Returns:
        Formatted prerequisites section

    Example:
        prereqs = build_prerequisites_section([
            "User is authenticated with valid Bearer token",
            "API asset exists in Exchange"
        ])
    """
    lines = [
        "## Prerequisites\n",
        "Before starting, ensure you have:\n"
    ]

    for i, prereq in enumerate(prerequisites, 1):
        lines.append(f"{i}. {prereq}")

    lines.append("")

    return "\n".join(lines)


def build_completion_checklist(items: List[str]) -> str:
    """
    Build completion checklist section.

    Args:
        items: List of verification items

    Returns:
        Formatted checklist section

    Example:
        checklist = build_completion_checklist([
            "Asset retrieved from Exchange",
            "Gateway target identified",
            "API instance created"
        ])
    """
    lines = [
        "## Completion Checklist\n"
    ]

    for item in items:
        lines.append(f"- [ ] {item}")

    lines.append("")

    return "\n".join(lines)


def build_complete_jtbd(
    name: str,
    description: str,
    title: str,
    overview: str,
    what_youll_build: str,
    prerequisites: List[str],
    steps: List[Dict[str, Any]],
    completion_items: List[str] = None,
    what_youve_built: str = None,
    next_steps: List[str] = None,
    tips: Dict[str, List[str]] = None,
    troubleshooting: List[Dict[str, Any]] = None,
    related_jobs: List[Dict[str, str]] = None
) -> str:
    """
    Assemble complete JTBD markdown file.

    Args:
        name: Job name (kebab-case)
        description: Job description (for frontmatter)
        title: Human-readable title
        overview: Overview paragraph (action-oriented)
        what_youll_build: Clear outcome statement
        prerequisites: List of prerequisite descriptions
        steps: List of step definitions (each with name, description, yaml_block, etc.)
        completion_items: Optional completion checklist items
        what_youve_built: Optional summary of achievements
        next_steps: Optional list of next step suggestions
        tips: Optional dict of tip categories -> list of tips
        troubleshooting: Optional list of troubleshooting entries
        related_jobs: Optional list of related jobs (dict with 'name' and 'description')

    Returns:
        Complete JTBD markdown string

    Example:
        jtbd = build_complete_jtbd(
            name="deploy-api-with-flex-gateway",
            description="Deploy API instance to Flex Gateway...",
            title="Deploy API with Flex Gateway",
            overview="Deploys an API instance...",
            what_youll_build="An API instance connected to your Flex Gateway",
            prerequisites=["User authenticated", "Asset exists"],
            steps=[...],
            completion_items=["API deployed", "Gateway connected"],
            what_youve_built="✅ API deployment complete",
            next_steps=["Apply policies", "Test API"]
        )
    """
    sections = []

    # 1. Frontmatter
    sections.append(build_frontmatter(name, description))

    # 2. Title
    sections.append(f"# {title}\n")

    # 3. Overview
    sections.append("## Overview\n")
    sections.append(f"{overview}\n")
    sections.append(f"**What you'll build:** {what_youll_build}\n")

    # 4. Prerequisites
    sections.append(build_prerequisites_section(prerequisites))

    # 5. Steps
    for step in steps:
        sections.append(step['markdown'])

    # 6. Completion Checklist
    if completion_items:
        sections.append(build_completion_checklist(completion_items))

    # 7. What You've Built
    if what_youve_built:
        sections.append("## What You've Built\n")
        sections.append(f"{what_youve_built}\n")

    # 8. Next Steps
    if next_steps:
        sections.append("## Next Steps\n")
        for i, step in enumerate(next_steps, 1):
            sections.append(f"{i}. {step}")
        sections.append("")

    # 9. Tips and Best Practices
    if tips:
        sections.append("## Tips and Best Practices\n")
        for category, tip_list in tips.items():
            sections.append(f"### {category}\n")
            for tip in tip_list:
                sections.append(f"- {tip}")
            sections.append("")

    # 10. Troubleshooting
    if troubleshooting:
        sections.append("## Troubleshooting\n")
        for entry in troubleshooting:
            sections.append(f"### {entry['issue']}\n")
            if 'symptoms' in entry:
                sections.append(f"**Symptoms:** {entry['symptoms']}\n")
            if 'causes' in entry:
                sections.append("**Possible causes:**")
                for cause in entry['causes']:
                    sections.append(f"- {cause}")
                sections.append("")
            if 'solutions' in entry:
                sections.append("**Solutions:**")
                for solution in entry['solutions']:
                    sections.append(f"- {solution}")
                sections.append("")

    # 11. Related Jobs
    if related_jobs:
        sections.append("## Related Jobs\n")
        for job in related_jobs:
            sections.append(f"- **{job['name']}**: {job['description']}")
        sections.append("")

    return "\n".join(sections)


def build_minimal_jtbd(
    name: str,
    description: str,
    title: str,
    overview: str,
    prerequisites: List[str],
    steps: List[Dict[str, Any]]
) -> str:
    """
    Build a minimal JTBD with just the essential sections.

    Useful for quick generation where Claude will enhance with prose later.

    Args:
        name: Job name
        description: Job description
        title: Job title
        overview: Overview paragraph
        prerequisites: Prerequisites list
        steps: Step definitions

    Returns:
        Minimal but valid JTBD markdown
    """
    return build_complete_jtbd(
        name=name,
        description=description,
        title=title,
        overview=overview,
        what_youll_build="A complete workflow implementation",
        prerequisites=prerequisites,
        steps=steps
    )


def enhance_step_with_context(
    step: Dict[str, Any],
    operation_details: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Enhance step definition with operation context.

    Args:
        step: Basic step definition
        operation_details: Operation details from api_discovery.get_operation_details()

    Returns:
        Enhanced step with richer descriptions

    Example:
        enhanced = enhance_step_with_context(
            {'name': 'Create API', 'yaml_block': '...'},
            operation_details
        )
    """
    enhanced = step.copy()

    if 'description' not in enhanced or not enhanced['description']:
        # Use operation description/summary
        enhanced['description'] = operation_details.get('description') or operation_details.get('summary', '')

    if 'operation_summary' not in enhanced:
        enhanced['operation_summary'] = operation_details.get('summary', 'Execute operation')

    return enhanced
