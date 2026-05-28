# Lovelace Branding Quick Reference

Quick-start guide for implementing Lovelace visual identity.

## Key Principles

- **Dark-first**: Jet Black (#0A0A0A) backgrounds, white text
- **Green accents**: Cyber Green (#3FEA00) for interactive elements, CTAs, success states
- **WCAG AA accessibility**: All color pairings meet minimum contrast requirements
- **Sans-forward typography**: Space Grotesk for all headings, UI labels, and copy; Space Mono only for code, raw IDs, build strings, numeric data cells
- **Minimal decoration**: Clean surfaces, subtle borders, purposeful color

## Quick Start

Minimal CSS variable setup to get started:

```css
:root {
    /* Core colors */
    --lv-black: #0A0A0A;
    --lv-white: #FFFFFF;
    --lv-green: #3FEA00;
    --lv-silver: #757575;

    /* Surfaces */
    --lv-surface: #141414;
    --lv-surface-light: #1E1E1E;

    /* Typography — sans-forward */
    --font-primary: 'Space Grotesk', 'Inter', system-ui, sans-serif;
    --font-headline: 'Space Grotesk', 'Inter', system-ui, sans-serif;
    --font-mono: 'Space Mono', 'JetBrains Mono', monospace;
}
```

## Core Colors

| Name | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| Jet Black | `#0A0A0A` | `--lv-black` | Primary backgrounds |
| Pure White | `#FFFFFF` | `--lv-white` | Primary text on dark surfaces |
| Sonic Silver | `#757575` | `--lv-silver` | Muted text, secondary elements |
| Cyber Green | `#3FEA00` | `--lv-green` | Primary accent, CTAs, success |

## Secondary Colors

| Name | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| Electric Blue | `#003BFF` | `--lv-blue` | Accent, links, finance/data |
| Blaze Orange | `#FF5C00` | `--lv-orange` | Warnings, highlights, secondary CTA |
| Amber | `#FF9F0A` | `--lv-yellow` | Warnings |
| Red | `#EF4444` | — | Errors |

## Surface Colors

| Name | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| Surface | `#141414` | `--lv-surface` | Card backgrounds, elevated surfaces |
| Surface Light | `#1E1E1E` | `--lv-surface-light` | Hover states, lighter panels |
| Panel | `#111111` | — | Table headers, dark panels |
| Border | `#2A2A2A` | — | Subtle borders |

## Color Usage Proportions

- **70%** — Jet Black + Pure White (dark backgrounds, white text)
- **15%** — Cyber Green (accents, interactive elements, success states)
- **10%** — Sonic Silver (muted text, borders, secondary elements)
- **5%** — Electric Blue + Blaze Orange (sparingly, for specific semantic purposes)

## Typography

### Design Principle: Sans-Forward

One sans family (Space Grotesk) carries the whole UI. Space Mono only appears
where it earns its keep: code, raw IDs, build/version strings, timestamps, and
numeric data cells. Differentiation comes from size, weight, and tracking — not
from switching families.

### Font Families

| Role | Font | CSS Variable |
|------|------|--------------|
| All headings + body + UI | Space Grotesk | `--font-primary`, `--font-headline`, `--font-brand` |
| Code, IDs, numeric data | Space Mono | `--font-mono` |

### Type Scale

Use the `.type-*` utility classes instead of inlining `font-family` rules:

| Class | Font | Size | Weight | Tracking | Style |
|-------|------|------|--------|----------|-------|
| `.type-display` | Space Grotesk | 1.5rem | 500 | -0.01em | App title |
| `.type-h1` | Space Grotesk | 1.25rem | 500 | -0.005em | Page headers |
| `.type-h2` | Space Grotesk | 1rem | 500 | normal | Card titles |
| `.type-h3` | Space Grotesk | 0.875rem | 500 | normal | Section headers |
| `.type-body` | Space Grotesk | 0.875rem | 400 | normal | Default copy |
| `.type-body-strong` | Space Grotesk | 0.875rem | 600 | normal | Emphasis |
| `.type-label` | Space Grotesk | 0.75rem | 500 | 0.06em | UPPERCASE tabs, pills, table headers, button text |
| `.type-caption` | Space Grotesk | 0.75rem | 400 | normal | Helper text, footnotes |
| `.type-mono-data` | Space Mono | 0.8125rem | 400 | normal | Version strings, CIK, numeric cells, timestamps |

## Full CSS Variables

Complete `:root` block for all brand variables:

```css
:root {
    /* Core */
    --lv-black: #0A0A0A;
    --lv-surface: #141414;
    --lv-surface-light: #1E1E1E;
    --lv-white: #FFFFFF;
    --lv-silver: #757575;

    /* Primary */
    --lv-green: #3FEA00;
    --lv-green-dim: #30BC00;
    --lv-green-light: #57FF19;

    /* Secondary */
    --lv-orange: #FF5C00;
    --lv-orange-dim: #D04E02;
    --lv-blue: #003BFF;
    --lv-blue-dim: #0230D0;
    --lv-blue-light: #2E5DFF;

    /* Semantic */
    --lv-yellow: #FF9F0A;
    --lv-finance-blue: #003BFF;

    /* Typography — sans-forward */
    --font-primary: 'Space Grotesk', 'Inter', system-ui, -apple-system, sans-serif;
    --font-headline: 'Space Grotesk', 'Inter', system-ui, sans-serif;
    --font-brand: 'Space Grotesk', 'Inter', system-ui, -apple-system, sans-serif;
    --font-mono: 'Space Mono', 'JetBrains Mono', monospace;
}
```

## Wordmark / Logo Variants

The full Lovelace wordmark ships in three color variants. **Always pick the variant
that pairs with the active theme mode** — the white-on-dark mark disappears against
light surfaces.

| Variant | File | Use on |
|---------|------|--------|
| White wordmark + light-gray mark | `LL-logo-full-wht.svg` | Dark themes (`lovelace-dark`, `bloomberg`, `slate`) |
| Black wordmark + dark mark | `LL-logo-full-blk.svg` | Light themes (`lovelace-light`, `paper`) |
| Black wordmark in green mark | `LL-logo-full-grn.svg` | Accent / marketing only |

In Nuxt apps, use the `useBrandLogo()` composable so the right asset is selected
automatically from the active theme:

```vue
<script setup lang="ts">
    import { useBrandLogo } from '~/composables/useBrandLogo';
    const { logoSrc } = useBrandLogo();
</script>

<template>
    <img :src="logoSrc" alt="Lovelace" />
</template>
```

## Accessibility

All color pairings must meet WCAG AA contrast ratio at minimum:

- White text on Jet Black: **passes AAA**
- Cyber Green on Jet Black: **passes AA**
- Electric Blue on Jet Black: **passes AA**

Use the color ramps (see BRANDING.md) to find appropriate pairings for other combinations.
