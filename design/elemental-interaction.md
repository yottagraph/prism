# Elemental Interaction Model

> How Prism reads the Lovelace Knowledge Graph and turns those reads into
> portfolio scores. Last refreshed against commits `e0363f5` (ContextPackage +
> Galaxy) and `5eecb6d` (centralised logging).
>
> **Companion doc:** [`design/elemental-batch-api-request.md`](./elemental-batch-api-request.md)
> — the _requested_ state, i.e. the custom batch endpoints we want Lovelace to
> expose to replace the call patterns documented here. Read this file first for
> the current architecture; read the request spec to understand where it's
> headed.

## 1. What Prism is trying to do

Prism is a portfolio risk-monitoring app for credit and risk teams. The
user loads a list of 50–500 companies, and within ~two minutes the app
must answer four questions for every name in the portfolio, and defend
each answer with evidence:

1. **Is this company deteriorating?** — a fused risk score (0–100) with
   a confidence level, derived from financial, governance, event,
   news-pressure, and adversarial-capital lenses.
2. **Why?** — the top 3–5 risk drivers per entity, each tagged to a
   source (SEC, NEWS, STOCK, POLY, ACS) and traceable to an underlying
   metric or filing.
3. **What is it connected to?** — the universe of related companies,
   people, financial instruments, and locations connected to each
   portfolio entity (subsidiaries, officers, directors, beneficial
   owners, credit facilities, peer mentions, jurisdictions).
4. **What's changing right now?** — 24-hour news rollup, mention-velocity
   anomalies, fresh 8-K events, recent stake changes, recent officer
   departures, recent prediction-market shifts.

Behind all four questions sits one design principle from the PRD:
**Elemental is the sole data source.** Prism has no local ingestion
pipeline. Every entity fact, relationship, event, news article,
financial instrument, market price, and sentiment value is read from
Elemental at request time (with caching for hot paths). The app stores
only user state — portfolios, scores, scan history, settings — in
Firestore / KV / Neon.

That principle makes the Elemental interaction the entire backend of
the app. The rest of this document is "how that interaction is built."

## 2. What we need Elemental to deliver

For Prism to answer the four questions above, Elemental must deliver
five categories of data, in the shapes described below. The columns
labelled "Where we get it today" are accurate as of commit `e0363f5`.

