# Prism

## Vision

# Goals-Based Personal Investing — Product Design Document

**Created:** 2026-05-19
**Updated:** 2026-05-29 (rewritten to match the retail goals-based pivot)
**Author:** Cursor + Product Team
**Status:** Active
**App ID:** portfolio-risk

---

## 0. Document Purpose

Define the product and UX design for **Prism**, a personal goals-based investing demo. Prism shows how Elemental can power a retail investing experience: a named investor has several goal "buckets" (Retirement, House Down Payment, Emergency Fund, etc.), each with a purpose and time horizon. The hero insight is **horizon-vs-risk fit** — is this bucket's actual risk profile appropriate for how soon you'll need the money?

The institutional scoring engine (SEC, news, stocks, prediction markets) is retained as evidence for _"what's happening to your holdings"_, surfaced in plain retail language on the default path and accessible in full detail via an "under the hood" section.

---

## 1. Executive Summary

Prism demonstrates Elemental as the context engine behind a goals-based personal portfolio. Starting from named goal buckets (each containing a list of companies/instruments), agents resolve entities through Elemental, gather multi-source context (SEC filings, news sentiment, stock signals, prediction market indicators), compute risk scores, and surface results through investor-friendly dashboards.

The demo makes three things visible:

1. **Multi-source signal fusion** — the same holding seen through SEC, news, market, and prediction market lenses, fused into a single plain-language risk picture with evidence.
2. **Horizon fit** — for each goal bucket, the system answers _"is this bucket's risk level appropriate for its timeline and this investor's tolerance?"_ A 4-year house down payment bucket loaded with volatile growth stocks triggers a clear red flag.
3. **Agent intelligence** — agents are not hidden infrastructure. The investor (or a demo observer) can see agents resolving entities, gathering context, running analytical modules, and composing answers. Pipeline steps, evidence chains, and cost/latency metadata are all visible in the "Ask" and "Under the hood" sections.

The builder takeaway: _"Elemental gives me a fused, evidence-backed view of any portfolio of companies — and agents do all of that work continuously. I didn't build any data pipelines."_

---

## 2. Product Vision

### What We're Building

A three-surface investor app + two under-the-hood surfaces:

**Investor path (primary)**

1. **Overview** (`/household`) — see all goal buckets at a glance; two headline questions: _Are the goals built right?_ / _Are the holdings healthy?_
2. **Goal Bucket** (`/`) — one bucket at a time: horizon-fit verdict, holdings table, multi-source coverage, AI summary.
3. **Ask** (`/agents`) — conversational interface; chat with the portfolio using the four-agent pipeline with visible steps.

**Built on Elemental (under the hood)** 4. **Relationships** (`/relationships`) — the connected universe: related companies, officers, instruments, jurisdictions from Elemental's graph. 5. **Scoring config** (`/scoring`) — fusion weights, tier thresholds, per-module settings; for demo operators or technical buyers.

### Core Experience

_"I have three goals — retirement in 35 years, a house in 4 years, an emergency fund. In under two minutes, agents have checked every holding against its timeline. My house bucket is flashing red: I'm holding high-volatility tech stocks for money I need soon."_

### Design Principles

1. **Retail language on the surface** — plain-language labels by default (Financial strength, Leadership stability, Headline risk, Price stability). Acronyms (FHS, ERS, ACS) are visible only in the Advanced / under-the-hood section.
2. **Elemental as sole data source** — no local ingestion pipelines. Every entity fact, relationship, event, and signal comes from Elemental.
3. **Horizon fit as the hero** — the primary emotional hook is the mismatch between a bucket's risk level and its timeline. Everything else is evidence that supports or explains that verdict.
4. **Agents do the work, visibly** — the user never manually triggers data pipelines. The "Ask" surface shows what agents produced and how, with evidence citations traceable to source filings and articles.
5. **Demo utility over production polish** — practical outputs a person could act on immediately.

---

## 3. Demo Narrative

### 3.1 The Walk-Through (3-5 Minutes)

