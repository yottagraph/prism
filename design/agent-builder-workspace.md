# Feature Overview

**Created:** 2026-05-30
**Status:** Active
**Drives:** Realignment of Prism toward the "Demonstrating Agent-Driven Intelligence with Elemental" vision (`Import/260219-...md`).

Prism drifted into a polished _retail_ goals-based app whose first design principle was to **hide** the Elemental/agent infrastructure (FHS/ERS/ACS behind an "Advanced" toggle). The demo doc says the opposite: these are demonstrations of **how agents interact with the machine** for an **enterprise / agent-builder audience**, and the central proof is **composability** — the same shared context + the same analytical modules, recombined under different policies, across Solution Packs.

This feature re-points Prism at that audience with two moves:

1. **#2 — Enterprise pivot.** Lead with an **Enhanced Due Diligence (EDD)** book of _real public issuers_ that resolve in Elemental (so a buyer "sees themselves in the graph"). Keep the existing retail personas as a **secondary policy lens** that proves the same engine spans audiences.
2. **#1 — Visible-seam workspace.** A new dedicated surface that takes **one book** and renders it as a **table, a narrative, a network graph, and chat at once**, with the **shared-context resolution and module invocation made visible** (not hidden). Internally we think of this as "one truth, many lenses," but we never use that phrase in the UI.

The headline the workspace must land: _"One Elemental context, resolved once. The same modules (FHS/ERS/ACS) run under whatever policy you set. Every render — table, brief, graph, chat — is the same evidence, composed differently by agents."_

# Details

## Audience & language

- Primary audience: **agent builders / enterprise evaluators** (credit, diligence, compliance, defense).
- Reverse the retail design principle: **module names are first-class** on this surface. Show `FHS`, `ERS`, `ACS` (with one-line plain expansions), provenance, confidence, and the monitoring → analytic → composition agent flow.
- Retail stays accessible but is reframed as _"same engine, retail mandate"_ — a composability proof, not the hero.

## The EDD hero scenario

A credit-committee **Enhanced Due Diligence pipeline**: a watchlist of real, public, diligence-worthy issuers being evaluated for refinancing / investment. Mirrors the doc's EDD vignette — a monitoring agent watches the book; when an issuer's risk profile shifts, an analytic agent runs the EDD module combination (FHS + ERS + ACS, with SCR/CHS noted), and a composition agent assembles an evidence-backed diligence brief.

- **Book:** ~8 real public issuers drawn from the existing CLO/distressed fixture (e.g. Carvana, Boeing, Walgreens Boots Alliance, Paramount Global, Lumen, Carnival, Rivian, Hertz). Real names → real FHS/ERS/news signal → defensible because every score traces to Elemental source.
- **Hero issuer:** one name where signals converge (leverage + governance/exec change + adverse news) to drive the walkthrough.

## Composability: mandate / policy presets

Recast the existing scoring presets (`conservative`/`moderate`/`aggressive` in `useScoringSettings.ts`) as **mandate presets** that express the doc's primary/high/medium/light module weighting per Solution Pack. Switching the mandate re-runs the **same modules** with different policy — this is the composability proof, made interactive on the workspace.

| Mandate preset              | Primary modules                         | Framing                                           |
| --------------------------- | --------------------------------------- | ------------------------------------------------- |
| **EDD — Diligence**         | FHS + ERS primary, ACS, (SCR/CHS noted) | Complete risk picture for a counterparty/target   |
| **KYC — Compliance**        | ACS primary, ERS                        | Beneficial ownership + sanctions proximity        |
| **Portfolio Risk — Credit** | FHS primary, SCR, light ERS             | Deterioration & correlation across the book       |
| **Retail — Goals**          | existing retail blend                   | Same engine, retail mandate (composability proof) |

Each preset maps to concrete `ScoringSettings` (weights + thresholds), reusing the existing engine. No new scoring math required — only new policy profiles.

## The visible-seam workspace (new surface)

New route `/workspace` ("Workspace" / agent-builder surface). Layout, top to bottom:

1. **Controls row:** book selector + **mandate/policy selector**. Changing the mandate visibly re-scans the same book under a different policy.
2. **The seam (the star):** a single strip that exposes the infrastructure:
    - **Shared context** — `SourceFusionBar` reframed as "one Elemental graph, resolved once" (SEC / News / Market / Macro / Ownership coverage).
    - **Modules invoked** — chips for FHS / ERS / ACS (+ SCR/CHS) showing which fired and weight under the active mandate.
    - **Agent flow** — `AgentPipelineViewer` showing monitoring → analytic → composition with live status during scan.
3. **The renders (concurrent, same book, same scan result):**
    - **Table** — `PortfolioTable` (ranked issuers, module columns named explicitly).
    - **Narrative** — `PortfolioSummaryTab` (composition-agent diligence brief).
    - **Graph** — `RelationshipNetwork` (connected universe: issuers, officers, instruments, jurisdictions).
    - **Chat** — `ChatSection` (ask the book; routed through the agent pipeline).
      All four bind to the one active book + one scan result so it is visually obvious they are the same truth.

The point of the single-screen co-presentation: the table, brief, graph, and chat are demonstrably the **same evidence** composed differently — not four separate features.

## Data model changes

`PortfolioDoc` (in `usePortfolio.ts`):

- Add `kind?: 'retail' | 'institutional'` (default `'retail'` for back-compat).
- Add `mandate?: MandateMeta` for institutional books: `{ pack: string; question: string; context?: string }` (parallels `goal` for retail).

New institutional fixture `assets/edd-fixture.json` (loaded alongside the household fixture). `defaultPortfolios()` merges institutional books in rather than replacing retail.

# Implementation Steps

- [ ] Write this design doc.
- [ ] Data model: add `kind` + `MandateMeta` to `PortfolioDoc`; create `assets/edd-fixture.json`; merge into `defaultPortfolios()`.
- [ ] Mandate presets: add EDD / KYC / Portfolio Risk / Retail policy profiles in `useScoringSettings.ts` (reuse existing engine).
- [ ] New `/workspace` surface composing seam (SourceFusionBar + module chips + AgentPipelineViewer) + four renders (table / narrative / graph / chat) over one book.
- [ ] Add nav entry; reframe agent-builder copy; expose module names + provenance on this surface.
- [ ] `npm run build` + `npm run format`; walk the surface.

# Open questions

- Exact hero issuer for the scripted walkthrough (pick during build based on which name has the richest live Elemental signal).
- Whether to instrument a literal "monitoring trigger → analysis" animation, or keep the seam status-driven off the existing scan SSE for v1 (default: reuse existing scan flow for v1).