| Category                              | What we need                                                                                                                                                                                                                                              | Shape we need                                                                                                                      | Where we get it today                                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entity resolution**                 | A free-text company name → one canonical NEID, with a confidence score and a display name                                                                                                                                                                 | `[{neid, name, score}]`                                                                                                            | `POST /entities/search` (REST)                                                                                                                                                                           |
| **Entity profile**                    | For a given NEID: flavor (company / person / instrument / …), display name, summary metadata                                                                                                                                                              | `{neid, name, flavor, num_quads}`                                                                                                  | `GET /galaxy/{neid}/info` (Galaxy) when enabled, else `getEntityName()` + schema lookup                                                                                                                  |
| **Financial facts (time series)**     | For a given NEID: historical XBRL fundamentals (assets, liabilities, equity, revenue, net income, cash, OCF, interest expense, current ratio inputs, debt schedule) — each with a `value` and a `date`                                                    | `Record<propertyName, [{value, date, ref}]>`                                                                                       | Galaxy quads where `dest_type=numerical`, bucketed via `FINANCIAL_PROPERTY_NAMES` whitelist; REST fallback via `POST /elemental/entities/properties`                                                     |
| **Filings & events**                  | For a given NEID: the entity's filing/event stream (form_type, filing_date, event_type, category, description, snippet) — used for distress detection, 13D/13G stake changes, 8-K Item 5.02 c-suite events, late filings, filing-gap, amendment frequency | `[{eventType, date, description, snippet, category, ref}]`                                                                         | Galaxy quads grouped by `event_type` / `event_date` / `description` / `category` / `snippet`; MCP `elemental_get_events` fallback when Galaxy is off                                                     |
| **Relationships (1-hop)**             | For a given NEID, the typed neighbors: officers / directors / board members, beneficial owners, subsidiaries, parent organisations, financial instruments issued, locations, mentioned articles                                                           | `[{neid, name, relationshipType, title, startDate, endDate, ownershipPercentage, jurisdiction, ref}]`                              | Galaxy quads with `dest_type=relational` filtered by property name; MCP `elemental_get_related` fallback                                                                                                 |
| **News & sentiment**                  | For a given NEID: related articles (headline, source, published date, URL), per-article sentiment, aggregate mention velocity, 30-day sentiment trend                                                                                                     | `[{headline, source, publishedDate, sentiment, url, ref}]` plus property quads for `mention_velocity`, `sentiment`, `mentions_30d` | Galaxy `appears_in` / `mentioned_in` relational quads + numerical sentiment quads; MCP `elemental_get_related(article)` fallback                                                                         |
| **Market signals**                    | For a given NEID: 30-day return, 30-day realized volatility, RSI-14, market_anomaly flag — and for the linked financial instrument, daily OHLCV history                                                                                                   | `Record<propertyName, [{value, date}]>` per entity; OHLCV series per instrument NEID                                               | Numerical quads via Galaxy when available; `stocks` MCP `get_daily_stock_prices` (45-day) as a fallback for the score, `getPropertyValues(instrumentNeid, [open/high/low/close/volume])` for chart OHLCV |
| **Cross-entity batch reads**          | For one property and a list of NEIDs, the latest value of that property across every NEID in one round trip                                                                                                                                               | `[{source: neid, property, destination, time}]`                                                                                    | `GET /galaxy/properties/{pid}/quads?neid=A&neid=B&…` (Galaxy only) — used by scan fast-mode                                                                                                              |
| **Citations / evidence**              | A `ref://…` string from any of the above → the underlying article URL, headline, snippet, document section                                                                                                                                                | `{url, title, snippet, source}`                                                                                                    | MCP `elemental_get_citations` (stays on MCP; not a quad)                                                                                                                                                 |
| **Screening lists**                   | A discoverable list of sanctioned / adversarial entities by flavor (`screening_list_*`) — to seed ACS direct screening                                                                                                                                    | `[neid]` per flavor                                                                                                                | Schema discovery via `getSchema()` + `getFlavorEntities(flavor)` (Galaxy) or `findEntities({type: 'is_type', …})` (REST fallback)                                                                        |
| **Adjacent / prediction-market data** | Per-entity prediction-market activity (positive/negative markets, outlook label, market count)                                                                                                                                                            | structured per `polymarket` MCP tool                                                                                               | `polymarket` Elemental MCP server (sibling to `elemental` and `stocks`), consumed through the same `mcpGateway.ts`                                                                                       |

The **shape constraints** are as important as the data itself. Every
field above must arrive **time-stamped at the value level** (so Prism
can apply windows: 24h, 30d, 90d, 180d, 730d) and **ref-stamped**
(so every score driver can cite back to a document). Quads naturally
satisfy both; the REST and MCP fallbacks preserve the same shape so
downstream scoring code is identical on either path.

The **performance constraint**: scanning 50 entities must complete in
under two minutes end-to-end on a warm cache and well under one minute
of pure data-fetch wall time. With the current ContextPackage + Galaxy
architecture this is achievable at roughly 1 Elemental round-trip per
entity (plus a single cross-entity batch read for the placeholder
Monitor rows).

The rest of this document explains exactly how those primitives are
fetched, normalised, cached, and consumed.

## 3. The three Elemental surfaces

The app talks to Elemental over **three distinct surfaces**, all proxied
through the Broadchurch Portal Gateway at
`https://broadchurch-portal-194773164895.us-central1.run.app/api/qs/{org_id}/...`
with an `X-Api-Key` header.

