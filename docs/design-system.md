# Anypoint Platform API Portal - Design System

This portal uses a semantic token system with CSS custom properties defined in `scripts/portal_generator/assets/styles.css`. All components should use these semantic tokens instead of hard-coded colors or values.

## Table of Contents

1. [Semantic Color Tokens](#semantic-color-tokens)
2. [Spacing System](#spacing-system)
3. [Typography System](#typography-system)
4. [Border Radius](#border-radius)
5. [Shadows & Elevation](#shadows--elevation)
6. [Component Patterns](#component-patterns)
7. [Core Design Principles](#core-design-principles)
8. [Quick Reference Cheat Sheet](#quick-reference-cheat-sheet)

---

## Semantic Color Tokens

**ALWAYS use semantic tokens instead of hard-coded hex colors:**

```css
/* ❌ WRONG - Hard-coded colors */
.card {
  color: #3E3E3C;
  background: #FFFFFF;
  border: 1px solid #DDDBDA;
}

/* ✅ CORRECT - Semantic tokens (maintainable) */
.card {
  color: var(--color-text-primary);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-primary);
}
```

### Primary Semantic Tokens

#### Text Colors

- `--color-text-primary` — Primary text (headings, body text)
- `--color-text-secondary` — Secondary text (descriptions, metadata)
- `--color-text-tertiary` — Tertiary text (helper text, placeholders)
- `--color-text-quaternary` — Quaternary text (subtle hints)
- `--color-text-inverse` — Text on dark backgrounds
- `--color-text-link` — Link color
- `--color-text-link-hover` — Link hover state

#### Background Colors

- `--color-bg-primary` — Page background (#F4F6F9)
- `--color-bg-secondary` — Secondary background (white)
- `--color-bg-surface` — Card/panel/modal background (white)
- `--color-bg-overlay` — Modal overlay backdrop

#### Border Colors

- `--color-border-primary` — Default borders
- `--color-border-secondary` — Subtle borders
- `--color-border-focus` — Focus state borders (usually primary blue)

#### Status Colors

- `--color-success` — Success states (#04844B)
- `--color-warning` — Warning states (#FFB75D)
- `--color-danger` — Error/danger states (#EA001E)
- `--color-purple` — Purple accent (#8E44AD)

#### HTTP Method Badge Colors

- `--method-get-bg/text/bg-hover` — GET method (green)
- `--method-post-bg/text/bg-hover` — POST method (blue)
- `--method-put-bg/text/bg-hover` — PUT method (yellow)
- `--method-patch-bg/text/bg-hover` — PATCH method (purple)
- `--method-delete-bg/text/bg-hover` — DELETE method (red)
- `--method-other-bg/text/bg-hover` — HEAD/OPTIONS (gray)

### Supporting Color Palette

When semantic tokens don't cover your use case, use these:

**Neutrals:** `--color-neutral-1` through `--color-neutral-10`

**Grays (Tailwind-compatible):** `--color-gray-50` through `--color-gray-900`

**Color Scales (for specific use cases):**

- **Blues:** `--color-blue-50`, `--color-blue-100`, `--color-blue-600`, `--color-blue-700`
- **Reds:** `--color-red-50` through `--color-red-800`
- **Greens:** `--color-green-50`, `--color-green-100`, `--color-green-200`, `--color-green-400`, `--color-green-700`
- **Yellows:** `--color-yellow-50`, `--color-yellow-100`, `--color-yellow-200`, `--color-yellow-300`, `--color-yellow-700`, `--color-yellow-800`
- **Purples:** `--color-purple-50`, `--color-purple-100`, `--color-purple-700`, `--color-purple-800`
- **Sky:** `--color-sky-200`, `--color-sky-500`, `--color-sky-600`, `--color-sky-700`

---

## Spacing System

Use spacing tokens for all margins, padding, and gaps:

```css
/* ✅ CORRECT - Spacing tokens */
.container {
  padding: var(--space-md);
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}
```

### Spacing Scale

| Token | Value | Pixels | Usage |
|-------|-------|--------|-------|
| `--space-xxx-small` | 0.125rem | 2px | Minimal spacing |
| `--space-xx-small` | 0.25rem | 4px | Very tight spacing |
| `--space-x-small` | 0.5rem | 8px | Tight spacing |
| `--space-small` | 0.75rem | 12px | Small spacing |
| `--space-medium` | 1rem | 16px | Default spacing |
| `--space-large` | 1.5rem | 24px | Large spacing |
| `--space-x-large` | 2rem | 32px | Extra large spacing |

### Alternative Naming (Same Values)

- `--space-xs` = `--space-xx-small`
- `--space-sm` = `--space-x-small`
- `--space-md` = `--space-medium`
- `--space-lg` = `--space-large`
- `--space-xl` = `--space-x-large`
- `--space-2xl` = 3rem (48px)

---

## Typography System

### Font Families

- `--font-sans` — System UI font stack (system-ui, -apple-system, BlinkMacSystemFont, "SF Pro", "Helvetica Neue", Arial, sans-serif)
- `--font-mono` — Monospace for code ("Menlo", "Monaco", "Courier New", monospace)

### Font Sizes

| Token | Value | Pixels | Usage |
|-------|-------|--------|-------|
| `--font-size-1` | 0.625rem | 10px | Very small text |
| `--font-size-2` | 0.75rem | 12px | Small labels |
| `--font-size-3` | 0.8125rem | 13px | Body text (small) |
| `--font-size-4` | 0.875rem | 14px | Body text |
| `--font-size-5` | 1rem | 16px | Body text (default) |
| `--font-size-6` | 1.125rem | 18px | Large body text |
| `--font-size-7` | 1.25rem | 20px | h4 |
| `--font-size-8` | 1.5rem | 24px | h3 |
| `--font-size-9` | 1.75rem | 28px | h2 |
| `--font-size-10` | 2rem | 32px | h1 |
| `--font-size-11` | 2.5rem | 40px | Extra large headings |

### Alternative Naming

- `--font-size-xs`, `--font-size-sm`, `--font-size-base`, `--font-size-lg`, `--font-size-xl`, `--font-size-2xl`, `--font-size-3xl`, `--font-size-4xl`

### Font Weights

- `--font-weight-light` — 300
- `--font-weight-regular` — 400
- `--font-weight-medium` — 500
- `--font-weight-semibold` — 600
- `--font-weight-bold` — 700

### Typography Usage Examples

```css
/* ✅ Headings */
h1, h2, h3, h4, h5, h6 {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
  line-height: 1.3;
}

/* ✅ Body text */
p {
  color: var(--color-text-primary);
  line-height: 1.7;
  margin-bottom: var(--space-md);
}

/* ✅ Links */
a {
  color: var(--color-text-link);
  text-decoration: none;
}

a:hover {
  color: var(--color-text-link-hover);
  text-decoration: underline;
}
```

---

## Border Radius

Use radius tokens for consistent rounded corners:

| Token | Value | Pixels | Usage |
|-------|-------|--------|-------|
| `--radius-small` | 0.25rem | 4px | Small elements, inputs |
| `--radius-medium` | 0.5rem | 8px | Badges, small cards |
| `--radius-large` | 0.75rem | 12px | **Buttons (minimum)**, cards, panels |
| `--radius-xl` | 1rem | 16px | Large containers |

```css
/* ✅ CORRECT */
.button {
  border-radius: var(--radius-large); /* Minimum for buttons */
}

.card {
  border-radius: var(--radius-large);
}

.badge {
  border-radius: var(--radius-medium);
}

input {
  border-radius: var(--radius-small);
}
```

---

## Shadows & Elevation

Use shadow tokens for depth and elevation:

### Standard Shadows

- `--shadow-sm` — rgba(0, 0, 0, 0.05) — Subtle elevation
- `--shadow-md` — rgba(0, 0, 0, 0.08) — Card elevation
- `--shadow-lg` — rgba(0, 0, 0, 0.1) — Dropdown elevation
- `--shadow-xl` — rgba(0, 0, 0, 0.12) — Modal elevation

### Color-Specific Shadows (for highlights)

- `--shadow-blue` — Blue tint shadow for focus states
- `--shadow-blue-md` — Stronger blue shadow
- `--shadow-green` — Green tint for success states
- `--shadow-red` — Red tint for error states

### Overlay Shadows

- `--overlay-light` — rgba(255, 255, 255, 0.2)
- `--overlay-lighter` — rgba(255, 255, 255, 0.3)

### Usage Examples

```css
/* ✅ Card elevation */
.card {
  box-shadow: var(--shadow-md);
}

/* ✅ Dropdown elevation */
.dropdown {
  box-shadow: var(--shadow-lg);
}

/* ✅ Focus state */
input:focus {
  outline: none;
  border-color: var(--color-border-focus);
  box-shadow: 0 0 0 3px var(--shadow-blue);
}
```

---

## Component Patterns

### Button Styling

```css
/* Primary button */
.btn-primary {
  background: var(--color-primary);
  color: var(--color-white);
  border: none;
  border-radius: var(--radius-large); /* Minimum! */
  padding: var(--space-small) var(--space-large);
  font-size: var(--font-size-4);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn-primary:hover {
  opacity: 0.9;
}

/* Secondary button */
.btn-secondary {
  background: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-large);
  padding: var(--space-small) var(--space-large);
  font-size: var(--font-size-4);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.btn-secondary:hover {
  background: var(--color-bg-primary);
}
```

### Card Pattern

```css
.card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-large);
  padding: var(--space-lg);
  box-shadow: var(--shadow-md);
  transition: all 0.2s ease;
}

/* Interactive cards (clickable) */
.card-interactive {
  cursor: pointer;
}

.card-interactive:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Input Pattern

```css
input,
textarea,
select {
  border: 1px solid var(--color-border-primary);
  border-radius: var(--radius-small);
  padding: var(--space-small) var(--space-medium);
  font-size: var(--font-size-4);
  font-family: var(--font-sans);
  color: var(--color-text-primary);
  background: var(--color-bg-surface);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

input:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: var(--color-border-focus);
  box-shadow: 0 0 0 3px var(--shadow-blue);
}

input::placeholder {
  color: var(--color-text-tertiary);
}
```

### Method Badge Pattern

```css
/* Method badges automatically themed per HTTP method */
.method-badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-xx-small) var(--space-small);
  border-radius: var(--radius-small);
  font-size: var(--font-size-2);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  transition: all 0.15s ease;
}

.method-badge.method-get {
  background: var(--method-get-bg);
  color: var(--method-get-text);
}

.method-badge.method-post {
  background: var(--method-post-bg);
  color: var(--method-post-text);
}

/* Hover states in navigation */
.nav-link:hover .method-badge.method-get,
.nav-link.active .method-badge.method-get {
  background: var(--method-get-bg-hover);
}
```

---

## Core Design Principles

These principles ensure visual consistency and clear interaction patterns across the portal:

### 1. White Background = Interactive

**Rule:** Panel elements with white/surface backgrounds signal interactivity.

```css
/* ✅ CORRECT - White background for clickable cards */
.api-card {
  background: var(--color-bg-surface); /* White */
  cursor: pointer;
}

.api-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}

/* ✅ CORRECT - Gray background for non-interactive containers */
.page-section {
  background: var(--color-bg-primary); /* Light gray #F4F6F9 */
  /* No cursor or hover effects */
}
```

**Why:** This creates a clear visual hierarchy where users immediately understand which elements are clickable vs. which are just organizational containers.

### 2. No Boxes Inside Boxes

**Rule:** Avoid placing bordered/shadowed containers inside other bordered/shadowed containers.

```css
/* ❌ WRONG - Box inside box */
.outer-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-primary);
  box-shadow: var(--shadow-md);
}

.inner-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-primary); /* Don't do this! */
  box-shadow: var(--shadow-sm);
}

/* ✅ CORRECT - Use subtle background distinction */
.outer-card {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border-primary);
  box-shadow: var(--shadow-md);
}

.inner-section {
  background: var(--color-bg-primary); /* Subtle gray, no border/shadow */
  border-radius: var(--radius-medium);
  padding: var(--space-md);
}
```

**Why:** Multiple nested borders create visual noise and confusion about hierarchy. Use background color changes and spacing instead.

### 3. Hover = Selected Style (for selectable elements)

**Rule:** When elements can be selected, their hover state should match their selected state.

```css
/* ✅ CORRECT - Hover matches selected */
.nav-item {
  color: var(--color-text-secondary);
  background: transparent;
  transition: all 0.15s ease;
}

.nav-item:hover,
.nav-item.active {
  color: var(--color-text-primary);
  background: var(--color-bg-primary);
  border-left: 3px solid var(--color-primary);
}

/* ❌ WRONG - Different hover and selected styles */
.tab:hover {
  background: var(--color-bg-primary); /* Light gray */
}

.tab.active {
  background: var(--color-primary); /* Blue - confusing! */
  color: var(--color-white);
}
```

**Why:** Consistent hover and selected states create predictable interactions. Users can preview what the selected state will look like by hovering.

### 4. All Buttons Use --radius-large (Minimum)

**Rule:** Buttons must use at least `--radius-large` (0.75rem / 12px) for rounded corners.

```css
/* ✅ CORRECT - Buttons with proper rounding */
.btn-primary,
.btn-secondary,
.btn-action {
  border-radius: var(--radius-large); /* 12px minimum */
  padding: var(--space-small) var(--space-large);
}

/* ✅ ALSO CORRECT - Even more rounded for pill-style */
.btn-pill {
  border-radius: 999px; /* Full pill shape */
  padding: var(--space-small) var(--space-xl);
}

/* ❌ WRONG - Too sharp for buttons */
.btn-wrong {
  border-radius: var(--radius-small); /* 4px - too sharp! */
}

.btn-wrong-2 {
  border-radius: var(--radius-medium); /* 8px - still too sharp! */
}
```

**Why:** Larger border radius (12px+) on buttons creates a friendlier, more modern aesthetic and clearly distinguishes buttons from other UI elements like inputs or cards.

**Exception:** Small icon-only buttons may use `--radius-medium` (8px) when the button size is very small (≤32px).

---

## Quick Reference Cheat Sheet

| Old Pattern | New Pattern |
|------------|-------------|
| `color: #3E3E3C;` | `color: var(--color-text-primary);` |
| `color: #706E6B;` | `color: var(--color-text-secondary);` |
| `background: #FFFFFF;` | `background: var(--color-bg-surface);` |
| `background: #F4F6F9;` | `background: var(--color-bg-primary);` |
| `border: 1px solid #DDDBDA;` | `border: 1px solid var(--color-border-primary);` |
| `color: #0176D3;` | `color: var(--color-primary);` |
| `border-radius: 4px;` | `border-radius: var(--radius-small);` |
| `border-radius: 8px;` | `border-radius: var(--radius-medium);` |
| `border-radius: 12px;` | `border-radius: var(--radius-large);` |
| `padding: 8px;` | `padding: var(--space-x-small);` |
| `padding: 16px;` | `padding: var(--space-md);` |
| `gap: 24px;` | `gap: var(--space-lg);` |
| `font-size: 14px;` | `font-size: var(--font-size-4);` |
| `font-weight: 600;` | `font-weight: var(--font-weight-semibold);` |
| `box-shadow: 0 2px 8px rgba(0,0,0,0.08);` | `box-shadow: var(--shadow-md);` |

---

## Getting Started

1. **Always check for existing tokens** before adding new colors or values
2. **Use semantic tokens first** (e.g., `--color-text-primary` over `--color-neutral-10`)
3. **Follow the 4 design principles** for consistent UX
4. **Test hover and focus states** to ensure they follow the token system
5. **Reference this guide** when unsure about which token to use

For the complete token definitions, see: `scripts/portal_generator/assets/styles.css` (lines 39-270)
