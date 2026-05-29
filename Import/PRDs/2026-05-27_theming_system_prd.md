# Multi-Theme Color System PRD

A retrospective + reference doc describing how we took the stock **broadchurch**
Aether starter (`@yottagraph-app/aether-instructions` tenant scaffold) and grew
it into a pluggable, white-labelable color theme system that works on every
surface in the app — including the always-dark left navigation, the chat-style
agent surface, the wealth map canvas, the ZIP brief modal, and every
Vuetify-owned overlay (`v-tooltip`, `v-menu`, `v-dialog`).

This document is intentionally code-snippet-heavy: it should be paste-able into
another Aether tenant repo to replicate the same architecture.

---

# Feature Overview

Replace the starter's single-dark-theme assumption with a registry-driven preset
system that:

- Ships **five named presets** (Lovelace Dark, Lovelace Light, Paper, Bloomberg,
  Slate) and supports an arbitrary number of additional white-label presets.
- Persists the user's choice cross-device through `Pref<string>` (Upstash KV).
- Recolors **everything**: Vuetify components, custom CSS surfaces, the
  always-dark left nav (without inverting its own chrome), Vuetify overlays
  (`v-tooltip` / `v-menu`), the map, the score ramp, the agent chat surface.
- Passes WCAG AA contrast on every text-on-surface combination in light themes.
- Forbids two classes of fragile color literals via documented patterns:
    - `rgba(255, 255, 255, ...)` / `#fff` for chrome that should follow the theme.
    - `rgba(63, 234, 0, ...)` / `hsl(140 ...)` for brand emphasis that should
      follow the theme.

# Details

## 1. Where we started — the broadchurch baseline

`broadchurch` is the Lovelace tenant-provisioning workflow that scaffolds a
fresh Aether app. The starter ships with:

- A single dark theme assumption documented in `DESIGN.md`.
- `assets/brand-globals.css` defining hard-coded Lovelace brand constants
  (`--lv-green: #3FEA00`, `--lv-black`, etc.) and a `:root` block whose values
  match dark mode only.
- A starter `useLovelaceTheme()` composable that toggles `dark` ↔ `light`
  through `localStorage` and `vuetifyTheme.change('lovelaceDark' | 'lovelaceLight')`.
- Two Vuetify themes (`lovelaceDark`, `lovelaceLight`) literally defined inline
  in `nuxt.config.ts`.
- Page CSS that hard-coded `rgba(255, 255, 255, 0.X)`, `color: #fff`,
  `border: 1px solid rgba(255, 255, 255, 0.08)`, and `hsl(140 90% 65%)` for
  brand emphasis — fine on `#0a0a0a`, broken on `#ffffff`.

That stack works as long as you stay in dark mode. The moment a user flipped
the toggle:

- All page text turned white-on-near-white because `color: #fff` doesn't care
  about the theme.
- The sidebar nav links inverted to dark-on-dark and disappeared.
- The "Share view" button, "Live elemental" chip, active recipe pill, and
  selected row highlight all faded to invisible because they used a fixed
  `hsl(140 90% 65%)` (light green) on a `rgba(63, 234, 0, 0.12)` tint.
- Vuetify tooltips kept their dark defaults regardless of theme.

Our brief was to make light mode a first-class product surface for fintech
demos, and to enable white-labeling for customer presentations. That required
moving from "two themes" to "an unbounded registry of presets," and getting
every component to actually follow the active preset.

## 2. Target architecture

Four design principles, each translated into a concrete token or pattern:

| Principle                                                                  | Mechanism                                                                                                                                                               |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One source of truth for all themes                                         | `utils/theme/themePresets.ts` exports a `ThemePreset[]`. Both Vuetify and the CSS-variable applier read from it.                                                        |
| Components consume tokens, not hex literals                                | ~30 `--dynamic-*` CSS variables written by `applyCssVariables()`. Component CSS references the variables; theme switches flow through automatically.                    |
| Foreground color depends on the surface beneath, not the global theme mode | Sidebar uses `--lv-sidebar-fg-rgb` (always `255, 255, 255`). Brand pills use `--dynamic-primary-strong` (light shade on dark presets, dark shade on light presets).     |
| Cards declare elevation, not a tint                                        | `--dynamic-card-shadow` is empty on dark presets, a subtle 2-stop drop on light presets. `--dynamic-card-background` is a real surface color, not `rgba(fg-rgb, 0.03)`. |

The five visible surface layers stack like this (light theme example):

```
┌──────────────────────────────────────────────────────────┐
│ --dynamic-background           (#EEEEF2 page background) │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ --dynamic-card-background    (#FFFFFF, has shadow)   │ │
│ │ ┌──────────────────────────────────────────────────┐ │ │
│ │ │ --dynamic-panel-background (#F1F2F5, inset)      │ │ │
│ │ └──────────────────────────────────────────────────┘ │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│  Always-dark sidebar uses --lv-sidebar-bg (#0a0a0c)      │
│  with --lv-sidebar-fg-rgb-based chrome inside it.        │
└──────────────────────────────────────────────────────────┘
```