| Step | Presenter says                                                                                                                                               | On-screen action                                                                     | Expected result                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 1    | "This is Maya — 28 years old, saving for retirement and a house."                                                                                            | Switch to Maya in the user selector on Overview.                                     | Overview shows two buckets, profile chips (age, tolerance).                                |
| 2    | "Her house bucket is flagged. Let me show why."                                                                                                              | Click "House Down Payment" bucket card.                                              | Goal Bucket opens for House Down Payment.                                                  |
| 3    | "She needs this money in 4 years, but agents detected that her holdings behave like a long-horizon aggressive portfolio."                                    | Point to Horizon Fit card — verdict "Too aggressive."                                | Timeline visual: 4-year horizon vs. aggressive holdings band. Drawdown statement visible.  |
| 4    | "Let me run a scan so we see the live signal detail."                                                                                                        | Click Run scan.                                                                      | Agent pipeline animates. Holdings table populates with scores. Source Fusion Bar fills in. |
| 5    | "Every score traces back to source."                                                                                                                         | Click a holding, expand Financial strength lens panel.                               | Evidence panel shows SEC filing citations with form type, date, section.                   |
| 6    | "Now let me ask the system a question."                                                                                                                      | Open Ask. Type: _"Is my House Down Payment bucket too risky for a 4-year timeline?"_ | Agent pipeline runs visibly. Narrative answer with evidence citations.                     |
| 7    | "For builders: Elemental provides all of this — entities, relationships, events, news, market data — through a single API. We wrote no ingestion pipelines." | Navigate to Relationships under "Built on Elemental."                                | Graph shows portfolio entities and their connected companies, officers, instruments.       |

### 3.2 The One-Sentence Takeaway

_"Elemental gives you a fused, evidence-backed view of any portfolio — and agents surface the insight that matters: is this money in the right place for when you'll need it?"_

---

## 4. Data Model

### 4.1 What Comes from Elemental (Read-Only)

All entity data, relationships, events, properties, and signals are sourced from Elemental.

| Data Domain               | Elemental Source             | Retail surface label   |
| ------------------------- | ---------------------------- | ---------------------- |
| Entity identity           | Entity resolution layer      | Holding name / ticker  |
| SEC filing signals        | XBRL facts + filing metadata | Financial strength     |
| Governance data           | Relationship graph           | Leadership stability   |
| Events                    | Event store                  | Material events        |
| News signals              | News sentiment layer         | Headline risk          |
| Stock signals             | Market data layer            | Price stability        |
| Prediction market signals | Polymarket integration       | Macro context          |
| Instruments               | Instrument store             | Credit / debt exposure |
| Locations                 | Location graph               | Geographic risk        |

### 4.2 What the App Stores Locally (User State)

| Table                | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `portfolios`         | Goal bucket definitions (name, goal, horizon, priority) |
| `portfolio_entities` | Holding list per bucket                                 |
| `entity_scores`      | Agent-computed risk scores per holding per lens         |
| `entity_assessments` | User overrides and notes                                |
| `agent_sessions`     | Pipeline run audit log                                  |
| `agent_traces`       | Per-agent step traces                                   |
| `context_cache`      | Cached Elemental responses with TTL                     |
| `chat_history`       | Conversational dialogue state                           |

---

## 5. Lens Vocabulary

Plain-language labels are the default. Advanced acronyms are shown only when the user enables "Advanced" mode.

| Plain label          | Advanced label            | Source   | What it measures                                      |
| -------------------- | ------------------------- | -------- | ----------------------------------------------------- |
| Financial strength   | Solvency (FHS)            | SEC      | Balance-sheet health, leverage, distress events       |
| Leadership stability | Executive risk (ERS)      | SEC      | Officer/director departures, governance concentration |
| Headline risk        | News pressure             | NEWS     | Negative news sentiment, mention velocity             |
| Price stability      | Market signal             | STOCK    | 30-day price trend, volatility, RSI/MACD              |
| Material events      | Event pressure            | NEWS/SEC | Severity-weighted 8-K event clusters                  |
| Ownership flags      | Adversarial capital (ACS) | CSL      | Sanctions screening, high-risk ownership paths        |
| Overall risk         | Fused risk                | all      | Weighted blend of the lenses above                    |

---

## 6. Agent Pipeline

Four-agent pipeline identical to the institutional spec. Invoked by portfolio scan, entity click, relationship explorer open, and conversational chat.

```
User action (load bucket / run scan / ask question)
        │
        ▼
┌─────────────────────────────────┐
│  DIALOGUE AGENT                 │  Resolves entity names → NEIDs
│                                 │  Interprets natural-language questions
└─────────────────┬───────────────┘
                  ▼
┌─────────────────────────────────┐
│  HISTORY AGENT                  │  Fetches multi-source context from Elemental
│                                 │  (SEC, news, stock, instruments, locations)
└─────────────────┬───────────────┘
                  ▼
┌─────────────────────────────────┐
│  QUERY AGENT                    │  Runs scoring modules, detects conflicts,
│                                 │  evaluates horizon fit, identifies patterns
└─────────────────┬───────────────┘
                  ▼
┌─────────────────────────────────┐
│  COMPOSITION AGENT              │  Formats for the active surface
│                                 │  (table row, chat narrative, evidence panel)
└─────────────────────────────────┘
```

### Fused Score

```
overall_risk = financial_strength × 0.35 + leadership × 0.25 + material_events × 0.25 + headline_risk × 0.15
```

