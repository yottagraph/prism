# Prism

## Vision

# Portfolio Risk Monitoring Prototype - Product Requirements Document

**Created:** 2026-05-19  
**Author:** Cursor + Product Team  
**Status:** Draft  
**App ID:** portfolio-risk  
**Target Repo:** `portfolio-risk-prototype` (standalone sibling repo)  
**Source Context Repo:** `my-DSERP-FSI`

---

## 0. Document Purpose

Define a build-ready product and engineering spec for a standalone demo app that shows how Elemental can power a portfolio risk monitoring workflow. The prototype demonstrates multi-source context fusion (SEC, news, stocks, prediction markets), agent-driven analytics, and relationship exploration across companies, people, instruments, and locations — all sourced from Elemental's knowledge graph.

This PRD is stored in the FSI repository for traceability and pattern reuse. Implementation is explicitly out-of-repo in a separate codebase.

---

## 1. Executive Summary

The prototype demonstrates Elemental as the context engine behind portfolio risk monitoring. Starting from a named list of companies (a portfolio), agents resolve each entity through Elemental, gather multi-source context (SEC filings, news sentiment, stock signals, prediction market indicators), compute fused risk scores, and surface the results through portfolio-level dashboards, entity-level profiles, and relationship exploration views.

The demo makes three things visible:

1. **Multi-source fusion** — the same entity seen through SEC, news, market, and prediction market lenses, fused into a single defensible risk picture with evidence.
2. **Relationship depth** — for any portfolio, the system surfaces related companies (subsidiaries, peers, counterparties), related people (officers, directors, beneficial owners), related instruments (credit facilities, bonds, holdings), and related locations (HQs, jurisdictions) — all from Elemental's graph.
3. **Agent behavior** — agents are not hidden infrastructure. The user sees agents resolving entities, gathering context, running analytical modules, and assembling outputs. Pipeline steps, evidence chains, and cost/latency metadata are all visible.

The buyer takeaway: "Elemental can tell me which companies in my portfolio are deteriorating, why, who and what they're connected to, and defend every conclusion with evidence — and agents do all of that work continuously."

---

## 2. Product Vision

### What We're Building

A four-surface demo app:

1. **Portfolio Overview** — load a portfolio, see all entities ranked by fused risk with agent-driven scoring.
2. **Entity Deep Dive** — drill into any entity for multi-source context, risk drivers, and evidence.
3. **Relationship Explorer** — see the portfolio's relationship universe: companies, people, instruments, locations, with graph and tabular views.
4. **Agent Workspace** — interact with agents conversationally, watch pipeline execution, inspect traces.

### Core Experience

"Load 50 companies. In under two minutes, agents have scored them all, surfaced the connected universe, and the riskiest names are at the top with evidence I can defend."

### Design Principles

1. **Elemental as sole data source** — no local ingestion pipelines. Every entity fact, relationship, event, and signal comes from Elemental through its query interface. The app stores only user state (projects, assessments, agent sessions).
2. **Multi-source fusion as the narrative** — the demo must explicitly show SEC data alone, then news data layered on, then stock signals, then prediction markets, then the fused picture. The story is convergence.
3. **Agents do the work, visibly** — the user never manually triggers data pipelines. Agents gather, analyze, and compose. The UI shows what agents produced and how.
4. **Portfolio-first, entity-deep** — entry point is always a portfolio. Entity views are drill-downs, not standalone pages. Relationships are portfolio-scoped ("show me the universe connected to my portfolio").
5. **Demo utility over production polish** — practical outputs a risk team could act on immediately. Latency targets are demo-friendly (seconds, not milliseconds).

---

## 3. Problem Statement

Credit and risk teams managing portfolios of 50-500 companies face a fragmented intelligence problem:

- SEC filings, news, market data, and prediction markets live in separate systems with separate identities.
- Relationships between portfolio companies (shared directors, subsidiary chains, common lenders, geographic co-location) are implicit and require manual discovery.
- Risk scoring is either opaque (vendor black boxes) or manual (analyst spreadsheets).
- When a risk conclusion is challenged in committee, the evidence trail is scattered across sources.

Elemental resolves all of these by providing a unified context layer where entities, relationships, events, and evidence are pre-resolved and queryable. This prototype demonstrates that resolution in action.

---

## 4. Goals, Non-Goals, and Users

### Goals (v1)

- Deliver an end-to-end live demo in 3-4 weeks.
- Load a portfolio of 20-50 companies and score all entities using agent-driven multi-source fusion.
- Surface the relationship universe for the portfolio: related companies, people, instruments, locations.
- Provide entity-level deep dives with multi-source context breakdown and evidence.
- Show agent pipeline execution with visible steps, traces, and cost metadata.
- Demonstrate conversational interaction ("Why is this company ranked highest?" / "What connects Company A to Company B?").

### Non-Goals (v1)

- Production-grade continuous monitoring (background loops, scheduled re-scans).
- Standing instruction configuration.
- PDF/PPT export of risk cards.
- Blast radius propagation modeling.
- Real-time streaming market data.
- Custom threshold alerting.

### Target Users

- **Primary:** Risk/compliance technology evaluators at banks and asset managers.
- **Operator:** Elemental sales engineer / demo lead.
- **Secondary:** Internal product and engineering reviewers.

---

## 5. Demo Narrative

### 5.1 The Walk-Through (3-5 Minutes)