---

# Implementation walkthrough (code snippets)

## Step 1 — Define the preset registry

`utils/theme/themePresets.ts` is the single source of truth. Every other layer
reads from it.

The token interface separates "values that should change per theme" into
explicit fields. Two non-obvious fields:

- `primaryRgb` — the primary color as an `R, G, B` triplet so tint backgrounds
  written as `rgba(var(--dynamic-primary-rgb), 0.12)` automatically recolor.
- `primaryStrong` — a _theme-tuned label color_ for use inside primary-tinted
  pills. Dark presets pick a light shade of primary; light presets pick a dark
  shade. This is what makes the "Share view" button readable on both modes.

```ts
// utils/theme/themePresets.ts
export type ThemeMode = 'dark' | 'light';

export interface PaletteTokens {
    primary: string;
    /** `R, G, B` triplet for `rgba(var(--dynamic-primary-rgb), 0.12)` tints. */
    primaryRgb: string;
    /**
     * Brand-emphasis text color (active pill labels, "Share view", "Live"
     * chip text). Dark presets pick a light shade; light presets pick a dark
     * shade so the same pill reads on both modes.
     */
    primaryStrong: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    cardBackground: string;
    panelBackground: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    hover: string;
    border: string;
    success: string;
    warning: string;
    error: string;
    headerGradientStart: string;
    headerGradientEnd: string;
    /** Foreground as RGB triplet for `rgba(var(--dynamic-fg-rgb), X)` tints. */
    fgRgb: string;
    fgRgbInverse: string;
    bgRgb: string;
    overlayBg: string;
    overlayBorder: string;
    /** Empty for dark presets; subtle 2-stop drop for light presets. */
    cardShadow: string;
    mapBgStart: string;
    mapBgEnd: string;
    mapCountyStroke: string;
    mapStateStroke: string;
    scoreRamp: [string, string, string];
}

export interface ThemePreset {
    id: string;
    label: string;
    description: string;
    mode: ThemeMode;
    vuetifyTheme: string;
    tokens: PaletteTokens;
}

export const themePresets: ThemePreset[] = [
    {
        id: 'lovelace-dark',
        label: 'Lovelace Dark',
        description: 'Default cyber-dark brand theme.',
        mode: 'dark',
        vuetifyTheme: 'lovelaceDark',
        tokens: {
            primary: '#3FEA00',
            primaryRgb: '63, 234, 0',
            primaryStrong: 'hsl(140 90% 70%)', // light shade for tint pills on dark
            // …all surface, text, border tokens tuned for #0A0A0A backgrounds
            cardShadow: 'none',
            scoreRamp: ['#1d8db5', '#3fa45a', '#f0b53c'],
            // …
        },
    },
    {
        id: 'lovelace-light',
        label: 'Lovelace Light',
        description: 'Light mode variant for presentations and daytime demos.',
        mode: 'light',
        vuetifyTheme: 'lovelaceLight',
        tokens: {
            primary: '#1F8B00',
            primaryRgb: '31, 139, 0',
            primaryStrong: '#15660A', // dark shade for tint pills on light
            background: '#EEEEF2',
            surface: '#FFFFFF',
            cardBackground: '#FFFFFF',
            panelBackground: '#F1F2F5',
            textPrimary: '#0A0A0A',
            textSecondary: '#2A2F3A', // 15.4:1 on white — well above AA
            textMuted: '#525866', //  8.0:1 on white — well above AA
            border: '#CFD2D8', // actually visible against white
            cardShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08)',
            scoreRamp: ['#0f6f93', '#2f8a4b', '#c2861f'],
            // …
        },
    },
    // paper, bloomberg, slate — same shape
];

export const DEFAULT_THEME_ID = 'lovelace-dark';
```

Three helpers ride alongside the registry — these are the only public entry
points to it.

```ts
// utils/theme/themePresets.ts (continued)
export const themePresetById = Object.fromEntries(themePresets.map((p) => [p.id, p]));

export function getThemePresetById(themeId: string | null | undefined): ThemePreset {
    return themePresetById[themeId ?? ''] ?? themePresetById[DEFAULT_THEME_ID];
}

export function getPresetPairForToggle(
    currentThemeId: string,
    lastDarkThemeId: string,
    lastLightThemeId: string
): string {
    const current = getThemePresetById(currentThemeId);
    return current.mode === 'dark'
        ? getThemePresetById(lastLightThemeId).id
        : getThemePresetById(lastDarkThemeId).id;
}

export function buildVuetifyThemesFromPresets() {
    return Object.fromEntries(
        themePresets.map((preset) => [
            preset.vuetifyTheme,
            {
                dark: preset.mode === 'dark',
                colors: {
                    background: preset.tokens.background,
                    surface: preset.tokens.surface,
                    'surface-variant': preset.tokens.panelBackground,
                    primary: preset.tokens.primary,
                    secondary: preset.tokens.secondary,
                    warning: preset.tokens.warning,
                    error: preset.tokens.error,
                    info: preset.tokens.accent,
                    success: preset.tokens.success,
                    'on-background': preset.tokens.textPrimary,
                    'on-surface': preset.tokens.textPrimary,
                },
            },
        ])
    );
}
```