Weights are configurable in Scoring config. When lenses disagree (e.g., strong financials but deteriorating news), the Query Agent flags the conflict and explains the divergence.

---

## 7. UI Surfaces

### 7.1 Overview (`/household`)

Hero: two headline questions in tonal cards — _"Are the goals built right?"_ (horizon-fit summary across all buckets) / _"Are the holdings healthy?"_ (worst-tier holding across all buckets).

Below: Construction Spectrum (all buckets plotted on a Steady → Growth axis by risk profile) + bucket cards (one per goal with horizon-fit verdict chip, health summary, overlap flags).

Cross-bucket concentration panel: holdings that appear in multiple buckets — intentional or not?

### 7.2 Goal Bucket (`/`)

Selector: user + active bucket. Scan button. Scan elapsed time.

Row 1: Horizon Fit card (visceral timeline: "need this money in N years" vs. holdings' actual risk band; drawdown statement when too aggressive) + Holdings Health card (worst tier, needs-attention count, per-lens worst).

Row 2: Source Fusion Bar (coverage breadth across SEC, News, Market, Macro — framed as "all from one API") + Risk Distribution (tier histogram) + Macro Context (Polymarket overlay).

Tabs: Holdings (ranked table, plain-language column headers) | AI Summary | [Advanced: Financial / Leadership / Ownership].

### 7.3 Ask (`/agents`)

Conversational chat routed through the four-agent pipeline. Retail suggestion chips. Agent Pipeline Viewer shows step status. Cost & Performance panel shows honest metrics (tool calls, LLM tokens, est. cost, duration). Activity feed. Session history.

### 7.4 Relationships (`/relationships`) — Built on Elemental

Force-directed graph of the portfolio's connected universe: companies, officers, instruments, locations. Cross-portfolio patterns (shared board members, common lenders, geographic clusters). Plain-language but technical depth is appropriate here — this surface is for builders.

### 7.5 Scoring config (`/scoring`) — Built on Elemental

Fusion lens weights, tier bands, per-module thresholds. Presets (Conservative / Moderate / Aggressive). Live preview table. Re-scan button. Labels use advanced acronyms (FHS / ERS / ACS) — audience is technical.

---

## 8. Preloaded Demo Personas

Three personas ship with the fixture (`assets/household-fixture.json`):

| Persona           | Age | Tolerance | Interesting scenario                                                                          |
| ----------------- | --- | --------- | --------------------------------------------------------------------------------------------- |
| **Maya**          | 28  | 4/5       | House Down Payment bucket is intentionally too aggressive — triggers the red-flag demo moment |
| **David & Priya** | 44  | 3/5       | Mixed: retirement on track, college fund borderline                                           |
| **Robert**        | 63  | 2/5       | Near-retirement — conservative tolerance, but one bucket carries growth-stock exposure        |

Every score, relationship, and signal comes from live Elemental-backed APIs at runtime.

---

## 9. Verification

- `npm run dev` and walk: Overview → open House Down Payment bucket → Run scan → Ask. Confirm: no FHS/ERS/ACS jargon on default surfaces, retail prompts in chat, Elemental framing visible in Source Fusion Bar, horizon-fit reads clearly on the House bucket.
- `npm run format` before committing.

---

## Status

Core scaffold complete. All five surfaces wired with prefs-backed portfolio store, Nitro routes, and SSE-driven scan/activity flows. Portfolio scans resolve entities and compute lens scores from Elemental-backed APIs. Retail language pivot applied across primary surfaces.

## Modules

### Overview (`pages/household.vue`)

Two-question hero band, construction spectrum, per-bucket cards with horizon-fit verdicts, cross-bucket overlap detection, household-wide health rollup.

### Goal Bucket (`pages/index.vue`)

Horizon Fit card + Holdings Health card row; Source Fusion Bar + Risk Distribution + Macro Context row; Holdings table with plain-language column headers; AI Summary tab; Advanced FHS/ERS/ACS tabs gated behind an Advanced toggle.

### Ask (`pages/agents.vue`)

Conversational chat, four-agent pipeline viewer, cost & performance (honest metrics), activity feed, session history. Retail suggestion chips.

### Relationships (`pages/relationships.vue`)

SVG force-laid-out graph, filterable by entity type, plus tabular Companies / People / Instruments / Locations tabs and Cross-Portfolio Patterns panel.

### Scoring config (`pages/scoring.vue`)

Per-portfolio scoring configuration — fusion weights, tier bands, per-module thresholds. Technical surface for demo operators and builders.

## Known Follow-ups

- Richer event enrichment in entity timelines.
- Deeper relationship traversal and broader PID coverage for portfolio-level pattern detection.
- Optional `targetAmount` on `GoalMeta` to unlock dollar-consequence estimates in the Horizon Fit card.