| Step | Presenter says                                                                                                                                                                                 | On-screen action                                                                                                                 | Expected result                                                                                                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | "Let me load a portfolio. This is a CLO with 40 mid-market issuers."                                                                                                                           | Select or create a portfolio from a preloaded list, or paste company names.                                                      | Portfolio loads. Agent activity begins — entity resolution kicks off visibly.                                                                                                                             |
| 2    | "Agents are now gathering context from Elemental. Watch — they're pulling SEC filings, news, stock signals, and prediction market indicators for each company."                                | Agent pipeline panel animates: Dialogue → History → Query → Composition per entity, with source badges (SEC, NEWS, STOCK, POLY). | Progressive loading — entities appear in the table as agents complete, sorted by fused risk.                                                                                                              |
| 3    | "The portfolio is scored. The riskiest names are at the top. Let me show you why this one is flagged."                                                                                         | Click top-ranked entity. Entity Deep Dive opens.                                                                                 | Multi-source breakdown: solvency (from SEC), executive risk (from SEC), news pressure (from news), market signal (from stock), macro context (from Polymarket). Each lens shows score, drivers, evidence. |
| 4    | "Each score traces back to source. This solvency score comes from leverage ratios in the 10-K. This news pressure score comes from three negative articles last week. Nothing is a black box." | Expand evidence panels for solvency and news pressure lenses.                                                                    | Filing citations with form type, date, section. Article citations with headline, outlet, date, sentiment.                                                                                                 |
| 5    | "Now let me show the connected universe. For this portfolio, Elemental knows every related company, every officer and director, every credit facility, and every location."                    | Switch to Relationship Explorer tab.                                                                                             | Graph visualization showing portfolio entities as core nodes, with 1-hop related entities clustered by type: companies (blue), people (green), instruments (orange), locations (red).                     |
| 6    | "I can see that three of my portfolio companies share a board member. That's a governance concentration risk I wouldn't have found manually."                                                  | Click a person node connected to multiple portfolio entities.                                                                    | Person detail panel: name, roles, companies served, tenure, departure history.                                                                                                                            |
| 7    | "Let me ask the system a question."                                                                                                                                                            | Open Agent Workspace chat. Type: "What connects Acme Corp to Global Industries, and should I be concerned?"                      | Agent pipeline runs visibly: Dialogue (resolves entities) → History (graph traversal) → Query (path analysis + risk assessment) → Composition (narrative answer with evidence).                           |
| 8    | "The answer cites specific relationships and evidence. I can defend this in committee."                                                                                                        | Point to citation chips and evidence panel in the agent response.                                                                | Response includes relationship path, risk drivers along the path, and source citations.                                                                                                                   |

### 5.2 The One-Sentence Takeaway

"Elemental gives you a fused, evidence-backed risk picture of your entire portfolio and its connected universe — and agents do all the work."

---

## 6. Data Model

### 6.1 What Comes from Elemental (Read-Only)

All entity data, relationships, events, properties, and signals are sourced from Elemental. The prototype never ingests raw data.

| Data Domain                   | Elemental Source             | What It Provides                                                                                                                |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Entity identity**           | Entity resolution layer      | CIK, NEID, LEI, ticker, legal name, entity type, SIC code, jurisdiction                                                         |
| **SEC filing signals**        | XBRL facts + filing metadata | Financial ratios (leverage, coverage, margins), filing recency, form types, extraction lineage                                  |
| **Governance data**           | Relationship graph           | Officers, directors, beneficial owners, subsidiaries, parent entities — with tenure and departure dates                         |
| **Events**                    | Event store                  | 8-K material events (25+ types), executive departures, auditor changes, M&A, restructuring — with dates, participants, severity |
| **News signals**              | News sentiment layer         | Article mentions, sentiment scores, mention velocity, negative clusters, source outlets                                         |
| **Stock signals**             | Market data layer            | Price history, returns, volatility, technical indicators (RSI, MACD), anomalies                                                 |
| **Prediction market signals** | Polymarket integration       | Event probabilities for macro indicators (recession odds, sector stress) and company-specific events                            |
| **Instruments**               | Instrument store             | Credit facilities (amount, maturity, lender, covenants), bonds/notes (CUSIP, FIGI, principal, maturity), holdings positions     |
| **Locations**                 | Location graph               | HQ addresses, jurisdictions, facility locations, geographic relationships                                                       |

### 6.2 What the Prototype Stores Locally (User State)

A lightweight local database holds only user-generated and agent-generated state. This follows the same pattern as the Agent-First FSI PRD.

| Table                | Purpose                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `portfolios`         | Portfolio definitions (name, description, created timestamp)                              |
| `portfolio_entities` | Entity list per portfolio (NEID, name, entity type, added timestamp)                      |
| `entity_scores`      | Agent-computed risk scores per entity per lens (solvency, executive, news, market, fused) |
| `entity_assessments` | Analyst severity overrides and justifications                                             |
| `agent_sessions`     | Pipeline run audit log (trigger, status, duration, entity count)                          |
| `agent_traces`       | Per-agent step traces (input summary, output summary, duration, evidence count)           |
| `context_cache`      | Cached Elemental responses with TTL (avoids redundant calls during a session)             |
| `chat_history`       | Conversational dialogue state per session                                                 |

### 6.3 Cloud Infrastructure