**Adding a white-label preset** is now a 30-line PR: push a new entry into
`themePresets`. Vuetify themes regenerate, the picker shows the new option, and
all `--dynamic-*` tokens flow through.

## Step 2 — Wire the registry into Vuetify

`nuxt.config.ts` builds Vuetify themes from the same preset list, so the two
sides can't drift.

```ts
// nuxt.config.ts (excerpt)
import { buildVuetifyThemesFromPresets } from './utils/theme/themePresets';

export default defineNuxtConfig({
    vuetify: {
        vuetifyOptions: {
            theme: {
                defaultTheme: 'lovelaceDark',
                themes: buildVuetifyThemesFromPresets(),
            },
            defaults: {
                VBtn: { variant: 'flat', rounded: 'lg' },
                VCard: { rounded: 'lg', variant: 'outlined' },
                VTextField: { variant: 'outlined', density: 'comfortable', color: 'primary' },
                VSelect: { variant: 'outlined', density: 'comfortable', color: 'primary' },
                VChip: { size: 'small', variant: 'tonal' },
                VDialog: { VCard: { variant: 'flat' } },
                VTooltip: { contentClass: 'lv-tooltip' },
                VMenu: { contentClass: 'lv-menu' },
            },
        },
    },
    css: ['~/assets/fonts.css', '~/assets/brand-globals.css', '~/assets/theme-styles.css'],
});
```

The `VTooltip` and `VMenu` `contentClass` overrides are the other half of the
fix: Vuetify renders overlays into a portal at `<body>` root, outside the
theme cascade, so `.lv-tooltip` / `.lv-menu` styles in `assets/theme-styles.css`
re-apply theme tokens manually.

```css
/* assets/theme-styles.css */
.lv-tooltip {
    background: var(--dynamic-overlay-bg) !important;
    color: var(--dynamic-text-primary) !important;
    border: 1px solid var(--dynamic-overlay-border);
    border-radius: 8px !important;
    font-family: var(--font-mono, monospace);
    font-size: 12px !important;
    letter-spacing: 0.02em;
    box-shadow: 0 10px 20px rgba(var(--dynamic-fg-rgb-inverse), 0.28);
    backdrop-filter: blur(8px);
}

.lv-menu {
    border: 1px solid var(--dynamic-overlay-border);
    background: var(--dynamic-overlay-bg);
    backdrop-filter: blur(8px);
}
```

## Step 3 — Refactor `useLovelaceTheme` to drive both channels

The composable replaces the starter's binary dark/light toggle with a
preset-driven API: `setTheme(id)`, `toggleTheme()` (quick-toggle to the user's
preferred opposite-mode preset), `currentPreset`, `availableThemes`. Module-
scoped refs hold state so all consumers see the same active theme.