| Surface                         | Path prefix                       | Shape                                                               | When we use it                                                                                                                                                                |
| ------------------------------- | --------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Galaxy** (in-memory KG index) | `/galaxy/...`                     | REST, JSON, single round-trip                                       | Default for every entity-level read once `isGalaxyEnabled()` returns true. 61M entities, 338M quads in process memory on the QS side.                                         |
| **Query Server REST**           | `/elemental/...`, `/entities/...` | REST, JSON (and form-urlencoded for `find` / `entities/properties`) | Entity name search, schema, complex find expressions, fact reads when Galaxy is off, freshness-critical fact reads.                                                           |
| **Elemental MCP**               | `/api/mcp/{org}/elemental/mcp`    | JSON-RPC 2.0 over HTTP                                              | Rich event metadata with category labels, citation resolution, sentiment (`elemental_graph_sentiment`), and anything that returns blobs or computed fields rather than quads. |

There are two sibling MCP servers in the same Elemental MCP family (`stocks`,
`polymarket`) alongside the primary `elemental` server. They share the
gateway, auth, and `mcpGateway.ts` session machinery. They are out of scope
for this doc except where they back a specific signal.

Every call across every surface is intercepted by the centralised logger
(`server/utils/elementalLogger.ts` on the server, `utils/elementalLogger.ts`
in the browser), which prints a single line per call to stdout / the
browser console and persists a row to Neon (or the local-FS NDJSON
fallback). The result is visible in **Settings → Elemental Logs**.

---

## 4. Primitives, in order of preference

The codebase has a strict preference order. Modules pick the cheapest
primitive that can answer their question.

### 4.1 The quad — Galaxy's atomic unit

Galaxy returns **quads**:

```ts
interface GalaxyQuad {
    source: string; // NEID, 20-char zero-padded
    property: string; // human-readable, e.g. "total_assets", "appears_in"
    pid: string; // int64 as string (JS-safe)
    destination: string; // depends on dest_type
    dest_type: 'relational' | 'numerical' | 'categorical';
    time: string; // ISO timestamp — every quad is time-stamped
}
```

A quad is the only primitive that comes pre-joined with time. Numerical
quads carry the value as a stringified float; relational quads carry the
target NEID; categorical quads carry the label or URL. Apple, for example,
returns ~67,000 quads in one call, covering `total_assets` (timestamped
back to the earliest filing), `appears_in` (every article that mentions
it), `works_at`, `invests_in`, `partnered_with`, and so on.

**Endpoints** (all `GET`, all JSON):

| Path                                              | Returns                        | Used by                            |
| ------------------------------------------------- | ------------------------------ | ---------------------------------- |
| `/galaxy/{neid}/quads`                            | every quad for one entity      | `getContextPackage` (default path) |
| `/galaxy/{neid}/info`                             | name, flavor, total quad count | name + flavor lookups              |
| `/galaxy/{neid}/neighbors?size=N`                 | frequency-ranked neighbors     | (not yet wired)                    |
| `/galaxy/{neid}/local-neighborhood?size=N`        | markov neighborhood            | (not yet wired)                    |
| `/galaxy/properties/{pid}/quads?neid=X&neid=Y...` | one property × many entities   | **scan fast-mode**                 |
| `/galaxy/flavors/{flavor}/entities`               | all NEIDs of a flavor          | screening-list discovery           |
| `/galaxy/stats`                                   | index size                     | capability probe                   |

The TypeScript wrapper lives at
[`server/utils/scoring/galaxy.ts`](../server/utils/scoring/galaxy.ts). It
exposes `isGalaxyEnabled()` (cached for 5 min via a `/galaxy/stats` probe),
`getEntityQuads()`, `getEntityInfo()`, `getNeighbors()`,
`getPropertyQuadsForEntities()`, and `getFlavorEntities()`. Every call
goes through `galaxyFetch()`, which uses the same big-int-safe JSON
parser as the rest of the QS code so 64-bit PIDs don't round-trip.

### 4.2 REST property + find — when Galaxy is off or insufficient