| Component                 | Purpose                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Graph DB (local file)** | The local user-state database (SQLite or equivalent). Not a separate graph database — Elemental is the graph. Local storage is relational.                                                                                                     |
| **KV Cache**              | Session-scoped cache for Elemental responses. Keyed by `(portfolio_id, neid, data_type)` with configurable TTL (default 15 minutes for demo, longer for production). Prevents redundant Elemental calls during portfolio load and exploration. |
| **Frontend**              | Single-page application. Receives agent outputs via server-sent events. Renders portfolio views, entity profiles, relationship graphs.                                                                                                         |

---

## 7. Agent Pipeline

The prototype uses a four-agent pipeline. Each user interaction that requires Elemental data flows through this pipeline. The agents map to the taxonomy from "Demonstrating Agent-Driven Intelligence with Elemental" (monitoring → analytic → composition), adapted for interactive demo use.

### 7.1 Pipeline Flow

```
User Request (load portfolio, click entity, ask question)
        │
        ▼
┌─────────────────────────────────────────┐
│  DIALOGUE AGENT (Context Interface)     │
│                                         │
│  Resolves ambiguity:                    │
│  - "Acme Corp" → Acme Corporation      │
│    (NEID: 0001234567)                   │
│  - "last quarter" → Q4 2025            │
│  - "our portfolio" → active entity list │
│  - "connections" → relationship types   │
│                                         │
│  Output: Structured Retrieval Plan      │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  HISTORY AGENT (Knowledge Graph)        │
│                                         │
│  Executes retrieval against Elemental:  │
│  - Entity facts + identifiers           │
│  - Relationships (all flavors)          │
│  - Events (with participants)           │
│  - News sentiment + velocity            │
│  - Stock signals + anomalies            │
│  - Instrument data                      │
│  - Location data                        │
│                                         │
│  Output: Multi-Source Context Package   │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  QUERY AGENT (Analytical Reasoning)     │
│                                         │
│  Runs analytical modules over context:  │
│  - Solvency scoring (financial health)  │
│  - Executive risk scoring (governance)  │
│  - News pressure scoring (sentiment)    │
│  - Market signal scoring (price/vol)    │
│  - Fused risk (weighted blend)          │
│  - Relationship path analysis           │
│  - Cross-entity pattern detection       │
│                                         │
│  Output: Analytical Result + Evidence   │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  COMPOSITION AGENT (Output Formatting)  │
│                                         │
│  Formats for the active surface:        │
│  - Portfolio table row                  │
│  - Entity profile content               │
│  - Relationship graph delta             │
│  - Narrative answer (for chat)          │
│  - Risk driver cards                    │
│                                         │
│  Output: Formatted artifact → UI (SSE)  │
└─────────────────────────────────────────┘
```

### 7.2 Pipeline Invocation Patterns

| Trigger                        | What Happens                                                                                                                                                                                                                  | Output Surface                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Portfolio load**             | Dialogue resolves all entity names → History fans out across all entities (parallel, bounded concurrency) → Query scores each entity → Composition pushes table rows progressively                                            | Portfolio Overview table populates incrementally |
| **Entity click**               | History retrieves full context for single entity (relationships, events, all sources) → Query produces detailed per-lens breakdown → Composition renders profile                                                              | Entity Deep Dive populates                       |
| **Relationship Explorer open** | History retrieves 1-hop relationships for all portfolio entities (batched) → Query identifies cross-portfolio patterns (shared people, common lenders, geographic clusters) → Composition renders graph + relationship tables | Relationship Explorer graph + panels populate    |
| **Chat question**              | Full 4-agent pipeline with conversational state                                                                                                                                                                               | Agent Workspace response with evidence           |
| **Score refresh**              | History re-fetches (bypasses cache) → Query re-scores → Composition updates table rows                                                                                                                                        | Portfolio Overview table updates                 |

### 7.3 Multi-Source Fusion

The Query Agent produces per-entity scores across four source-specific lenses, then blends them into a fused score. This fusion is the central analytical narrative of the demo.

| Lens                     | Score Range | Primary Signals                                                                                       | Elemental Source                        |
| ------------------------ | ----------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Solvency (FHS)**       | 0-100       | Leverage, equity erosion, margin compression, coverage ratios, staleness decay, distress events       | SEC XBRL facts, 8-K events              |
| **Executive Risk (ERS)** | 0-100       | Officer/director departures (recency-weighted, C-suite premium), auditor changes, cumulative patterns | SEC relationships, 8-K Item 5.02 events |
| **News Pressure**        | 0-100       | Sentiment trends, mention velocity, negative clusters, adverse media density                          | News sentiment layer                    |
| **Market Signal**        | 0-100       | 30-day price change, volatility spike, RSI extremes, anomaly detection                                | Stock data layer                        |

**Fused Risk Score:**

```
fused = solvency × w1 + executive × w2 + news × w3 + market × w4
```

Default weights: `w1=0.40, w2=0.25, w3=0.20, w4=0.15`

When sources disagree (e.g., strong financials but deteriorating news), the Query Agent flags the **agreement/conflict indicator** and explains the divergence. This is a key demo moment — showing that fusion is not averaging; it's interpretive.

**Macro Context (Polymarket):**

Prediction market signals are not scored per-entity but provide portfolio-level context: recession probability, sector stress indicators, policy risk. These are surfaced as context overlays on the Portfolio Overview and referenced by the Query Agent when generating narratives.

### 7.4 Confidence and Evidence

Every score includes:

- **Confidence level** (High/Medium/Low) based on data coverage, signal count, and freshness.
- **Risk drivers** — top 3-5 signals with one-sentence explanations and evidence citations.
- **Source badges** — each driver tagged with its data source (SEC, NEWS, STOCK, POLY).
- **Evidence chain** — from assertion → driver → metric → source document/article.