```ts
// composables/useLovelaceTheme.ts (essential parts)
import { computed, onMounted, ref, watch } from 'vue';
import { useTheme } from 'vuetify';

import { Pref } from '~/composables/usePrefsStore';
import { useUserState } from '~/composables/useUserState';
import {
    DEFAULT_THEME_ID,
    type ThemePreset,
    getPresetPairForToggle,
    getThemePresetById,
    themePresets,
} from '~/utils/theme/themePresets';

const THEME_ID_STORAGE_KEY = 'lovelace.themeId';
const LAST_DARK_STORAGE_KEY = 'lovelace.lastDarkThemeId';
const LAST_LIGHT_STORAGE_KEY = 'lovelace.lastLightThemeId';

// Module-scoped refs so every consumer sees the same active theme.
const currentThemeId = ref<string>(DEFAULT_THEME_ID);
const lastDarkThemeId = ref<string>('lovelace-dark');
const lastLightThemeId = ref<string>('lovelace-light');
let themePref: Pref<string> | null = null;

function findDefaultThemeId(): string {
    if (typeof window === 'undefined') return DEFAULT_THEME_ID;
    const explicit = window.localStorage?.getItem(THEME_ID_STORAGE_KEY);
    if (explicit) return getThemePresetById(explicit).id;
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'lovelace-light' : DEFAULT_THEME_ID;
}

function applyCssVariables(preset: ThemePreset) {
    if (typeof window === 'undefined') return;
    const c = preset.tokens;
    const root = document.documentElement;
    // Brand
    root.style.setProperty('--dynamic-primary', c.primary);
    root.style.setProperty('--dynamic-primary-rgb', c.primaryRgb);
    root.style.setProperty('--dynamic-primary-strong', c.primaryStrong);
    root.style.setProperty('--dynamic-secondary', c.secondary);
    root.style.setProperty('--dynamic-accent', c.accent);
    // Surfaces
    root.style.setProperty('--dynamic-background', c.background);
    root.style.setProperty('--dynamic-surface', c.surface);
    root.style.setProperty('--dynamic-card-background', c.cardBackground);
    root.style.setProperty('--dynamic-panel-background', c.panelBackground);
    // Text
    root.style.setProperty('--dynamic-text-primary', c.textPrimary);
    root.style.setProperty('--dynamic-text-secondary', c.textSecondary);
    root.style.setProperty('--dynamic-text-muted', c.textMuted);
    // Chrome
    root.style.setProperty('--dynamic-hover', c.hover);
    root.style.setProperty('--dynamic-border', c.border);
    root.style.setProperty('--dynamic-success', c.success);
    root.style.setProperty('--dynamic-warning', c.warning);
    root.style.setProperty('--dynamic-error', c.error);
    // RGB triplets
    root.style.setProperty('--dynamic-fg-rgb', c.fgRgb);
    root.style.setProperty('--dynamic-fg-rgb-inverse', c.fgRgbInverse);
    root.style.setProperty('--dynamic-bg-rgb', c.bgRgb);
    // Overlay + card chrome
    root.style.setProperty('--dynamic-overlay-bg', c.overlayBg);
    root.style.setProperty('--dynamic-overlay-border', c.overlayBorder);
    root.style.setProperty('--dynamic-card-shadow', c.cardShadow);
    // Map + score ramp
    root.style.setProperty('--dynamic-map-bg-start', c.mapBgStart);
    root.style.setProperty('--dynamic-map-bg-end', c.mapBgEnd);
    root.style.setProperty('--dynamic-map-county-stroke', c.mapCountyStroke);
    root.style.setProperty('--dynamic-map-state-stroke', c.mapStateStroke);
    root.style.setProperty('--dynamic-score-ramp-low', c.scoreRamp[0]);
    root.style.setProperty('--dynamic-score-ramp-mid', c.scoreRamp[1]);
    root.style.setProperty('--dynamic-score-ramp-high', c.scoreRamp[2]);
    // Attribute hooks for `[data-theme-mode='light']` selectors
    root.dataset.themeId = preset.id;
    root.dataset.themeMode = preset.mode;
}

export const useLovelaceTheme = () => {
    const vuetifyTheme = useTheme();

    function applyThemeById(themeId: string) {
        const preset = getThemePresetById(themeId);
        currentThemeId.value = preset.id;
        // Track the last selected preset per mode so toggle can return to it.
        if (preset.mode === 'dark') lastDarkThemeId.value = preset.id;
        else lastLightThemeId.value = preset.id;
        // 1. Write CSS custom properties for all custom CSS surfaces.
        applyCssVariables(preset);
        // 2. Change the Vuetify named theme for component library surfaces.
        vuetifyTheme.change(preset.vuetifyTheme);
        // 3. Persist to localStorage for first-paint, and to KV for cross-device.
        window.localStorage?.setItem(THEME_ID_STORAGE_KEY, preset.id);
        themePref?.set(preset.id);
    }

    function toggleTheme() {
        applyThemeById(
            getPresetPairForToggle(
                currentThemeId.value,
                lastDarkThemeId.value,
                lastLightThemeId.value
            )
        );
    }

    return {
        availableThemes: computed(() => themePresets),
        currentPreset: computed(() => getThemePresetById(currentThemeId.value)),
        currentThemeId: computed(() => currentThemeId.value),
        currentThemeColors: computed(() => getThemePresetById(currentThemeId.value).tokens),
        isDark: computed(() => getThemePresetById(currentThemeId.value).mode === 'dark'),
        toggleTheme,
        setTheme: applyThemeById,
    };
};
```

Two channels (`applyCssVariables` + `vuetifyTheme.change`) are not redundant.
Vuetify only colors components it owns (`v-btn`, `v-card`, `v-text-field`).
The bulk of the app is plain CSS surfaces — the wealth sidebar, the recipe
pills, the map legend, the chat bubbles, the ZIP brief — and those only
recolor through CSS variables.

## Step 4 — Default the tokens in `brand-globals.css`

The CSS-variable applier runs **after** Vue hydration. To prevent a flash of
unstyled chrome on first paint, `assets/brand-globals.css` sets the full
`--dynamic-*` palette to the default (Lovelace Dark) values as `:root`
fallbacks.

```css
/* assets/brand-globals.css */
:root {
    /* Static brand constants — these never change with theme. */
    --lv-green: #3fea00;
    --lv-black: #0a0a0a;
    /* …other --lv-* constants… */

    /* Sidebar is intentionally always dark. Chrome inside it uses
       --lv-sidebar-fg-rgb instead of --dynamic-fg-rgb so it stays readable
       even when the active preset is a light theme. */
    --lv-sidebar-bg: #0a0a0c;
    --lv-sidebar-fg: #ffffff;
    --lv-sidebar-fg-rgb: 255, 255, 255;

    /* Default dynamic tokens (Lovelace Dark) — overridden by the composable
       once it mounts. Without these, light-mode pages would flash dark on
       first paint. */
    --dynamic-primary: #3fea00;
    --dynamic-primary-rgb: 63, 234, 0;
    --dynamic-primary-strong: hsl(140 90% 70%);
    --dynamic-text-primary: #ffffff;
    --dynamic-text-secondary: #a0aec0;
    --dynamic-text-muted: #757575;
    --dynamic-card-background: #1e1e1e;
    --dynamic-panel-background: #111111;
    --dynamic-border: #2a2a2a;
    --dynamic-fg-rgb: 255, 255, 255;
    --dynamic-fg-rgb-inverse: 10, 10, 10;
    --dynamic-overlay-bg: rgba(20, 20, 24, 0.96);
    --dynamic-overlay-border: rgba(255, 255, 255, 0.1);
    --dynamic-card-shadow: none;
    --dynamic-score-ramp-low: #1d8db5;
    --dynamic-score-ramp-mid: #3fa45a;
    --dynamic-score-ramp-high: #f0b53c;
    /* …all other tokens… */
}
```