When `isGalaxyEnabled()` returns false (Galaxy probe fails, or the QS
instance doesn't have the capability), the same data is reconstructed
from QS REST primitives:

| QS REST endpoint                      | Wrapper                         | Returns                                                                       |
| ------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `GET /elemental/metadata/schema`      | `getSchema()`                   | flavors + properties (5 min process cache)                                    |
| `POST /elemental/find`                | `findEntities()`                | NEIDs matching an expression (`is_type`, `comparison`, `linked`, `and`, `or`) |
| `POST /elemental/entities/properties` | `getPropertyValues(eids, pids)` | property values for a set of (NEID × PID) tuples                              |
| `POST /entities/search`               | `searchEntitiesByName(s)`       | name-to-NEID resolution with scored ranking                                   |
| `GET /entities/{neid}/name`           | `getEntityName()`               | display name                                                                  |

All wrappers are in
[`server/utils/scoring/elemental.ts`](../server/utils/scoring/elemental.ts).
Important gotchas baked into the wrappers:

- `getSchema()` normalises the dual response shape (`res.schema.flavors`
  vs `res.flavors`) and the `fid`/`findex` naming inconsistency.
- `findEntities()` and `getPropertyValues()` use `application/x-www-form-urlencoded`,
  not JSON, because the upstream parser requires it.
- 64-bit PID and FID literals are re-quoted as strings before
  `JSON.parse` so they survive JS number precision.
- Relationship property values are zero-padded to 20-char NEIDs before
  being passed back upstream — `padNeid()` in `utils/elementalHelpers.ts`.

### 4.3 MCP — for things that aren't quads

A handful of reads can't be expressed as a quad lookup. They go through
[`server/utils/scoring/mcpGateway.ts`](../server/utils/scoring/mcpGateway.ts)
which manages the JSON-RPC session lifecycle (`initialize` →
`notifications/initialized` → repeated `tools/call`) and reuses the
session across requests within a process.

| MCP tool                                                           | Used by                                                | Why not Galaxy?                                                                                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `elemental_get_events`                                             | legacy fallback in `contextPackage`, citation backfill | events come pre-shaped with `category`, `description`, `snippet`, and ref — Galaxy can give the same data but as raw quads, requiring N round trips per event |
| `elemental_get_related` (people / articles / instruments / owners) | legacy fallback path                                   | same — pre-shaped relationships with `title`, `start_date`, `end_date`, `ownership_percentage`                                                                |
| `elemental_get_citations`                                          | `citations.ts::resolveRefs`                            | resolves `ref://...` strings to article URLs, headlines, snippets — citation blobs aren't quads                                                               |
| `elemental_get_entity`                                             | (unused on the new code path)                          | replaced by `/galaxy/{neid}/quads` + `/galaxy/{neid}/info`                                                                                                    |

In production-with-Galaxy, **none of the MCP tools above are required for
scoring** — the entire ContextPackage is built from one Galaxy call.
Citations remain MCP because they fetch document text.

---

## 5. ContextPackage — the single fetched-once-per-entity object

Every per-entity scoring pass goes through `getContextPackage(event, neid)`
in
[`server/utils/scoring/contextPackage.ts`](../server/utils/scoring/contextPackage.ts).
The function is memoised per-H3-event (i.e. per HTTP request) via
`event.context.__contextPackages`, so within one scan or one entity-page
load no entity is ever fetched twice.

### Shape

```ts
interface ContextPackage {
    neid: string;
    galaxyEnabled: boolean;
    schema: ElementalSchema;
    pidMap: Record<string, string>; // 'total_assets' → '183', etc.

    // Bucketed, semantic views
    financials: Record<string, ElementalPropertyFact[]>;
    events: ContextEvent[];
    officers: ContextRelationship[];
    directors: ContextRelationship[];
    instruments: ContextRelationship[];
    ownership: ContextRelationship[];
    subsidiaries: ContextRelationship[];
    articles: ContextArticle[];

    // Raw + indexed views (Galaxy path only)
    rawQuads: GalaxyQuad[];
    quadsByProperty: Map<string, GalaxyQuad[]>;

    // Time-series shortcuts for scoring modules
    seriesByPid: Record<string, ElementalPropertyFact[]>;
    latestByPid: Record<string, ElementalPropertyFact | null>;
}
```

### Build paths

#### 5.1 Galaxy path (default)

1. `await getSchema(event)` — 1 call, cached process-wide for 5 min.
2. `await isGalaxyEnabled(event)` — 1 call, cached process-wide for 5 min;
   subsequent entities skip both.
3. `await getEntityQuads(neid)` — **1 call**, returns the entity's whole
   neighborhood as quads.
4. In TS, bucket the quads by property into `quadsByProperty`, project
   the FINANCIAL_PROPERTY_NAMES whitelist into `financials`, build
   `seriesByPid` / `latestByPid` for the numerical reads each scoring
   module needs.

**Total Elemental calls for one entity: 1** (after the schema / probe
warm-up which fires once per process).

#### 5.2 Legacy fallback

Used when `isGalaxyEnabled()` returns false. Issues four MCP / REST
calls in parallel:

```ts
Promise.all([
    getPropertyValues([neid], resolvedFinancialPids, true),    // QS REST
    callMcpTool('elemental', 'elemental_get_related', { …officers/directors… }),
    callMcpTool('elemental', 'elemental_get_events', { limit: 500 }),
    callMcpTool('elemental', 'elemental_get_related', { …articles… }),
])
```

Plus two follow-up MCP calls for ownership/subsidiary and instrument
relationships. Total: **6 calls per entity**. The output is normalised
into the same `ContextPackage` shape so downstream modules don't care
which path produced it.

### How modules read the package

Modules accept an optional `ctx?: ContextPackage`. When present they
take everything from `ctx` and **make zero additional Elemental
calls**. When absent they fall back to their pre-refactor behaviour
(direct `getPropertyValues` / `callMcpTool`).

Example, from `fhs/tier1Financials.ts`:

```ts
const PROP_ALIASES = {
    assets: ['total_assets', 'assets', 'us_gaap:assets'],
    liabilities: ['total_liabilities', 'liabilities', 'us_gaap:liabilities'],
    // …
};

if (ctx) {
    for (const [key, aliases] of Object.entries(PROP_ALIASES)) {
        for (const alias of aliases) {
            const series = ctx.seriesByPid[alias] ?? ctx.financials[alias];
            if (series?.length) {
                out[key] = series;
                break;
            }
        }
    }
}
```

The alias arrays exist because Galaxy property names sometimes vary
(`total_assets` vs `us_gaap:assets`) and the module wants the first one
that has data.

---

## 6. The scoring pipeline — one ContextPackage, nine scorers

`scoreEntity(event, portfolioId, neid)` in
[`server/utils/scoring/scoreEntity.ts`](../server/utils/scoring/scoreEntity.ts):

```
ctx = await getContextPackage(event, neid)
                │
                ▼   (Promise.all, all timeouts wrapped)
  ┌─────────────┼─────────────┬─────────────┬──────────────┐
  ▼             ▼             ▼             ▼              ▼
solvency    executive       news        market           acs
(FHS)       (ERS)         pressure     signal         (graph BFS)
4s          4s              3s           4s              6s
  │             │             │             │              │
  ▼             ▼             ▼             ▼              ▼
eventPressure  cikVelocity  newsSummary24h  polymarket
3s             3s           3s              4s
```

Each scorer reads its slice of `ctx`:

| Scorer                           | Slice of `ctx` it reads                                                                                                              | Calculation                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **FHS Tier 1 (financials)**      | `seriesByPid` / `financials` for assets, liabilities, equity, revenue, net income, current ratio inputs, cash, interest expense, OCF | `leverage = liabilities / assets`, `interestCoverage = operatingIncome / interestExpense`, `currentRatio = currentAssets / currentLiabilities`. Each is bucketed into severity tiers and weighted. |
| **FHS Tier 2 (distress events)** | `events` filtered by event_type                                                                                                      | Recency-weighted count of bankruptcy / restructuring / going-concern events over 730d                                                                                                              |
| **FHS Tier 3 (behavioral)**      | `events` + `officers` + `directors`                                                                                                  | Filing gap from latest `filing_date` quad; officer/director departures with `end_date` in last 90d; late filings (NT 10-K/10-Q); amendment frequency (`/A` suffix in `form_type`)                  |
| **FHS Tier 4 (stake changes)**   | `events` filtered to 13D/13G                                                                                                         | Activist filings, repeated amendments, stake exits                                                                                                                                                 |
| **FHS Tier 5 (instruments)**     | `instruments`                                                                                                                        | Count of distressed instrument relationships                                                                                                                                                       |
| **ERS (governance)**             | `officers` + `directors` + `events` filtered to Item 5.02                                                                            | Recency-weighted departures, cumulative-departure pattern (Signal 6), 8-K Item 5.02 c-suite snippets (Signal 8)                                                                                    |
| **News Pressure**                | `articles` + `seriesByPid` for sentiment/mention PIDs                                                                                | Sentiment trend × mention velocity × adverse-media density                                                                                                                                         |
| **News Summary 24h**             | `articles`                                                                                                                           | 24h headline rollup, mention ratio vs 30d daily avg                                                                                                                                                |
| **Market Signal**                | `seriesByPid` for return_30d, volatility_30d, rsi_14                                                                                 | Bucketed risk score; falls back to `stocks` MCP `get_daily_stock_prices` (45-day window) when properties absent                                                                                    |
| **Event Pressure**               | `events`                                                                                                                             | Severity-weighted event types × 14-day clustering bonus × recency multiplier                                                                                                                       |
| **CIK Velocity**                 | `events` bucketed by quarter                                                                                                         | QoQ mention divergence                                                                                                                                                                             |
| **ACS (adversarial capital)**    | `ownership` + `subsidiaries` + screening list                                                                                        | BFS over ownership edges; matches against `loadScreeningListFromElemental` (discovered from a screening-list flavor via Galaxy / `findEntities`, cached 7d)                                        |
| **Polymarket**                   | (not from ctx)                                                                                                                       | `polymarket` Elemental MCP (sibling server in the same MCP family)                                                                                                                                 |

The fused score is a weighted blend (`solvency × 0.35 + executive × 0.25

- eventPressure × 0.25 + news × 0.15`, optionally + `acs × 0.15` when
  monitor mode is on). Signal-agreement and conflict detection ride on
  top of the per-lens scores.

---

## 7. The scan flow — cross-entity batch + per-entity full scoring

`POST /api/agents/scan` (SSE stream) at
[`server/api/agents/scan.post.ts`](../server/api/agents/scan.post.ts).

```
1. Resolve names → NEIDs               POST /entities/search (one batch)
2. Probe Galaxy capability             GET  /galaxy/stats (cached)
3. Fast-mode prefetch (if Galaxy)      GET  /galaxy/properties/{pid}/quads
                                            ?neid=…&neid=…  (× 3 PIDs in parallel)
4. Fan out scoring across 8 workers    each worker: scoreEntity(neid)
                                            → ctx = getContextPackage(neid)
                                            → 1 Galaxy call per entity
                                            → 9 in-memory scorers
5. Stream `fast-row`, `entity`, `progress`, `done` SSE events
```

Step 3 is the cross-entity batch primitive: a single
`/galaxy/properties/{pid}/quads?neid=A&neid=B&neid=C` call returns the
latest values of one property (e.g. `total_liabilities`) across **every
portfolio entity at once**, used to paint placeholder rows in the
Monitor table within ~1 second of scan start. Three PIDs are pre-fetched
in parallel: liabilities, equity, filing_date.

Step 4 is the heavy work. With Galaxy on, each `scoreEntity` makes
**one** Galaxy quads call (plus citations as needed). With 50 entities
and 8 workers, the total Elemental traffic is roughly:

```
3 cross-entity property calls    (fast-mode, before scoring starts)
+ 50 × 1 entity-quads calls      (one per portfolio entity)
+ ~50 × 1 citation MCP calls     (evidence resolution, often skipped)
= ~103 Elemental calls for the whole portfolio
```

Compare that to the pre-refactor traffic: roughly **30–50 calls per
entity** with 5–7 duplicate `elemental_get_events` fetches, plus
N+1 name lookups and N×5 `elemental/find` queries inside
`buildRelationshipUniverse`. The new architecture is ~10× fewer calls
in the typical case.

---

## 8. Time constraints

How time is used at each layer, top to bottom:

### Quad layer (the source of truth)

Every Galaxy quad has a `time` field. There is **no API-level date
filter** on `/galaxy/{neid}/quads` — you always get the entity's full
history. That's fine because:

- Galaxy is in-memory, so reading the full history is cheap.
- Time-filtering in TS is trivial once the quads are local.
- Bandwidth is the only real cost; for the entities we read it tops
  out around 1–3 MB per call (Apple at 67k quads is the worst case).

The numeric and time fields are normalised into
`ElementalPropertyFact { value, date, ref }` and stuffed into
`seriesByPid` / `latestByPid` so downstream modules don't have to
re-parse timestamps.

### Module layer (where time windows are applied)

| Module                                   | Window                                   | Implementation                                                |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| **FHS Tier 1 financials**                | latest only                              | `latestFact()` sorts by `date` desc, takes head               |
| **FHS Tier 2 distress events**           | 730d (2 years)                           | `recencyMultiplier(eventDate, 730)` decays linearly           |
| **FHS Tier 3 officer departures**        | 90d                                      | filter `recencyDays(endDate) <= 90`                           |
| **FHS Tier 3 filing gap**                | 180d                                     | `daysSince(latestFilingDate) > 180` ⇒ stress                  |
| **FHS Tier 3 amendment frequency**       | trailing 12 mo                           | count `/A` filings in last 365d                               |
| **FHS Tier 4 stake changes**             | 365d                                     | count 13D/13G amendments in last year                         |
| **ERS Signal 6 (cumulative departures)** | 180d                                     | sliding window over officer/director departures               |
| **ERS Signal 8 (8-K 5.02)**              | 90d, recency-weighted                    | snippet match + `recencyMultiplier(eventDate, 90)`            |
| **News Pressure**                        | 30d                                      | sentiment avg over last 30d articles                          |
| **News Summary 24h**                     | 24h, with 30d baseline                   | mention count today / mention daily avg over 30d              |
| **CIK Velocity**                         | trailing 8 quarters                      | bucket `events` by `YYYY-Q[1-4]`, compute QoQ deltas          |
| **Event Pressure**                       | 14d clustering bonus, 730d decay         | events within 14d of each other multiply each other's weight  |
| **Market Signal (properties)**           | as published (typically 30d/14d windows) | reads `return_30d`, `volatility_30d`, `rsi_14` quads directly |
| **Market Signal (MCP fallback)**         | 45d                                      | `get_daily_stock_prices` with `lookback_days: 45`             |
| **Stock Profile OHLCV**                  | as published; UI slices last 500 bars    | full history fetched, no API window                           |

### Cache layer (TTL by data type)

`server/utils/scoring/cache.ts` writes scoring outputs to Firestore (or
local FS in dev) with TTLs:

| Data type        | TTL    | Used by                        |
| ---------------- | ------ | ------------------------------ |
| market           | 15 min | marketSignal                   |
| news / news24h   | 30 min | newsPressure, newsSummary24h   |
| event-pressure   | 1 hr   | eventPressure                  |
| cik-velocity     | 1 hr   | cikVelocity                    |
| solvency         | 4 hr   | fhs/\*                         |
| executive        | 4 hr   | ers/\*                         |
| acs              | 4 hr   | acs/\*                         |
| polymarket       | 4 hr   | polymarketOutlook              |
| profile          | 4 hr   | profile                        |
| stock-profile-v4 | 7 d    | stockProfile                   |
| screening-list   | 7 d    | acs screening source discovery |

Cache reads happen inside each module before consulting `ctx`, so a warm
cache makes the ContextPackage's quad reads moot for that signal.

---

## 9. What's currently **not** going through ContextPackage

These call paths still hit Elemental directly. None are in the scoring
hot path; most are page-render reads or supporting infrastructure.

### Stock profile (`server/utils/scoring/stockProfile.ts`)

The entity-page stock tab still uses its own pipeline:

1. `elemental_get_related` for `financial_instrument` candidates
2. Batched `getPropertyValues(probeNeids, [close_price])` to pick the
   instrument with actual price history
3. `getPropertyValues([selectedInstrument], [close, open, high, low, volume])`
   for the OHLCV time series
4. `getPropertyValues([orgNeid], orgPids)` for org fundamentals

This is the biggest remaining batching opportunity — all four of those
reads could become `/galaxy/properties/{close_price_pid}/quads?neid=…`
calls. Not yet refactored.

### Portfolio Relationship Explorer

`server/utils/scoring/relationships.ts::buildRelationshipUniverse`
still issues 5 parallel `findEntities({ type: 'linked', … })` queries
per portfolio entity, plus ≤80 `getEntityName()` calls. With Galaxy
this could become one `/galaxy/{neid}/neighbors?size=50` per entity
plus zero name lookups (names come back from `/galaxy/{neid}/info`).
Not yet refactored.

### Citations (`server/utils/scoring/citations.ts`)

`elemental_get_citations` is the right tool — citations resolve to
article URLs, snippets, and document text, none of which are quads.
This will stay on MCP.

### Entity name resolution

`POST /entities/search` is the right tool. Galaxy is NEID-keyed; there
is no fuzzy text search in the index.

### Schema discovery

`/elemental/metadata/schema` is still the only source of flavor /
property metadata. Cached process-wide for 5 minutes inside
`getSchema()`.

---

## 10. Observability

Two surfaces, both rolled out in commit `5eecb6d`:

1. **Settings → Elemental Logs tab** — every call (REST + MCP, server +
   client) is persisted to Neon (`elemental_call_logs` table) or the
   local-FS NDJSON fallback. The tab shows totals, error rate, avg/p95
   duration, top endpoints, top MCP tools, and an expandable per-row
   detail view.

2. **`GET /api/_debug/scan-timing?neid={neid}`** — runs a one-entity
   scoring pass and returns:
    ```json
    {
        "galaxyEnabled": true,
        "totalMs": 1827,
        "probeMs": 12,
        "fetchMs": 421,
        "modulesMs": 1394,
        "quadCount": 4827,
        "eventCount": 142,
        …
    }
    ```
    Use it to verify that the Galaxy path is active, that the quad fetch
    is dominating fetch time (it should — there's only one), and that
    module compute is the next layer.

Console-level logging is gated by:

- `NUXT_ELEMENTAL_LOG=off|summary|verbose` on the server
- `localStorage.elementalLog=off|summary|verbose` in the browser
  (live-toggleable via `window.__elementalLog.set('verbose')`)

Persistence is independent of console level: you can silence the dev
terminal and still capture every call in the Logs tab.

---

## 11. Quick reference — where to look in code

| Question                                               | File                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| "How do we build the per-entity context?"              | `server/utils/scoring/contextPackage.ts`                               |
| "How does the Galaxy client work?"                     | `server/utils/scoring/galaxy.ts`                                       |
| "How does QS REST work (with PID precision handling)?" | `server/utils/scoring/elemental.ts`                                    |
| "How does MCP work (with session reuse)?"              | `server/utils/scoring/mcpGateway.ts`                                   |
| "How is one entity scored end to end?"                 | `server/utils/scoring/scoreEntity.ts`                                  |
| "How does a scoring module consume `ctx`?"             | `server/utils/scoring/fhs/tier1Financials.ts`                          |
| "How does the scan stream work?"                       | `server/api/agents/scan.post.ts`                                       |
| "How are calls logged and persisted?"                  | `server/utils/elementalLogger.ts`, `server/utils/elementalLogStore.ts` |
| "How is timing measured?"                              | `server/api/_debug/scan-timing.get.ts`                                 |
| "What's the public design summary?"                    | `DESIGN.md` §7.3                                                       |