---

## 8. UI Surfaces

### 8.1 Portfolio Overview (`/`)

The entry point. Shows the portfolio as a ranked, scored entity list with agent activity.

**Layout:**

```
┌──────────────────────────────────────────────────────────────┐
│  Portfolio: [name]        Entities: [count]    [Load / New]  │
│  Agent Status: [scanning 12/50...]            [Refresh All]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌── Source Fusion Bar ──────────────────────────────────┐   │
│  │  SEC: 48/50  │  News: 45/50  │  Stock: 42/50  │  PM: │   │
│  │  ████████░░  │  █████████░   │  ████████░░    │  ██░  │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌── Risk Distribution ──┐  ┌── Macro Context ───────────┐  │
│  │  Critical: 3          │  │  Recession prob: 18%       │  │
│  │  High: 8              │  │  Credit stress: Moderate   │  │
│  │  Watch: 15            │  │  Sector outlook: Mixed     │  │
│  │  Normal: 24           │  │  (via Polymarket)          │  │
│  └───────────────────────┘  └────────────────────────────┘  │
│                                                              │
│  ┌── Ranked Entity Table ────────────────────────────────┐  │
│  │ # │ Name      │ FHS │ ERS │ News │ Mkt │ Fused │ Trend│  │
│  │ 1 │ Acme Corp │  82 │  71 │   68 │  45 │   72  │  ↑   │  │
│  │ 2 │ Beta Inc  │  78 │  35 │   85 │  62 │   68  │  ↑   │  │
│  │ 3 │ ...       │     │     │      │     │       │      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌── Agent Activity Feed (collapsible) ──────────────────┐  │
│  │  10:03:12  History Agent  Acme Corp  Retrieved 47      │  │
│  │            relationships from Elemental (1.2s)         │  │
│  │  10:03:11  Query Agent  Beta Inc  FHS: 78, ERS: 35,   │  │
│  │            Fused: 68 — conflict: strong financials     │  │
│  │            but high news pressure                      │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Key interactions:**

- Click entity row → opens Entity Deep Dive
- Sort by any score column
- Filter by risk tier, entity type, signal conflict
- Source Fusion Bar shows data coverage per source — demonstrates multi-source breadth
- Agent Activity Feed streams live updates via SSE

### 8.2 Entity Deep Dive (modal or route: `/entity/:neid`)

Full multi-source profile for a single entity.

**Sections:**

1. **Header** — Name, ticker, CIK, NEID, entity type, sector, fused risk tier badge.

2. **Score Strip** — All four lens scores rendered as horizontal bars with agreement/conflict indicator. Each bar is clickable to expand the lens detail.

3. **Lens Detail Panels** (expandable, one per source):

    | Panel                    | Content                                                                                                                     |
    | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
    | **Solvency (SEC)**       | Leverage, equity ratio, coverage, margin trends. Sparklines over recent periods. Distress events. Filing citations.         |
    | **Executive Risk (SEC)** | Current officers/directors with titles and tenure. Departures (recency-weighted list). Auditor changes. Governance summary. |
    | **News Pressure**        | Recent articles with sentiment badges. Mention velocity chart. Negative cluster detection. Source outlets.                  |
    | **Market Signal**        | Price chart (30d/90d). Volatility indicators. RSI, MACD. Anomaly flags.                                                     |
    | **Macro Context**        | Relevant Polymarket events (sector, policy, macro). Probability trends.                                                     |

4. **Risk Drivers** — Top 5 drivers ranked by contribution to fused score, each with:
    - Lens label + source badge
    - One-sentence explanation
    - Evidence citation (clickable to source)

5. **Relationships Summary** — Counts by type (companies, people, instruments, locations) with top entries shown. "Explore all" links to Relationship Explorer filtered to this entity.

6. **Events Timeline** — Recent material events ordered by date, with category icons and severity badges.

7. **Assessment Block** — Severity selector (Critical/High/Watch/Normal), free-text justification, save button.

### 8.3 Relationship Explorer (`/relationships`)

The portfolio's connected universe, rendered as both graph and structured views.

**Graph View:**

- **Core nodes:** Portfolio entities (larger, colored by risk tier).
- **Related nodes:** 1-hop connections discovered by agents, clustered by type:
    - Companies (blue) — subsidiaries, parents, peers, counterparties
    - People (green) — officers, directors, beneficial owners
    - Instruments (orange) — credit facilities, bonds, holdings
    - Locations (red) — HQs, jurisdictions, facility locations
- **Edges:** Typed and labeled (subsidiary_of, officer_of, holds_position, located_at, etc.).
- **Layout:** Force-directed with community detection. Portfolio entities form the gravitational center; related entities orbit.
- **Interactions:** Click node for detail panel. Hover for tooltip. Filter by relationship type or entity type. Search. Zoom/pan.

**Structured Views (tabs alongside graph):**

| Tab                   | Content                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Related Companies** | Table of non-portfolio companies connected to portfolio entities. Columns: name, connection type, connected to (portfolio entity), relationship count. Sortable.                                                    |
| **People**            | Officers and directors across the portfolio. Columns: name, roles, companies served (from portfolio), tenure, departure flag. Highlight people connected to multiple portfolio entities (governance concentration). |
| **Instruments**       | Credit facilities and securities. Columns: instrument type, issuer, amount, maturity, lender/holder, covenants. Highlight shared lenders across portfolio entities.                                                 |
| **Locations**         | Jurisdictions and facility locations. Columns: location, entities present, entity types, jurisdiction risk (if applicable). Map view option.                                                                        |

**Cross-Portfolio Patterns** (highlighted panel):

Agents detect and surface patterns that span multiple portfolio entities:

- **Shared board members** — people serving on 2+ portfolio companies
- **Common lenders** — credit facilities from the same institution across portfolio companies
- **Geographic concentration** — multiple portfolio companies in the same jurisdiction
- **Subsidiary overlap** — portfolio companies that share parent entities
- **Event correlation** — similar events (e.g., executive departures) occurring across multiple portfolio companies in the same time window

### 8.4 Agent Workspace (`/agents`)

The control surface and conversational interface for the agent pipeline.

**Layout:**

| Panel                  | Content                                                                                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat**               | Conversational interface routed through the full 4-agent pipeline. Supports follow-up questions. Each response shows agent steps (expandable) and evidence citations.       |
| **Pipeline Viewer**    | Visual representation of the 4-agent pipeline with status per step (pending/working/completed). Shows current entity being processed. Duration and evidence count per step. |
| **Session History**    | Table of completed pipeline runs. Columns: session ID, trigger, status, entity count, duration, timestamp. Expand for per-agent traces.                                     |
| **Cost & Performance** | Aggregate metrics for the session: total Elemental calls, cache hit rate, LLM token usage, estimated cost, total duration.                                                  |

**Example Chat Interactions:**

- "Which companies in my portfolio have the highest governance risk?"
- "What connects Acme Corp to Global Industries?"
- "Summarize the news pressure across my portfolio this month."
- "Why did Beta Inc's score increase since last week?"
- "Show me all companies where the CFO departed in the last 90 days."
- "Generate a risk brief for the top 5 deteriorating names."

---

## 9. API Surface

### Portfolio Management

| Method | Path                                 | Purpose                                             |
| ------ | ------------------------------------ | --------------------------------------------------- |
| GET    | `/api/portfolios`                    | List all portfolios                                 |
| POST   | `/api/portfolios`                    | Create portfolio (with entity names for resolution) |
| GET    | `/api/portfolios/:id`                | Get portfolio with entity count and scan status     |
| DELETE | `/api/portfolios/:id`                | Delete portfolio                                    |
| GET    | `/api/portfolios/:id/entities`       | List entities with latest scores                    |
| POST   | `/api/portfolios/:id/entities`       | Add entities (names resolved via Dialogue Agent)    |
| DELETE | `/api/portfolios/:id/entities/:neid` | Remove entity                                       |

### Agent Pipeline

| Method | Path                          | Purpose                                     |
| ------ | ----------------------------- | ------------------------------------------- |
| POST   | `/api/agents/scan`            | Run pipeline for portfolio or single entity |
| POST   | `/api/agents/chat`            | Conversational dialogue with session state  |
| GET    | `/api/agents/activity-stream` | SSE endpoint for live agent activity        |
| GET    | `/api/agents/sessions`        | List completed sessions                     |
| GET    | `/api/agents/sessions/:id`    | Session detail with per-agent traces        |

### Entity Data (Agent-Cached)

| Method | Path                                             | Purpose                                                 |
| ------ | ------------------------------------------------ | ------------------------------------------------------- |
| GET    | `/api/portfolios/:id/entity/:neid/profile`       | Full entity profile (all lenses, relationships, events) |
| GET    | `/api/portfolios/:id/entity/:neid/scores`        | Score breakdown with evidence                           |
| GET    | `/api/portfolios/:id/entity/:neid/relationships` | Relationships by type                                   |
| GET    | `/api/portfolios/:id/entity/:neid/events`        | Events timeline                                         |

### Relationship Explorer

| Method | Path                                            | Purpose                                           |
| ------ | ----------------------------------------------- | ------------------------------------------------- |
| GET    | `/api/portfolios/:id/relationships/graph`       | Graph data for the portfolio's connected universe |
| GET    | `/api/portfolios/:id/relationships/companies`   | Related companies table                           |
| GET    | `/api/portfolios/:id/relationships/people`      | People across portfolio                           |
| GET    | `/api/portfolios/:id/relationships/instruments` | Instruments across portfolio                      |
| GET    | `/api/portfolios/:id/relationships/locations`   | Locations across portfolio                        |
| GET    | `/api/portfolios/:id/relationships/patterns`    | Cross-portfolio patterns                          |

### Portfolio Analytics

| Method | Path                              | Purpose                                                        |
| ------ | --------------------------------- | -------------------------------------------------------------- |
| GET    | `/api/portfolios/:id/dashboard`   | Aggregate portfolio metrics (risk distribution, macro context) |
| POST   | `/api/portfolios/:id/narrative`   | Generate portfolio-level risk narrative                        |
| POST   | `/api/portfolios/:id/assessments` | Save analyst assessment for an entity                          |

---

## 10. Relationship Discovery — What Agents Find

This section defines the relationship types agents discover from Elemental and how they're surfaced. This is the core differentiation of the demo — showing the connected universe.

### 10.1 Relationship Types from Elemental

| Relationship Type      | From → To                | What It Reveals                                                                                          |
| ---------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `subsidiary_of`        | Company → Parent         | Corporate ownership chains. Critical for understanding conglomerate exposure.                            |
| `officer_of`           | Person → Company         | Executive leadership. Tenure and departure patterns indicate governance stability.                       |
| `director_of`          | Person → Company         | Board composition. Shared directors across portfolio = governance concentration.                         |
| `beneficial_owner_of`  | Person/Fund → Company    | Ownership influence. Activist positions, insider stakes.                                                 |
| `compensation_peer_of` | Company → Company        | Companies that consider each other peers for compensation benchmarking. Proxy for competitive landscape. |
| `holds_position`       | Institution → Instrument | Institutional holdings. Which funds own which securities in the portfolio.                               |
| `issued_by`            | Instrument → Company     | Issuer linkage. Which portfolio company issued which debt/equity.                                        |
| `located_at`           | Entity → Location        | Geographic presence. Jurisdiction exposure, regional concentration.                                      |
| `subject_of_event`     | Company → Event          | Material events. Filing-backed discrete occurrences.                                                     |
| `lender_of`            | Institution → Facility   | Credit facility relationships. Common lenders = potential contagion path.                                |

### 10.2 Discovery Depth

- **Portfolio load:** 1-hop relationships for all portfolio entities (companies, people, instruments, locations directly connected).
- **Entity drill-down:** 2-hop for the selected entity (connections of connections).
- **Chat queries:** Agents can traverse deeper on demand ("What connects A to B through intermediate entities?").

### 10.3 Pattern Detection

Agents don't just retrieve relationships — they identify patterns that create portfolio-level intelligence:

| Pattern                         | Detection Logic                                                                 | Risk Implication                                         |
| ------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Governance interlock**        | Person with `officer_of` or `director_of` to 2+ portfolio entities              | Single-person risk; departure impacts multiple holdings  |
| **Common lender concentration** | Same institution as `lender_of` for 3+ portfolio entities                       | Credit contagion if lender tightens                      |
| **Subsidiary chain exposure**   | Portfolio entity is `subsidiary_of` another portfolio entity (or shared parent) | Risk correlation — parent distress flows downstream      |
| **Geographic cluster**          | 5+ portfolio entities `located_at` same jurisdiction                            | Regulatory or macro event impacts cluster simultaneously |
| **Coordinated departures**      | Multiple portfolio entities have officer departures in the same 30-day window   | Possible sector stress or shared governance problem      |
| **Ownership overlap**           | Same `beneficial_owner_of` for 2+ portfolio entities                            | Activist or concentration risk                           |

---

## 11. Preloaded Demo Data

The prototype should ship with 2-3 preloaded portfolios that demonstrate different risk profiles:

| Portfolio                | Description                                                                                          | Entity Count | Why It's Interesting                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **CLO Mid-Market**       | Mix of mid-cap industrial and service companies typical of a CLO portfolio                           | 30-40        | Range of financial health — includes known deteriorating names alongside stable ones. Shows solvency lens at its best.  |
| **Tech Growth**          | High-growth technology companies with governance-heavy signal profile                                | 15-20        | Executive turnover patterns, recent IPOs with limited filing history. Shows executive risk lens and staleness handling. |
| **Distressed Watchlist** | Companies with known recent distress events (bankruptcy filings, delisting notices, auditor changes) | 10-15        | High-severity events and multi-source signal convergence. Shows the "known problem names rise to the top" narrative.    |

Preloaded portfolio membership can be bundled as a fixture, but every score, relationship, and macro/fundamental signal must come from live Elemental-backed APIs at runtime.

---

## 12. Proposed Repository Layout

```text
portfolio-risk-prototype/
  app.vue
  pages/
    index.vue                     # Portfolio Overview
    entity/
      [neid].vue                  # Entity Deep Dive
    relationships.vue             # Relationship Explorer
    agents.vue                    # Agent Workspace
  composables/
    usePortfolio.ts               # Portfolio CRUD and state
    useEntityProfile.ts           # Entity data management
    useRelationships.ts           # Relationship graph and tables
    useAgentPipeline.ts           # Agent pipeline state + SSE
    useFusedScoring.ts            # Multi-source score fusion logic
    useCache.ts                   # KV cache interface
  components/
    PortfolioTable.vue            # Ranked entity table
    SourceFusionBar.vue           # Multi-source coverage indicator
    RiskDistribution.vue          # Tier histogram
    MacroContext.vue               # Polymarket macro overlay
    EntityScoreStrip.vue          # Four-lens score bars
    LensDetailPanel.vue           # Per-source expandable detail
    RiskDriverCards.vue           # Top risk drivers with evidence
    RelationshipGraph.vue         # Sigma.js graph visualization
    RelationshipTable.vue         # Structured relationship views
    PatternCards.vue              # Cross-portfolio pattern alerts
    AgentChat.vue                 # Conversational interface
    AgentPipelineViewer.vue       # 4-step pipeline animation
    AgentActivityFeed.vue         # Live SSE activity stream
    SessionHistory.vue            # Completed session table
    EvidencePanel.vue             # Source citation drill-down
    AssessmentBlock.vue           # Analyst severity + justification
  server/
    api/
      portfolios/                 # Portfolio management routes
      agents/                     # Agent pipeline + chat + SSE
    agents/
      pipeline.py                 # Pipeline orchestrator
      dialogue_agent.py           # Agent 1: Context Interface
      history_agent.py            # Agent 2: KG Retrieval
      query_agent.py              # Agent 3: Analytical Reasoning
      composition_agent.py        # Agent 4: Output Formatting
      modules/
        solvency.py               # FHS scoring module
        executive.py              # ERS scoring module
        news_pressure.py          # News scoring module
        market_signal.py          # Stock scoring module
        pattern_detection.py      # Cross-portfolio patterns
    utils/
      db.ts                       # Local state DB
      cache.ts                    # KV cache implementation
      elemental.ts                # Elemental client wrapper
  scripts/
    hydrate-portfolios.ts         # Refresh portfolio fixture members from Elemental
  docs/
    PRD.md                        # This document
  .env.example
