# Lovelace Font Setup

The app uses a **sans-forward** type system with two open-license Google Fonts families:

- **Space Grotesk** — all headings, UI labels, body copy, buttons
- **Space Mono** — code, raw IDs, build/version strings, numeric data cells, timestamps

## Loading

Fonts are loaded via Google Fonts in `assets/fonts.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap');
```

No local font files are required.

## CSS Variable Setup

```css
:root {
    --font-primary: 'Space Grotesk', 'Inter', system-ui, -apple-system, sans-serif;
    --font-headline: 'Space Grotesk', 'Inter', system-ui, sans-serif;
    --font-brand: 'Space Grotesk', 'Inter', system-ui, -apple-system, sans-serif;
    --font-mono: 'Space Mono', 'JetBrains Mono', monospace;
}
```

All four font CSS variables resolve to Space Grotesk except `--font-mono`.

## Fallback Strategy

| Role | Primary | Fallback |
|------|---------|----------|
| All headings + body + UI | Space Grotesk | Inter, system-ui |
| Code, IDs, numerics | Space Mono | JetBrains Mono |

**Inter** is widely available on modern OSes and provides a similar geometric sans aesthetic.

## Usage: `.type-*` Utility Classes

Prefer utility classes over inlining `font-family` rules. The full type scale:

| Class | Use for |
|-------|---------|
| `.type-display` | App title in the header |
| `.type-h1` | Page-level headings |
| `.type-h2` | Card titles, section headings |
| `.type-h3` | Sub-section headings |
| `.type-body` | Default body copy |
| `.type-body-strong` | Emphasized body copy |
| `.type-label` | UPPERCASE tabs, filter pills, table column headers, button labels |
| `.type-caption` | Helper text, footnotes, "30 entities" |
| `.type-mono-data` | Build strings, CIK values, numeric table cells, timestamps, code |

## Usage Examples

```css
/* Body text — inherits from html/body global rule */
body { font-family: var(--font-primary); }

/* All headings use the same sans family */
h1, h2, h3 { font-family: var(--font-primary); }

/* Buttons use the sans family via global Vuetify override */
.v-btn { font-family: var(--font-primary); font-weight: 500; }

/* Code blocks — the only surface that uses mono */
code, pre { font-family: var(--font-mono); }
```

## Legacy: FK Grotesk

The branding skill docs originally referenced FK Grotesk (a commercial font).
The app has since migrated to Space Grotesk + Space Mono, which are
open-license and loaded from Google Fonts. FK Grotesk references in other
skill files may be outdated.
