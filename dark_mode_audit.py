#!/usr/bin/env python3
"""
WCAG Accessibility Audit for Dark Mode
Calculates contrast ratios for all text/background combinations
"""

import math
from typing import Tuple

def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Convert hex color to RGB tuple"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def relative_luminance(rgb: Tuple[int, int, int]) -> float:
    """Calculate relative luminance using WCAG formula"""
    def adjust(channel):
        c = channel / 255.0
        if c <= 0.03928:
            return c / 12.92
        return ((c + 0.055) / 1.055) ** 2.4

    r, g, b = [adjust(c) for c in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def contrast_ratio(color1: str, color2: str) -> float:
    """Calculate contrast ratio between two colors"""
    l1 = relative_luminance(hex_to_rgb(color1))
    l2 = relative_luminance(hex_to_rgb(color2))

    lighter = max(l1, l2)
    darker = min(l1, l2)

    return (lighter + 0.05) / (darker + 0.05)

def check_wcag(ratio: float, size: str = "normal") -> dict:
    """Check WCAG compliance levels"""
    if size == "large":  # 18pt+ or 14pt+ bold
        return {
            "A": ratio >= 3.0,
            "AA": ratio >= 3.0,
            "AAA": ratio >= 4.5
        }
    else:  # normal text
        return {
            "A": ratio >= 3.0,  # for UI components
            "AA": ratio >= 4.5,
            "AAA": ratio >= 7.0
        }

# Dark mode color palette from styles.css
colors = {
    # Backgrounds
    "bg-primary": "#1A1D21",
    "bg-secondary": "#232529",
    "bg-surface": "#232529",
    "bg-overlay": "#1A1D21",  # Using base color from rgba

    # Text colors
    "text-primary": "#D1D2D3",
    "text-secondary": "#9CA6AF",
    "text-tertiary": "#868689",
    "text-quaternary": "#5E5F63",
    "text-inverse": "#1A1D21",
    "text-link": "#1D9BD1",
    "text-link-hover": "#1164A3",

    # Borders
    "border-primary": "#3A3B3F",
    "border-secondary": "#2C2D30",
    "border-focus": "#2D7A9E",

    # Interactive states
    "hover-bg": "#2D7A9E",  # Using solid from rgba(45, 122, 158, 0.15)
    "hover-border": "#2D7A9E",
    "hover-text": "#4A9FC4",
    "selected-bg": "#2D7A9E",  # Using solid from rgba
    "selected-text": "#FFFFFF",

    # Primary colors
    "primary": "#2D7A9E",
    "primary-hover": "#3A8CB0",

    # HTTP Method colors
    "method-get-text": "#4FC46B",
    "method-post-text": "#36C5F0",
    "method-put-text": "#ECB22E",
    "method-patch-text": "#B089FF",
    "method-delete-text": "#E84D4D",
    "method-other-text": "#9CA6AF",

    # Neutral colors
    "neutral-5": "#5E5F63",
    "neutral-6": "#868689",
    "neutral-7": "#ABABAD",
    "neutral-8": "#C9CACC",
    "gray-400": "#9CA6AF",
    "gray-600": "#C9CACC",
    "gray-700": "#D1D2D3",
    "white": "#FFFFFF",
}

# Common UI combinations to check
ui_combinations = [
    # General text on backgrounds
    ("Primary text on primary bg", "text-primary", "bg-primary", "normal"),
    ("Primary text on surface bg", "text-primary", "bg-surface", "normal"),
    ("Secondary text on primary bg", "text-secondary", "bg-primary", "normal"),
    ("Secondary text on surface bg", "text-secondary", "bg-surface", "normal"),
    ("Tertiary text on primary bg", "text-tertiary", "bg-primary", "normal"),
    ("Tertiary text on surface bg", "text-tertiary", "bg-surface", "normal"),
    ("Quaternary text on primary bg", "text-quaternary", "bg-primary", "normal"),
    ("Quaternary text on surface bg", "text-quaternary", "bg-surface", "normal"),

    # Links
    ("Link text on primary bg", "text-link", "bg-primary", "normal"),
    ("Link text on surface bg", "text-link", "bg-surface", "normal"),
    ("Link hover on primary bg", "text-link-hover", "bg-primary", "normal"),
    ("Link hover on surface bg", "text-link-hover", "bg-surface", "normal"),

    # Borders
    ("Primary border on primary bg", "border-primary", "bg-primary", "normal"),
    ("Primary border on surface bg", "border-primary", "bg-surface", "normal"),
    ("Secondary border on primary bg", "border-secondary", "bg-primary", "normal"),
    ("Focus border on surface bg", "border-focus", "bg-surface", "normal"),

    # Buttons and interactive
    ("Selected text on selected bg", "selected-text", "selected-bg", "normal"),
    ("Hover text on hover bg", "hover-text", "hover-bg", "normal"),
    ("Primary button text", "white", "primary", "large"),
    ("Primary button hover", "white", "primary-hover", "large"),

    # HTTP Method badges
    ("GET method on surface", "method-get-text", "bg-surface", "normal"),
    ("POST method on surface", "method-post-text", "bg-surface", "normal"),
    ("PUT method on surface", "method-put-text", "bg-surface", "normal"),
    ("PATCH method on surface", "method-patch-text", "bg-surface", "normal"),
    ("DELETE method on surface", "method-delete-text", "bg-surface", "normal"),
    ("OTHER method on surface", "method-other-text", "bg-surface", "normal"),

    # Input fields (assuming surface background)
    ("Input text", "text-primary", "bg-surface", "normal"),
    ("Input placeholder", "text-secondary", "bg-surface", "normal"),
    ("Input border", "border-primary", "bg-surface", "normal"),

    # Modal overlays
    ("Text on overlay", "text-primary", "bg-overlay", "normal"),
    ("Secondary text on overlay", "text-secondary", "bg-overlay", "normal"),
]

print("=" * 120)
print("WCAG ACCESSIBILITY AUDIT - DARK MODE")
print("=" * 120)
print()

failures = []
warnings = []

for desc, fg_key, bg_key, size in ui_combinations:
    fg = colors.get(fg_key, "#000000")
    bg = colors.get(bg_key, "#FFFFFF")
    ratio = contrast_ratio(fg, bg)
    wcag = check_wcag(ratio, size)

    status_parts = []
    if not wcag["AAA"]:
        status_parts.append("AAA FAIL")
    if not wcag["AA"]:
        status_parts.append("AA FAIL")
        failures.append((desc, fg, bg, ratio, size))
    elif not wcag["AAA"]:
        warnings.append((desc, fg, bg, ratio, size))
    if not wcag["A"]:
        status_parts.append("A FAIL")

    if status_parts:
        status = " | ".join(status_parts)
    else:
        status = "PASS (AAA)"

    print(f"{desc:<50} | {fg_key:<25} {fg} on {bg_key:<25} {bg} | {ratio:5.2f}:1 | {status}")

print()
print("=" * 120)
print(f"SUMMARY: {len(failures)} AA failures, {len(warnings)} AAA-only failures")
print("=" * 120)

if failures:
    print("\n🚨 CRITICAL AA FAILURES (Must fix):")
    for desc, fg, bg, ratio, size in failures:
        required = "4.5:1" if size == "normal" else "3:1"
        print(f"  - {desc}: {fg} on {bg} = {ratio:.2f}:1 (requires {required})")

if warnings:
    print("\n⚠️  AAA FAILURES (Recommended):")
    for desc, fg, bg, ratio, size in warnings:
        required = "7:1" if size == "normal" else "4.5:1"
        print(f"  - {desc}: {fg} on {bg} = {ratio:.2f}:1 (AAA requires {required})")