```

Expected env vars:

- `ELEMENTAL_ENDPOINT` — Elemental query/MCP endpoint
- `ELEMENTAL_API_KEY` — Authentication
- `GEMINI_API_KEY` — LLM for agent reasoning
- `CACHE_TTL_SECONDS` — KV cache TTL (default 900)

---

## 13. Build Phases

| Phase                                 | Timeline   | Deliverables                                                                                                                                                   |
| ------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 0: Scaffold**                 | Days 1-3   | Repo scaffold, Elemental client integration, portfolio CRUD, local DB schema, KV cache layer                                                                   |
| **Phase 1: Portfolio + Scoring**      | Days 4-10  | Agent pipeline (4 agents), portfolio load with parallel entity scanning, multi-source score fusion, Portfolio Overview with ranked table and source fusion bar |
| **Phase 2: Entity Deep Dive**         | Days 11-15 | Entity profile with per-lens detail panels, risk driver cards, evidence drill-down, events timeline, assessment block                                          |
| **Phase 3: Relationships**            | Days 16-20 | Relationship Explorer graph + structured views, cross-portfolio pattern detection, people/instruments/locations tables                                         |
| **Phase 4: Agent Workspace + Polish** | Days 21-25 | Conversational chat, pipeline viewer animation, session history, cost/performance panel, preloaded demo portfolios, demo script rehearsal                      |

---

## 14. Success Criteria

### Demo-Ready

- [ ] Load a 30-entity portfolio and see all entities scored within 120 seconds.
- [ ] Fused risk ranking surfaces known-deteriorating names in the top 10.
- [ ] Entity Deep Dive shows all four source lenses with evidence for at least 80% of entities.
- [ ] Relationship Explorer surfaces at least one cross-portfolio pattern (shared person, common lender, or geographic cluster).
- [ ] Agent chat answers "Why is this company ranked highest?" in under 10 seconds with cited evidence.
- [ ] Agent pipeline steps are visible and comprehensible to a non-technical viewer.
- [ ] Source Fusion Bar shows differentiated coverage across SEC, news, stock, and prediction market sources.

### Engineering

- [ ] Zero local data ingestion pipelines — all entity data sourced from Elemental.
- [ ] KV cache reduces redundant Elemental calls by >50% during portfolio exploration.
- [ ] Agent traces are complete and auditable — every pipeline run has per-step records.
- [ ] Preloaded portfolios initialize correctly from the fixture.

### Buyer Outcome

A risk technology evaluator can explain the value proposition in one sentence:

"Elemental fuses SEC, news, market, and prediction data into a single risk picture for my portfolio, surfaces every connection, and defends every conclusion with evidence — and I didn't build any of that."

---

## 15. Risks and Open Questions

1. **Elemental data coverage** — the demo quality depends on how many of the preloaded entities have rich data across all four sources in Elemental. Entities with only SEC data will show sparse news/market panels. Mitigation: choose preloaded portfolios based on known Elemental coverage.

2. **Elemental latency at scale** — 30-entity portfolio with 1-hop relationships could mean hundreds of Elemental calls. The History Agent's parallel fan-out with bounded concurrency (8-10 concurrent calls) and KV cache are the mitigation. If Elemental latency is >2s per call, portfolio load will exceed the 120-second target.

3. **Prediction market signal sparsity** — Polymarket may not have events relevant to specific portfolio companies. Mitigation: use macro-level signals (recession probability, sector stress) as portfolio context overlays rather than per-entity scores.

4. **Relationship graph density** — for large portfolios, 1-hop expansion could produce thousands of nodes. Mitigation: cap related entities at N per type (e.g., top 20 people, top 10 related companies by relationship count) and allow the user to expand on demand.

5. **Scoring calibration** — multi-source fusion weights are defaults. Different demo audiences will value different signals. Mitigation: make weights configurable in the Agent Workspace (or at minimum, documented for the demo operator to pre-adjust).

6. **Elemental interface stability** — the prototype depends on Elemental's query interface remaining stable during development. Any breaking changes to entity resolution, relationship types, or response formats will require prototype updates. Mitigation: abstract all Elemental calls through a single client module with response normalization.

---

## 16. How This Relates to Elemental vs. Agent Demonstration

This prototype is explicitly an **Agent Demonstration Environment** (Solution Pack), not an Elemental product feature. It demonstrates:

| Elemental Capability (Engine)                      | Demo Capability (Solution Pack)                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Entity resolution across SEC, news, market sources | Agents resolving portfolio entity names to canonical NEIDs                                       |
| Relationship graph with typed edges                | Relationship Explorer surfacing governance interlocks, lender concentration, geographic clusters |
| Event store with severity and participants         | Events timeline with agent-generated significance assessment                                     |
| Multi-source property series                       | Per-lens score breakdown showing SEC vs. news vs. market signals                                 |
| Temporal graph queries                             | Agent-driven "what changed since last quarter?" analysis                                         |
| Provenance and evidence chains                     | Evidence panels tracing every score back to source documents                                     |

The prototype never modifies Elemental. It reads from Elemental, applies analytical judgment through agents, stores user state locally, and surfaces results through purpose-built UI. This separation is the architecture customers should replicate.

---

## Appendix A: Reuse Map

| Need                                     | Reuse Asset                                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Multi-source scoring methodology         | [docs/guides/DATA_AGGREGATIONS_AND_RISK_SCORING.md](../guides/DATA_AGGREGATIONS_AND_RISK_SCORING.md) |
| Solvency and Executive risk calculations | Solvency/Executive deep dives in DATA_AGGREGATIONS doc                                               |
| Agent pipeline architecture              | [docs/prd/AGENT_FIRST_FSI.md](AGENT_FIRST_FSI.md)                                                    |
| Agent step UX pattern                    | [docs/reference/AGENT_PIPELINE_UX_PRD.md](../reference/AGENT_PIPELINE_UX_PRD.md)                     |
| Relationship types reference             | [docs/reference/RELATIONSHIP_TYPES.md](../reference/RELATIONSHIP_TYPES.md)                           |
| Event taxonomy                           | [docs/reference/EVENT_TAXONOMY.md](../reference/EVENT_TAXONOMY.md)                                   |
| Standalone prototype pattern             | [docs/prd/CUSTOMER_PROPENSITY_PROTOTYPE.md](CUSTOMER_PROPENSITY_PROTOTYPE.md)                        |
| Sigma.js graph patterns                  | `features/lovelace-dashboard/components/NetworkGraphTab.vue`                                         |
| SSE activity stream                      | `server/api/lovelace/agents/activity-stream.get.ts`                                                  |
| Elemental MCP client                     | `server/agents/mcp/elemental_client.py`                                                              |
| Vuetify Lovelace theme                   | `nuxt.config.ts` (vuetify section)                                                                   |

## Appendix B: Out of Scope for v1

- Standing instruction configuration (background continuous monitoring).
- Blast radius propagation scoring (network contagion modeling).
- PDF/PPT artifact export.
- Multi-portfolio comparison.
- Historical score trend tracking across sessions.
- Threshold-based alerting.
- Voice briefing interface.
- Real-time market data streaming.
- Custom extraction pipeline triggers.
- Production governance/compliance controls beyond demo-level handling.

## Status

Core scaffold complete. All four UI surfaces are wired with the prefs-backed
portfolio store, Nitro routes, and SSE-driven scan/activity flows. Portfolio
scans resolve entities and compute lens scores from Elemental-backed APIs.
Legacy placeholder fundamentals, placeholder relationship/event generation, and
hardcoded macro fallbacks have been removed from runtime scoring/profile paths.

## Modules

### Portfolio Overview (`pages/index.vue`)

Ranked entity table with FHS / ERS / News / Market / Fused scores per row,
source-fusion coverage bar, risk-tier distribution, Polymarket macro overlay,
and a live agent activity feed. "Run scan" resolves entities against the
gateway's `entities/search` endpoint and animates the agent pipeline. New
portfolios can be created from pasted entity-name lists.

### Entity Deep Dive (`pages/entity/[neid].vue`)

Header with NEID + fused-risk chip; expandable per-lens detail panels with
live fundamentals, governance metrics, news sentiment, and market signals;
top risk-driver cards with source-tagged evidence; relationship summary by
type; events timeline; and an analyst assessment block whose severity choice
and justification persist via `useAppFeaturePrefs('portfolio-risk', …)`.

### Relationship Explorer (`pages/relationships.vue`)

SVG force-laid-out graph of the portfolio's connected universe (portfolio
entities in inner ring, related companies / people / instruments / locations
clustered in the outer ring), filterable by kind, plus tabular Companies /
People / Instruments / Locations tabs and a Cross-Portfolio Patterns panel
that surfaces governance interlocks, common-lender concentration, and
geographic clusters.

### Agent Workspace (`pages/agents.vue`)

Conversational chat that routes every message through the four-agent
pipeline (Dialogue → History → Query → Composition) with a step-status viewer,
a cost & performance panel (Elemental calls, cache hit rate, LLM tokens, est.
cost, total duration), a live activity feed, and a session-history table.
Includes suggestion chips for the typical demo questions.

### Composables

- `usePortfolio` — portfolio CRUD, active selection, scan orchestration with
  bounded concurrency. Persists via `useAppFeaturePrefs('portfolio-risk', …)`.
- `useFusedScoring` — weighted fusion, tier derivation, confidence proxy,
  conflict detection, risk-driver library.
- `useEntityProfile` — single-entity deep dive from server profile routes with
  in-memory cache.
- `useRelationships` — portfolio-wide graph + structured tables + pattern
  detection. Includes `getMacroContext()` for the Polymarket overlay.
- `useAgentPipeline` — pipeline-step state machine, simulated runner,
  session history, activity feed, cost summary.

### Components

`SidebarNav`, `PortfolioTable`, `SourceFusionBar`, `RiskDistribution`,
`MacroContext`, `EntityScoreStrip`, `LensDetailPanel`, `RiskDriverCards`,
`AssessmentBlock`, `RelationshipGraph`, `PatternCards`, `AgentPipelineViewer`,
`AgentActivityFeed`.

### Known follow-ups

- Expand profile event enrichment so entity timelines include richer live
  Elemental event coverage.
- Continue hardening chat orchestration and analytical narratives via the
  deployed ADK agent.
- Add deeper relationship traversal and broader PID coverage for portfolio-level
  pattern detection.