## Step 5 — Eliminate `rgba(255, 255, 255, ...)` and `#fff` (Phase B sweep)

The starter pages were full of `color: #fff` and `border: 1px solid rgba(255,
255, 255, 0.08)`. We did a mechanical sweep across `pages/wealth/**` and
`components/wealth/**` — ~170 replacements driven by a Python script — to
swap each literal for the token-aware equivalent:

| Before                                        | After                                                 | Rationale                             |
| --------------------------------------------- | ----------------------------------------------------- | ------------------------------------- |
| `color: #fff`                                 | `color: var(--dynamic-text-primary)`                  | Body text follows the theme           |
| `color: rgba(255, 255, 255, 0.6)`             | `color: var(--dynamic-text-secondary)`                | Secondary copy                        |
| `color: rgba(255, 255, 255, 0.45)`            | `color: var(--dynamic-text-muted)`                    | Section labels                        |
| `background: rgba(255, 255, 255, 0.03)`       | `background: rgba(var(--dynamic-fg-rgb), 0.03)`       | Subtle surface tint (inset, not card) |
| `border: 1px solid rgba(255, 255, 255, 0.08)` | `border: 1px solid rgba(var(--dynamic-fg-rgb), 0.08)` | Hairline border                       |

`rgba(var(--dynamic-fg-rgb), 0.03)` is the canonical "subtle surface tint"
idiom — white-glaze on dark, ink-glaze on light, both subtle but visible.

**Important nuance:** the alpha-tint idiom is correct for _inset_ surfaces but
not for _cards_. See Step 7.

## Step 6 — Eliminate hardcoded brand-green (Phase C, primary tokens)

After Phase B, light mode finally rendered, but several brand-emphasis
elements were still invisible because the _brand color_ was hardcoded with
dark-mode-tuned lightness:

```css
/* The bug: light green on light green tint = invisible in light mode */
.share {
    background: rgba(63, 234, 0, 0.12);
    color: hsl(140 90% 65%);
    border: 1px solid rgba(63, 234, 0, 0.28);
}
```

Two new tokens fixed this cleanly. `--dynamic-primary-rgb` recolors brand-tint
backgrounds with the active theme's primary; `--dynamic-primary-strong` ships
a _per-theme_ label color tuned for the tint surface.

```css
/* The fix: same component, every preset */
.share {
    background: rgba(var(--dynamic-primary-rgb), 0.14);
    color: var(--dynamic-primary-strong);
    border: 1px solid rgba(var(--dynamic-primary-rgb), 0.45);
}
```

We swept ~70 such call sites — active recipe pills, live elemental chips,
selected row highlights, "share view" buttons, evidence drawer tints, agent
meta bar pills — with the same script approach as Phase B. The contract is
documented in `.agents/skills/aether/branding.md` so future agents don't
re-introduce the bug.

## Step 7 — Cards declare elevation, not a tint (Phase C, surface tokens)

The remaining light-mode issue was that "card-shaped" surfaces used the same
alpha-tint pattern as inset surfaces, which made them invisible on a near-
white page background:

```css
/* Wrong for cards in light mode: 3% black on #EEEEF2 ≈ #E6E6EA — vanishes */
.ranking-table-wrap {
    border: 1px solid rgba(var(--dynamic-fg-rgb), 0.08);
    background: rgba(var(--dynamic-fg-rgb), 0.02);
}
```

`--dynamic-card-background`, `--dynamic-border`, and a new `--dynamic-card-shadow`
(empty on dark, subtle on light) replaced the alpha-tint for any element that
should read as a card sitting on the page:

```css
.ranking-table-wrap {
    border: 1px solid var(--dynamic-border);
    background: var(--dynamic-card-background);
    box-shadow: var(--dynamic-card-shadow);
}
```

Inset surfaces inside a card stay on `--dynamic-panel-background` (a slightly
off-white in light themes, slightly off-black in dark themes).

The decision matrix:

| Surface role                                      | Token to use                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Page background                                   | `var(--dynamic-background)`                                                                           |
| Card sitting on the page (should pop)             | `var(--dynamic-card-background)` + `var(--dynamic-border)` + `box-shadow: var(--dynamic-card-shadow)` |
| Inset panel inside a card (should recede)         | `var(--dynamic-panel-background)`                                                                     |
| Subtle surface tint (hover overlay, ghost button) | `rgba(var(--dynamic-fg-rgb), 0.04–0.10)`                                                              |
| Brand-tinted pill or chip                         | `rgba(var(--dynamic-primary-rgb), 0.12)` with `color: var(--dynamic-primary-strong)`                  |

