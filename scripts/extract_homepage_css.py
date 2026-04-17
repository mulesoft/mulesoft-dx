#!/usr/bin/env python3
"""
Extract homepage-specific CSS from styles.css.
This script identifies CSS rules that are only used in the homepage (index.html)
and not in other pages (detail pages, skill pages).
"""

import re
from pathlib import Path

# Define paths
PORTAL_DIR = Path("/Users/mdeachaval/labs/machaval/mulesoft/anypoint-public-api-specs/portal")
STYLES_CSS = Path("/Users/mdeachaval/labs/machaval/mulesoft/anypoint-public-api-specs/scripts/portal_generator/assets/styles.css")

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
    # This regex matches selectors and their corresponding rule blocks
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
    print("Analyzing HTML files...")

    # Get classes from homepage template
    homepage_template = Path("/Users/mdeachaval/labs/machaval/mulesoft/anypoint-public-api-specs/scripts/portal_generator/templates/homepage.html")
    homepage_classes = extract_classes_from_html(homepage_template)
    print(f"Found {len(homepage_classes)} unique classes in homepage template")

    # Get classes from all other template files (detail pages, skills, operations, etc.)
    templates_dir = Path("/Users/mdeachaval/labs/machaval/mulesoft/anypoint-public-api-specs/scripts/portal_generator/templates")
    detail_classes = set()
    for html_file in templates_dir.rglob("*.html"):
        if html_file.name != "homepage.html":
            detail_classes.update(extract_classes_from_html(html_file))

    print(f"Found {len(detail_classes)} unique classes in non-homepage templates")

    # Find homepage-only classes
    homepage_only = homepage_classes - detail_classes
    print(f"Found {len(homepage_only)} classes used ONLY in homepage")
    print(f"\nHomepage-only classes:")
    for cls in sorted(homepage_only):
        print(f"  .{cls}")

    # Read CSS file
    print(f"\nReading {STYLES_CSS}...")
    with open(STYLES_CSS, 'r', encoding='utf-8') as f:
        css_content = f.read()

    # Parse CSS rules
    css_rules = parse_css_rules(css_content)
    print(f"Found {len(css_rules)} CSS rules")

    # Find rules that ONLY use homepage-only classes
    homepage_only_rules = []
    for selector, properties in css_rules:
        selector_classes = get_css_selector_classes(selector)

        # If selector has classes and ALL of them are homepage-only
        if selector_classes and selector_classes.issubset(homepage_only):
            homepage_only_rules.append((selector, properties))

    print(f"\nFound {len(homepage_only_rules)} rules that use ONLY homepage-specific classes")

    # Generate homepage-specific CSS
    homepage_css = "/* Homepage-specific styles */\n"
    homepage_css += "/* This file contains CSS rules used ONLY in index.html */\n\n"

    for selector, properties in homepage_only_rules:
        # Clean up properties - normalize whitespace
        props_lines = [line.strip() for line in properties.split('\n') if line.strip()]
        formatted_props = '\n    '.join(props_lines)
        homepage_css += f"{selector} {{\n    {formatted_props}\n}}\n\n"

    # Write to homepage.css
    output_path = STYLES_CSS.parent / "homepage.css"
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(homepage_css)

    print(f"\nWrote homepage-specific CSS to: {output_path}")
    print(f"Total rules extracted: {len(homepage_only_rules)}")

if __name__ == "__main__":
    main()
