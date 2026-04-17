#!/usr/bin/env python3
"""
Extract skill page-specific CSS from styles.css.
This script identifies CSS rules that are used in skill pages but NOT in homepage or detail pages.
"""

import re
from pathlib import Path

# Define paths
STYLES_CSS = Path("/Users/mdeachaval/labs/machaval/mulesoft/anypoint-public-api-specs/scripts/portal_generator/assets/styles.css")
TEMPLATES_DIR = Path("/Users/mdeachaval/labs/machaval/mulesoft/anypoint-public-api-specs/scripts/portal_generator/templates")

def extract_classes_from_html(html_path):
    """Extract all CSS classes from an HTML file."""
    classes = set()
    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()
        # Find all class attributes
        class_matches = re.findall(r'class="([^"]*)"', content)
        for match in class_matches:
            # Split multiple classes
            classes.update(match.split())
    return classes

def get_css_selector_classes(selector):
    """Extract class names from a CSS selector."""
    # Remove pseudo-classes and pseudo-elements
    selector = re.sub(r'::[a-z-]+', '', selector)
    selector = re.sub(r':[a-z-]+(\([^)]*\))?', '', selector)

    # Extract classes (.classname)
    classes = re.findall(r'\.([a-zA-Z0-9_-]+)', selector)
    return set(classes)

def parse_css_rules(css_content):
    """Parse CSS and return list of (selector, rule_content) tuples."""
    rules = []

    # Remove comments
    css_content = re.sub(r'/\*.*?\*/', '', css_content, flags=re.DOTALL)

    # Find all CSS rules (selector { properties })
    pattern = r'([^{}]+)\{([^{}]*)\}'
    matches = re.finditer(pattern, css_content)

    for match in matches:
        selector = match.group(1).strip()
        properties = match.group(2).strip()

        # Skip empty rules
        if not properties:
            continue

        # Skip @-rules (media queries, keyframes, etc.)
        if selector.startswith('@'):
            continue

        rules.append((selector, properties))

    return rules

def main():
    print("Analyzing template files...")

    # Get classes from homepage template
    homepage_template = TEMPLATES_DIR / "homepage.html"
    homepage_classes = extract_classes_from_html(homepage_template)
    print(f"Found {len(homepage_classes)} unique classes in homepage template")

    # Get classes from detail page templates
    detail_classes = set()
    detail_page = TEMPLATES_DIR / "detail_page.html"
    detail_classes.update(extract_classes_from_html(detail_page))
    for html_file in (TEMPLATES_DIR / "operations").rglob("*.html"):
        detail_classes.update(extract_classes_from_html(html_file))
    for html_file in (TEMPLATES_DIR / "partials").rglob("*.html"):
        if html_file.name in ['overview.html', 'sidebar.html', 'auth_panel.html']:
            detail_classes.update(extract_classes_from_html(html_file))
    print(f"Found {len(detail_classes)} unique classes in detail page templates")

    # Get classes from skill page templates
    skill_classes = set()

    # Skill page main template
    skill_page = TEMPLATES_DIR / "skill_page.html"
    skill_classes.update(extract_classes_from_html(skill_page))

    # Skills templates
    for html_file in (TEMPLATES_DIR / "skills").rglob("*.html"):
        skill_classes.update(extract_classes_from_html(html_file))

    # Skill sidebar
    skill_sidebar = TEMPLATES_DIR / "partials" / "skill_sidebar.html"
    if skill_sidebar.exists():
        skill_classes.update(extract_classes_from_html(skill_sidebar))

    print(f"Found {len(skill_classes)} unique classes in skill page templates")

    # Find skill-page-only classes (not in homepage or detail pages)
    skill_only = skill_classes - homepage_classes - detail_classes
    print(f"Found {len(skill_only)} classes used ONLY in skill pages")
    print(f"\nSkill-page-only classes:")
    for cls in sorted(skill_only):
        print(f"  .{cls}")

    # Read CSS file
    print(f"\nReading {STYLES_CSS}...")
    with open(STYLES_CSS, 'r', encoding='utf-8') as f:
        css_content = f.read()

    # Parse CSS rules
    css_rules = parse_css_rules(css_content)
    print(f"Found {len(css_rules)} CSS rules")

    # Find rules that ONLY use skill-page-only classes
    skill_only_rules = []
    for selector, properties in css_rules:
        selector_classes = get_css_selector_classes(selector)

        # If selector has classes and ALL of them are skill-page-only
        if selector_classes and selector_classes.issubset(skill_only):
            skill_only_rules.append((selector, properties))

    print(f"\nFound {len(skill_only_rules)} rules that use ONLY skill-page-specific classes")

    # Generate skill-page-specific CSS
    skill_css = "/* Skill Page styles */\n"
    skill_css += "/* This file contains CSS rules used ONLY in skill pages */\n\n"

    for selector, properties in skill_only_rules:
        # Clean up properties - normalize whitespace
        props_lines = [line.strip() for line in properties.split('\n') if line.strip()]
        formatted_props = '\n    '.join(props_lines)
        skill_css += f"{selector} {{\n    {formatted_props}\n}}\n\n"

    # Write to skill_page.css
    output_path = STYLES_CSS.parent / "skill_page.css"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(skill_css)

    print(f"\nWrote skill-page-specific CSS to: {output_path}")
    print(f"Total rules extracted: {len(skill_only_rules)}")

if __name__ == "__main__":
    main()