## Step 8 — Sidebar exception: anchor chrome to a fixed RGB triplet

The wealth sidebar (`components/wealth/WealthShell.vue`) is intentionally
_always dark_ — it acts as the visual anchor for navigation across every
preset. The original tokenization sweep broke this by using `--dynamic-fg-rgb`
inside the sidebar, which becomes `10, 10, 10` (near-black) in light themes,
producing **dark text on the dark sidebar**.

The fix introduces `--lv-sidebar-fg-rgb: 255, 255, 255` as a global static
constant, and the sidebar's CSS uses it everywhere `--dynamic-fg-rgb` would
otherwise appear:

```css
/* components/wealth/WealthShell.vue (excerpt) */
.wealth-sidebar {
    background: var(--lv-sidebar-bg);
    color: var(--lv-sidebar-fg);
    border-right: 1px solid rgba(var(--lv-sidebar-fg-rgb), 0.08);
}
.nav-link {
    color: rgba(var(--lv-sidebar-fg-rgb), 0.78);
}
.nav-link:hover {
    background: rgba(var(--lv-sidebar-fg-rgb), 0.06);
    color: var(--lv-sidebar-fg);
}
.nav-link.active {
    /* Sidebar deliberately stays on the Lovelace cyber-green even on non-
       Lovelace presets — this is brand chrome, not page content. */
    background: rgba(63, 234, 0, 0.16);
    color: hsl(140 90% 72%);
}
.section-label {
    color: rgba(var(--lv-sidebar-fg-rgb), 0.55);
}
```

This is the _rule_: components inside an always-dark surface use
`--lv-sidebar-fg-rgb`, never `--dynamic-fg-rgb`. Same applies if a future
preset wants an always-light surface (it would need a parallel
`--lv-some-surface-fg-rgb` token).

## Step 9 — Categorical chips that need to flip per theme

A small number of categorical colors (e.g. the "geocoding source" chips
showing `fdic` / `census_geocoder` / `zip_centroid`) need to stay visually
distinct from brand colors, but their lightness needs to flip per theme so
they read on both surfaces. The `data-theme-mode` attribute on `<html>` makes
this clean:

```css
/* pages/wealth/branch/[branch_id].vue (excerpt) */
.geo-chip--fdic {
    color: var(--dynamic-primary-strong);
    border-color: rgba(var(--dynamic-primary-rgb), 0.3);
}
[data-theme-mode='light'] .geo-chip--census_geocoder {
    color: hsl(38 90% 28%);
    border-color: hsla(38, 80%, 40%, 0.4);
}
[data-theme-mode='dark'] .geo-chip--census_geocoder,
.geo-chip--census_geocoder {
    color: hsl(45, 90%, 65%);
    border-color: hsla(45, 80%, 50%, 0.25);
}
```

(`.geo-chip--census_geocoder` repeated without a selector is the dark
default — covers SSR pre-hydration and any path where `data-theme-mode` isn't
yet set.)

## Step 10 — Persistence: localStorage for first paint, KV for cross-device

`useLovelaceTheme` writes the chosen theme through two layers:

1. **`localStorage`** — synchronous, available before Vue mounts. This is what
   `findDefaultThemeId()` reads to avoid a wrong-theme flash.
2. **`Pref<string>`** (Upstash Redis KV via `/api/kv/*`) — asynchronous,
   keyed to the authenticated user. This is what makes the choice sync across
   browsers and devices.

```ts
// composables/useLovelaceTheme.ts (persistence excerpt)
function ensureThemePref() {
    const { userId } = useUserState();
    const config = useRuntimeConfig();
    const appId = config.public.appId || 'aether-default';

    watch(
        userId,
        async (uid) => {
            if (!uid) return;
            const docPath = `/users/${uid}/apps/${appId}/settings/theme`;
            themePref = new Pref<string>(docPath, 'activeThemeId', currentThemeId.value);
            await themePref.initialize();
            const persisted = themePref.v;
            if (persisted) {
                currentThemeId.value = getThemePresetById(persisted).id;
            }
            watch(currentThemeId, (themeId) => {
                themePref?.set(themeId);
            });
        },
        { immediate: true }
    );
}
```

Two extra keys, `lastDarkThemeId` and `lastLightThemeId`, are kept in
`localStorage` so the "Quick Toggle" button returns you to the dark _or_ light
preset you actually used last, not a hardcoded pair.

## Step 11 — Picker UI

`ThemePresetPicker.vue` is the shared UI surface used in both `AppHeader`
(palette icon → menu) and `SettingsDialog` (full theme section). It renders
each preset with a 3-swatch sample (`background`, `surface`, `primary`) so
white-label customers see exactly what they're getting.

