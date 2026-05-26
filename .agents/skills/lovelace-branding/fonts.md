# Lovelace Font Setup

Lovelace uses open-license web fonts:

- `Space Grotesk` for body text, headings, and brand text
- `Space Mono` for buttons and code/data text

These are loaded in `assets/fonts.css` via Google Fonts.

## CSS Import

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap');
```

## CSS Variable Setup

```css
:root {
    --font-primary: 'Space Grotesk', 'Inter', system-ui, -apple-system, sans-serif;
    --font-headline: 'Space Grotesk', 'Inter', system-ui, sans-serif;
    --font-brand: 'Space Grotesk', 'Inter', system-ui, -apple-system, sans-serif;
    --font-mono: 'Space Mono', 'JetBrains Mono', 'Fira Code', monospace;
}
```

## Fallback Strategy

If web fonts are unavailable, the stack falls back gracefully:

| Role | Primary | Fallback |
|------|---------|----------|
| Body text | Space Grotesk | Inter, system-ui |
| Headlines | Space Grotesk | Inter, system-ui |
| Code/Buttons | Space Mono | JetBrains Mono, Fira Code |
| Brand text | Space Grotesk | Inter, system-ui |

## Usage Examples

```css
/* Body text */
body {
    font-family: var(--font-primary);
}

/* Headlines */
h1, h2, h3 {
    font-family: var(--font-headline);
}

/* Buttons */
button {
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

/* Code blocks */
code, pre {
    font-family: var(--font-mono);
}
```

## Deployment Notes

- No local font files are required in `public/fonts/`.
- Ensure outbound access to `fonts.googleapis.com` and `fonts.gstatic.com` where the app runs.