```vue
<!-- components/ThemePresetPicker.vue -->
<template>
    <div class="theme-picker">
        <button
            v-for="themePreset in availableThemes"
            :key="themePreset.id"
            type="button"
            :class="['theme-option', { active: currentThemeId === themePreset.id }]"
            @click="setTheme(themePreset.id)"
        >
            <span class="swatches" aria-hidden="true">
                <span class="swatch" :style="{ background: themePreset.tokens.background }" />
                <span class="swatch" :style="{ background: themePreset.tokens.surface }" />
                <span class="swatch" :style="{ background: themePreset.tokens.primary }" />
            </span>
            <span class="meta">
                <span class="label">{{ themePreset.label }}</span>
                <span v-if="showDescription" class="description">
                    {{ themePreset.description }}
                </span>
            </span>
            <v-icon
                v-if="currentThemeId === themePreset.id"
                icon="mdi-check"
                size="small"
                class="check"
            />
        </button>
    </div>
</template>

<script setup lang="ts">
    withDefaults(defineProps<{ showDescription?: boolean }>(), { showDescription: true });

    const { availableThemes, currentThemeId, setTheme } = useLovelaceTheme();
</script>
```

The entry point in `AppHeader.vue` is a `mdi-palette` icon button that opens a
`<v-menu>` containing `<ThemePresetPicker />`. This replaced the starter's
sun/moon binary toggle.

## Step 12 — Admin preview page

`pages/admin/themes.vue` renders every preset as a tile so designers and
customers can see all five (plus future white-labels) side-by-side. Each tile
embeds a mini app shell mock at the preset's tokens so you preview real chrome,
not just swatches.

---

# Token reference

Quick cheatsheet of the `--dynamic-*` surface, grouped by role:

| Token                               | Purpose                                 | Typical usage                                              |
| ----------------------------------- | --------------------------------------- | ---------------------------------------------------------- |
| `--dynamic-primary`                 | Brand color (solid fill)                | Vuetify's `color="primary"` resolves through here too      |
| `--dynamic-primary-rgb`             | Brand color as `R, G, B`                | `rgba(var(--dynamic-primary-rgb), 0.12)` for tints         |
| `--dynamic-primary-strong`          | Label text inside a primary-tinted pill | "Share view", "Live elemental", active recipe pill         |
| `--dynamic-background`              | Page background                         | Top-level scroll surface                                   |
| `--dynamic-card-background`         | Card sitting on page                    | Combine with `--dynamic-border` + `--dynamic-card-shadow`  |
| `--dynamic-panel-background`        | Inset panel inside a card               | Table headers, secondary surfaces                          |
| `--dynamic-text-primary`            | Body text, titles, KPI values           | High-contrast text                                         |
| `--dynamic-text-secondary`          | Subtitles, helper text                  | Mid-contrast text                                          |
| `--dynamic-text-muted`              | Section labels, kickers, metadata       | Lowest-contrast text — still WCAG AA in light themes       |
| `--dynamic-border`                  | Hairline borders on cards/panels        | Stays visible in both modes                                |
| `--dynamic-hover`                   | Hover background fill                   | Mostly for Vuetify list items                              |
| `--dynamic-fg-rgb`                  | Foreground as `R, G, B` triplet         | `rgba(var(--dynamic-fg-rgb), 0.06)` for subtle inset tints |
| `--dynamic-fg-rgb-inverse`          | Inverse of `--dynamic-fg-rgb`           | Shadows that should match the opposite mode                |
| `--dynamic-overlay-bg`              | Vuetify tooltip/menu background         | Used by `.lv-tooltip` and `.lv-menu`                       |
| `--dynamic-overlay-border`          | Vuetify tooltip/menu border             | Same                                                       |
| `--dynamic-card-shadow`             | Card elevation                          | Empty on dark, subtle on light                             |
| `--dynamic-score-ramp-low/mid/high` | Choropleth ramp                         | Drives `MapCanvas` heatmap                                 |
| `--lv-sidebar-bg`                   | Sidebar background (static)             | Always near-black                                          |
| `--lv-sidebar-fg-rgb`               | Sidebar text as `R, G, B`               | Always `255, 255, 255`                                     |

# Common recipes for new app pages

**A card on the page background:**

```css
.my-card {
    border: 1px solid var(--dynamic-border);
    border-radius: 8px;
    padding: 14px;
    background: var(--dynamic-card-background);
    box-shadow: var(--dynamic-card-shadow);
}
```

**An inset panel inside a card:**

```css
.my-card .summary {
    background: var(--dynamic-panel-background);
    border: 1px solid var(--dynamic-border);
    border-radius: 6px;
    padding: 10px;
}
```

**A brand-emphasis pill (active state, "live" chip, primary CTA):**

```css
.brand-pill {
    background: rgba(var(--dynamic-primary-rgb), 0.14);
    color: var(--dynamic-primary-strong);
    border: 1px solid rgba(var(--dynamic-primary-rgb), 0.45);
    padding: 4px 10px;
    border-radius: 999px;
}
```

**A subtle inset tint (hover overlay, secondary chip background):**

```css
.subtle-chip {
    background: rgba(var(--dynamic-fg-rgb), 0.06);
    color: var(--dynamic-text-secondary);
    border: 1px solid rgba(var(--dynamic-fg-rgb), 0.12);
}
.subtle-chip:hover {
    background: rgba(var(--dynamic-fg-rgb), 0.1);
    color: var(--dynamic-text-primary);
}
```

**A Vuetify tooltip/menu that respects the theme:** nothing to do per call
site — Vuetify defaults set `contentClass: 'lv-tooltip'` / `'lv-menu'`
globally and `assets/theme-styles.css` styles those classes.

# Forbidden patterns (caught by code review / agent rules)

- `color: #fff` or `color: white` for any page chrome — use
  `var(--dynamic-text-primary)`.
- `rgba(255, 255, 255, X)` for any page chrome — use
  `rgba(var(--dynamic-fg-rgb), X)`.
- `rgba(63, 234, 0, X)` or `hsl(140 …)` for brand emphasis on theme-following
  surfaces — use `rgba(var(--dynamic-primary-rgb), X)` and
  `var(--dynamic-primary-strong)`. (The always-dark sidebar is the documented
  exception.)
- `background: rgba(var(--dynamic-fg-rgb), 0.02–0.04)` for anything that
  should _look like a card on the page_ — use `var(--dynamic-card-background)`
    - `var(--dynamic-border)` + `var(--dynamic-card-shadow)`. The alpha-tint
      pattern is reserved for inset/hover surfaces.

These rules are documented in `.agents/skills/aether/branding.md` so future
agent work doesn't reintroduce them.

# Verification checklist

Per preset (× 5):

- [ ] Header gradient renders, palette icon visible
- [ ] Sidebar nav links readable; active link highlighted in brand-green
- [ ] Sidebar section labels (`NAVIGATION`, `SAVED VIEWS`, `PINNED ZIPS`,
      `RUN LOG`) all legible
- [ ] Map canvas page: control card has visible edge + shadow (light themes)
- [ ] Active recipe pill, "Share view" button, bank chips all readable
- [ ] Right-side ranking pane reads as a real card on the page
- [ ] ZIP brief modal: hero, KPI strip, events list, bank panel all read as
      distinct cards
- [ ] Live elemental chip visible
- [ ] Vuetify `v-tooltip` and `v-menu` adopt theme tokens
- [ ] Settings dialog → Theme section shows current selection with checkmark
- [ ] Selecting a theme persists across page reload and across browsers
      (KV-backed)

# Implementation Steps

- [x] Land the preset registry in `utils/theme/themePresets.ts`
- [x] Generate Vuetify themes from the registry in `nuxt.config.ts`
- [x] Refactor `useLovelaceTheme` to write CSS variables + Vuetify themes
- [x] Default all `--dynamic-*` tokens in `assets/brand-globals.css`
- [x] Add `.lv-tooltip` / `.lv-menu` global overrides in `assets/theme-styles.css`
- [x] Phase B sweep: replace `rgba(255, 255, 255, ...)` and `#fff` with tokens
- [x] Phase C.1: introduce `--dynamic-primary-rgb` and `--dynamic-primary-strong`,
      sweep brand-green literals
- [x] Phase C.2: introduce `--dynamic-card-background`, `--dynamic-panel-background`,
      `--dynamic-card-shadow`, lift real cards onto them
- [x] Sidebar exception: `--lv-sidebar-fg-rgb` and `WealthShell.vue` rewrite
- [x] Categorical chips: `[data-theme-mode]` selectors for non-brand colors
- [x] Persistence: `Pref<string>` to KV + `lastDarkThemeId` / `lastLightThemeId`
      in `localStorage`
- [x] `ThemePresetPicker.vue` shared component
- [x] `mdi-palette` menu in `AppHeader.vue` + theme section in `SettingsDialog.vue`
- [x] `pages/admin/themes.vue` preview surface
- [x] Light-theme contrast tuning: darker `textMuted`/`textSecondary`,
      stronger `border`, real `cardShadow`
- [x] Document rules in `.agents/skills/aether/branding.md`

# Open questions

- Should the always-dark "anchor surface" (currently just the wealth sidebar)
  also include the app header? Today the header is dark via its
  `--dynamic-header-gradient-*` tokens that happen to be dark in every preset.
  A white-label customer with a light header would need a parallel
  `--lv-header-fg-rgb`-style token.
- Are there demos where customers want a _light_ anchor sidebar instead of
  dark? If so, `--lv-sidebar-fg-rgb` should become per-preset, with light
  presets defaulting to a dark sidebar but white-label presets free to flip
  both `--lv-sidebar-bg` and `--lv-sidebar-fg-rgb`.
- Should the score ramp (`scoreRamp: [low, mid, high]`) be derivable from the
  active `primary` color (HCL interpolation through a complementary hue),
  rather than hand-tuned per preset?
- Does the `data-theme-mode='light'` selector pattern (used for categorical
  chips) generalize, or should each "mode-flip" case get its own
  `--dynamic-cat-X-light` / `-dark` token pair?
