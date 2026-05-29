# Monitor Module: Entity Risk Assessment Table — Product Requirements Document

**Created:** 2026-05-27  
**Author:** Cursor + Product Team  
**Status:** Draft  
**Module ID:** monitor-entity-risk  
**Context:** Prism Portfolio Risk Prototype + Agent Demonstration Environments

---

## 1. Purpose

Define the Entity Risk Assessment Table — the primary monitoring surface where analysts see their portfolio ranked by fused risk, with per-source signal columns organized by data domain. This is the table visible on the Monitor page: the single view that answers **"Which companies should I worry about, and why, right now?"**

This PRD focuses specifically on the table component — its columns, data sources, scoring integration, filtering, analyst interaction, and the data flow that populates it. It does not cover the broader Monitor page (alerts, events, patterns tabs) except where they feed into the table.

---

## 2. Design Reference

The current Entity Risk Assessment Table is implemented in `features/lovelace-monitor/components/EntityAssessmentTab.vue` and renders as follows:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  Entity Risk Assessment  [270 entities]                        [Assess Risk]    │
├──────────────────────────────────────────────────────────────────────────────────┤
│  [Build: 2026-03-09.4]  🔍 Search...  │ ALL 279│HIGH 4│MED 2│LOW 268│IGN 3│    │
│                                        │ Rows: 25 | 50 | 100 | All    │         │
├─────────┬──────────────────────────────┬────────────────┬───────────────────────┤
│         │     SEC EDGAR                │     News       │     Stock        │PM  │
├────┬────┼─────────┬────────┬───────────┼───────┬────────┼─────┬────┬──────┼────┤
│Rank│Name│Solvency │Exec    │CIK Vel    │Summary│Activity│ $   │30d │Trend │Outl│
│    │    │(FHS)    │Risk    │           │(24h)  │        │     │    │      │    │
│    │    │         │(ERS)   │           │       │        │     │    │      │    │
├────┼────┼─────────┼────────┼───────────┼───────┼────────┼─────┼────┼──────┼────┤
│ #1 │... │Critical │High    │ -56.4%    │ ...   │Low Data│+0.8%│+7.2│  —   │ —  │
│ #2 │... │Critical │Medium  │ -60.5%    │ ...   │Low Data│+0.8%│-2.6│  —   │ —  │
└────┴────┴─────────┴────────┴───────────┴───────┴────────┴─────┴────┴──────┴────┘
```

**Column groups** are visually separated by colored header bands and border dividers:

| Group                  | Columns                                | Header Color |
| ---------------------- | -------------------------------------- | ------------ |
| (ungrouped)            | Rank, Entity, Signals                  | —            |
| **SEC EDGAR**          | Solvency, Executive Risk, CIK Velocity | Blue-grey    |
| **News**               | Summary (24h), Activity                | Teal         |
| **Stock**              | Price Change, 30d Change, Trend Signal | Blue         |
| **Prediction Markets** | Outlook, # Markets                     | Deep purple  |
| (ungrouped)            | Analyst Assessment, Actions            | —            |

---

## 3. Data Flow

### 3.1 Current Architecture (Local DB)

```
Project Selection
    → Load project entity CIKs
    → POST /api/lovelace/studio/calculate (fast_mode: true)
        → Server queries risk_scores, velocity_cache, stock data from local DBs
        → Returns scored entities
    → Render initial table
    → Background: POST /api/lovelace/studio/calculate (fast_mode: false)
        → Full enrichment with news, stock, polymarket signals
        → Merge enriched data into existing rows
    → Merge project entity enrichment (news summaries, polymarket, stock from project_entities)
```

### 3.2 Target Architecture (Elemental-Sourced)

```
Project Selection
    → Load project entity list (NEIDs)
    → Agent Pipeline: History Agent fans out across all entities
        → Retrieves from Elemental:
            - Entity facts + identifiers
            - Financial properties (XBRL facts)
            - Relationships (officers, directors)
            - Events (8-K, departures)
            - News signals (sentiment, velocity, summaries)
            - Stock signals (price, technical indicators)
            - Prediction market data
    → Query Agent: Runs FHS + ERS + ACS modules per entity
        → Produces per-entity scores with evidence
    → Composition Agent: Formats for table rows
        → Pushes rows via SSE as each entity completes
    → Table populates progressively
    → Results cached in local project DB with TTL
```

The key shift: instead of querying local databases directly, the table is populated by agent pipeline output. The agents gather data from Elemental, run analytical modules, and push results to the table.

### 3.3 Two-Phase Loading

The table uses a two-phase loading strategy for responsiveness:

| Phase               | Trigger                         | Data                                                           | Speed                                      |
| ------------------- | ------------------------------- | -------------------------------------------------------------- | ------------------------------------------ |
| **Fast Mode**       | Immediate on project load       | Cached scores + basic entity metadata                          | < 3 seconds                                |
| **Full Enrichment** | Background after initial render | Live agent pipeline: news, stock, polymarket, velocity signals | 30-120 seconds depending on portfolio size |

For portfolios > 200 entities, full enrichment is deferred to on-demand ("Assess Risk" button) to avoid timeouts.

---

## 4. Column Specification

### 4.1 Core Columns (Ungrouped)

#### Rank

| Property     | Value                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------- |
| **Key**      | `rank_position`                                                                                     |
| **Source**   | Computed client-side from `computed_score` sort order                                               |
| **Display**  | `#1`, `#2`, ... with color coding by percentile (top 25% = red, 25-50% = amber, bottom 50% = green) |
| **Sortable** | Yes                                                                                                 |
| **Width**    | 3%                                                                                                  |

#### Entity

| Property        | Value                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| **Key**         | `name`                                                                                                   |
| **Source**      | Elemental entity facts (resolved by History Agent)                                                       |
| **Display**     | Entity name (bold) + ticker or CIK (caption below). Analyst assessment shield icon if assessment exists. |
| **Sortable**    | Yes                                                                                                      |
| **Width**       | 10%                                                                                                      |
| **Interaction** | Click row → opens Entity Detail dialog                                                                   |

#### Signals

| Property     | Value                                                                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Key**      | `signal_agreement`                                                                                                                                                                                                                                       |
| **Source**   | Computed by Query Agent after all modules run                                                                                                                                                                                                            |
| **Display**  | Summary label ("Limited", "Agreement", "Conflict", "Partial") + per-source chips (SEC, News, Stock, Risk) colored green (available + not risky), red (available + risky), or grey (not available). Each chip has a tooltip explaining the signal status. |
| **Sortable** | Yes                                                                                                                                                                                                                                                      |
| **Width**    | 11%                                                                                                                                                                                                                                                      |

**Signal Detail Computation:**

For each data source, the Query Agent evaluates:

| Source | Available Condition          | Risky Condition                                   |
| ------ | ---------------------------- | ------------------------------------------------- |
| SEC    | Has financial data or events | FHS ≥ 50 or ERS ≥ 50                              |
| News   | Has news mentions in 30d     | Sentiment avg < -0.2 or mention_ratio > 3x normal |
| Stock  | Has stock price data         | 30d change < -10% or RSI > 70 or < 30             |
| Risk   | Has computed risk score      | Fused score ≥ 50                                  |

**Signal Agreement Classification:**

| Condition                                     | Label     |
| --------------------------------------------- | --------- |
| All available sources agree on risk direction | Agreement |
| Some sources risky, some not                  | Conflict  |
| Only some sources available                   | Partial   |
| Only SEC data available                       | SEC Only  |
| Limited data across all sources               | Limited   |

### 4.2 SEC EDGAR Group

#### Solvency (FHS)

| Property     | Value                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------- |
| **Key**      | `solvency_score`                                                                            |
| **Source**   | FHS module output (see FHS_MODULE.md)                                                       |
| **Display**  | Risk level chip: Critical (red), High (red), Medium (amber), Low (green), or "—" if no data |
| **Sortable** | Yes                                                                                         |
| **Width**    | 5%                                                                                          |
| **Tooltip**  | Score value, top risk driver, confidence level                                              |

#### Executive Risk (ERS)

| Property     | Value                                                                        |
| ------------ | ---------------------------------------------------------------------------- |
| **Key**      | `executive_score`                                                            |
| **Source**   | ERS module output (see ERS_MODULE.md)                                        |
| **Display**  | Same chip pattern as Solvency                                                |
| **Sortable** | Yes                                                                          |
| **Width**    | 8%                                                                           |
| **Tooltip**  | Score value, governance summary (officer count, departures), top risk driver |

#### CIK Velocity

| Property     | Value                                                                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Key**      | `edgar_trend`                                                                                                                                         |
| **Source**   | CIK Mention Frequency aggregation (Elemental primitive) + QoQ computation (agent)                                                                     |
| **Display**  | Trend icon (trending-up/down/minus) + QoQ percentage change. Additional icons for: above-average activity, divergence (cross-entity vs. own filings). |
| **Sortable** | Yes                                                                                                                                                   |
| **Width**    | 6%                                                                                                                                                    |

**Tooltip detail:**

- Trend label (Rising, Falling, Stable, New, Inactive)
- QoQ change percentage
- Current quarter vs. prior quarter mention counts
- Historical average mentions/quarter
- vs. Average percentage
- Divergence score and label (Gaining Attention / Fading / In-Sync)
- Cross-entity QoQ vs. own filings QoQ

**Velocity Computation:**

| Metric           | Formula                                                        | Source            |
| ---------------- | -------------------------------------------------------------- | ----------------- |
| QoQ change       | `(latest_quarter - prev_quarter) / prev_quarter × 100`         | Mention frequency |
| Trend            | accelerating (>+15%), declining (<-15%), stable, new, inactive | QoQ ratio         |
| Divergence       | `cross_entity_qoq - direct_filings_qoq`                        | Mention frequency |
| Divergence label | gaining-attention (>+25pp), fading (<-25pp), in-sync           | Divergence score  |

### 4.3 News Group

#### News Summary (24h)

| Property       | Value                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Key**        | `headline_summary`                                                                                                                   |
| **Source**     | LLM-generated summary of last 24 hours of news mentions (composition agent)                                                          |
| **Display**    | Truncated text (3-line clamp) with tooltip showing full summary                                                                      |
| **Sortable**   | No                                                                                                                                   |
| **Width**      | 16%                                                                                                                                  |
| **Generation** | Triggered per-entity by composition agent during enrichment phase. If no recent coverage: "No recent news coverage" or "No summary". |

#### News Activity

| Property     | Value                                            |
| ------------ | ------------------------------------------------ |
| **Key**      | `mention_ratio_label`                            |
| **Source**   | News sentiment + velocity signals from Elemental |
| **Display**  | Activity chip with icon and label                |
| **Sortable** | Yes                                              |
| **Width**    | 7%                                               |

**Activity Classifications:**

| Label               | Display   | Color       | Condition                            |
| ------------------- | --------- | ----------- | ------------------------------------ |
| `high_positive`     | Trending+ | Green       | Volume > 3x avg + positive sentiment |
| `high_negative`     | Crisis    | Red         | Volume > 3x avg + negative sentiment |
| `high_neutral`      | Active    | Grey        | Volume > 3x avg + neutral sentiment  |
| `low_positive`      | Quiet+    | Light green | Volume < 1x avg + positive sentiment |
| `low_negative`      | Concern   | Orange      | Volume < 1x avg + negative sentiment |
| `low_neutral`       | Quiet     | Grey        | Volume < 1x avg + neutral sentiment  |
| `normal`            | Normal    | Grey        | Volume within ±1x avg                |
| `insufficient_data` | Low Data  | Grey        | < 1 mention/day avg in 30d window    |

**Tooltip:** Activity explanation, today's volume ratio, 30-day daily average.

### 4.4 Stock Group

#### Stock Price Change (Today)

| Property     | Value                                                                                  |
| ------------ | -------------------------------------------------------------------------------------- |
| **Key**      | `stock_change_percent`                                                                 |
| **Source**   | Stock data from Elemental                                                              |
| **Display**  | Percentage with directional icon. Color: red (< -5%), amber (-5% to 0%), green (> 0%). |
| **Sortable** | Yes                                                                                    |
| **Width**    | 5%                                                                                     |
| **Tooltip**  | Today's change, 30-day change, 30-day volatility                                       |

#### 30-Day Change

| Property     | Value                                                              |
| ------------ | ------------------------------------------------------------------ |
| **Key**      | `stock_change_30d_percent`                                         |
| **Source**   | Stock data from Elemental                                          |
| **Display**  | Percentage. Color: red (< -10%), amber (-10% to 0%), green (> 0%). |
| **Sortable** | Yes                                                                |
| **Width**    | 4%                                                                 |

#### Trend Signal

| Property     | Value                                                                           |
| ------------ | ------------------------------------------------------------------------------- |
| **Key**      | `stock_trend_signal`                                                            |
| **Source**   | Technical indicators from Elemental (RSI, MACD)                                 |
| **Display**  | Chip: Bull (green), Bear (red), Neutral (grey)                                  |
| **Sortable** | Yes                                                                             |
| **Width**    | 5%                                                                              |
| **Tooltip**  | RSI signal (overbought/oversold/neutral), MACD signal (bullish/bearish/neutral) |

### 4.5 Prediction Markets Group

#### Markets Outlook

| Property     | Value                                                                    |
| ------------ | ------------------------------------------------------------------------ |
| **Key**      | `polymarket_outlook`                                                     |
| **Source**   | Polymarket data from Elemental (entity-linked prediction markets)        |
| **Display**  | Chip: Bullish (green), Bearish (red), Neutral (grey)                     |
| **Sortable** | Yes                                                                      |
| **Width**    | 7%                                                                       |
| **Tooltip**  | Outlook score, active market count, bullish vs. bearish market breakdown |

#### Market Count

| Property     | Value                                                       |
| ------------ | ----------------------------------------------------------- |
| **Key**      | `polymarket_count`                                          |
| **Source**   | Polymarket data from Elemental                              |
| **Display**  | Count chip. Purple if ≥ 3 markets, grey otherwise.          |
| **Sortable** | Yes                                                         |
| **Width**    | 4%                                                          |
| **Tooltip**  | List of up to 10 market questions with active/closed status |

### 4.6 Analyst Group

#### Analyst Assessment

| Property        | Value                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Key**         | `analyst_assessment`                                                                                                             |
| **Source**      | Local project DB (user-generated)                                                                                                |
| **Display**     | Dropdown select: HIGH (red), MEDIUM (amber), LOW (green), IGNORE (grey), — (no assessment)                                       |
| **Sortable**    | Yes                                                                                                                              |
| **Width**       | 7%                                                                                                                               |
| **Interaction** | Change triggers PUT to `/api/lovelace/entities/:cik/assessment` with project_id, severity, justification. Persisted immediately. |
| **Persistence** | `project_entities.severity` in local project DB                                                                                  |

---

## 5. Fused Risk Score (Ranking)

The table is ranked by `computed_score`, a fused risk score that blends all available module outputs.

### 5.1 Default Lens Configuration

| Lens            | Enabled | Weight |
| --------------- | ------- | ------ |
| Solvency (FHS)  | Yes     | 35     |
| Executive (ERS) | Yes     | 25     |
| Event Pressure  | Yes     | 25     |
| News Pressure   | Yes     | 15     |

When ACS is available:

| Lens             | Enabled | Weight |
| ---------------- | ------- | ------ |
| Solvency (FHS)   | Yes     | 30     |
| Executive (ERS)  | Yes     | 20     |
| Event Pressure   | Yes     | 20     |
| News Pressure    | Yes     | 15     |
| Compliance (ACS) | Yes     | 15     |

### 5.2 Risk Category Thresholds

| Score Range        | Category | Filter Label |
| ------------------ | -------- | ------------ |
| ≥ 70               | HIGH     | Red          |
| 40–69              | MEDIUM   | Amber        |
| < 40               | LOW      | Green        |
| (analyst override) | IGNORE   | Blue-grey    |

### 5.3 Fallback Scoring

When the full pipeline hasn't run, the table falls back to a simple average:

```
fused = (solvency_score + executive_score + event_pressure) / 3
```

This ensures the table always renders with some ranking, even if enrichment is incomplete.

---

## 6. Filtering and Search

### 6.1 Risk Category Filter

A toggle bar with counts per category:

```
ALL [279] | HIGH [4] | MEDIUM [2] | LOW [268] | IGNORE [3]
```

Selecting a category filters the table. Counts update dynamically as data loads.

### 6.2 Text Search

Free-text search across entity name, ticker, and CIK. Uses Vuetify data table search.

### 6.3 Pagination

Toggle: 25 | 50 | 100 | All rows per page.

Default: All (for demo contexts where seeing the full ranked list matters).

---

## 7. Progressive Loading UX

### 7.1 Loading States

| State                   | Banner                                                             | Table Content                                               |
| ----------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Initial load**        | "Loading entity data..." with spinner                              | Empty                                                       |
| **Fast mode complete**  | (none)                                                             | Table populated with cached scores, enrichment fields blank |
| **Enrichment running**  | "Loading velocity, news, stock & market data..." with progress bar | Table populated, enrichment columns filling progressively   |
| **Full recalc running** | "Reassessing risk..." with progress bar                            | Previous data visible, updating in place                    |
| **Error (has data)**    | Warning alert with message                                         | Previous data visible                                       |
| **Error (no data)**     | Error state with retry button                                      | Empty                                                       |

### 7.2 SSE Integration (Target Architecture)

In the Elemental-sourced architecture, table rows arrive via Server-Sent Events as the agent pipeline completes each entity:

```
SSE Event: { type: "entity_score", neid: "...", data: ScoredEntity }
```

The table inserts/updates the row in place and re-sorts. This creates a progressive "filling in" effect during portfolio load — the demo-friendly moment where the audience sees the system working.

---

## 8. Entity Detail Interaction

Clicking any row opens the Entity Detail dialog (separate component, not part of this PRD) with the entity's CIK/NEID. The table emits:

```
emit('select-entity', entity.cik)
```

The parent Monitor page handles routing to the appropriate detail view.

---

## 9. Assess Risk Action

The "Assess Risk" button triggers a full recalculation:

```
POST /api/lovelace/studio/calculate
{
  project_id: string,
  entity_ciks: string[],
  lens_config: LensConfig,
  ignore_ciks: string[],
  fast_mode: false
}
```

In the Elemental-sourced architecture, this triggers the full agent pipeline for all project entities, bypassing cache.

**Blocked condition:** For portfolios > 200 entities, full recalc is disabled with a message explaining the threshold. This prevents gateway timeouts.

---

## 10. Data Types

The `ScoredEntity` interface defines all fields available to the table:

### 10.1 Core Fields

| Field            | Type                                    | Source                         |
| ---------------- | --------------------------------------- | ------------------------------ |
| `cik`            | string                                  | Entity identifier              |
| `name`           | string                                  | Entity name                    |
| `ticker`         | string?                                 | Stock ticker                   |
| `neid`           | string?                                 | Elemental NEID                 |
| `entity_type`    | string?                                 | Organization, Person, etc.     |
| `computed_score` | number                                  | Fused risk score (0-100)       |
| `rank_position`  | number?                                 | Computed client-side           |
| `risk_category`  | "HIGH" \| "MEDIUM" \| "LOW" \| "IGNORE" | From computed_score thresholds |

### 10.2 FHS Fields

| Field                 | Type    | Source     |
| --------------------- | ------- | ---------- |
| `solvency_score`      | number? | FHS module |
| `solvency_risk_level` | string? | FHS module |

### 10.3 ERS Fields

| Field                  | Type    | Source     |
| ---------------------- | ------- | ---------- |
| `executive_score`      | number? | ERS module |
| `executive_risk_level` | string? | ERS module |

### 10.4 Event Pressure Fields

| Field                       | Type    | Source                 |
| --------------------------- | ------- | ---------------------- |
| `event_pressure`            | number? | Event pressure scoring |
| `event_pressure_risk_level` | string? | Event pressure scoring |

### 10.5 Velocity Fields

| Field                    | Type                                                                     | Source                                  |
| ------------------------ | ------------------------------------------------------------------------ | --------------------------------------- |
| `edgar_trend`            | "accelerating" \| "declining" \| "stable" \| "new" \| "inactive" \| null | CIK velocity computation                |
| `edgar_qoq_pct`          | number?                                                                  | Quarter-over-quarter change             |
| `edgar_latest_mentions`  | number?                                                                  | Current quarter mention count           |
| `edgar_prev_mentions`    | number?                                                                  | Prior quarter mention count             |
| `edgar_latest_quarter`   | string?                                                                  | e.g. "2026-Q1"                          |
| `edgar_prev_quarter`     | string?                                                                  | e.g. "2025-Q4"                          |
| `edgar_avg_mentions`     | number?                                                                  | Historical average mentions/quarter     |
| `edgar_avg_diff_pct`     | number?                                                                  | Current vs. historical average %        |
| `edgar_divergence_score` | number?                                                                  | Cross-entity vs. own filings divergence |
| `edgar_divergence_label` | "gaining-attention" \| "fading" \| "in-sync" \| null                     | Divergence classification               |

### 10.6 News Fields

| Field                   | Type    | Source                           |
| ----------------------- | ------- | -------------------------------- |
| `headline_summary`      | string? | LLM-generated 24h news summary   |
| `mention_ratio_label`   | string? | Activity classification          |
| `mention_ratio_today`   | number? | Today's volume ratio vs. average |
| `mention_daily_avg_30d` | number? | 30-day daily mention average     |
| `sentiment_avg_30d`     | number? | 30-day sentiment average         |
| `sentiment_trend`       | string? | Improving, stable, declining     |
| `mention_velocity`      | number? | Rate of change in mentions       |

### 10.7 Stock Fields

| Field                      | Type                                         | Source                        |
| -------------------------- | -------------------------------------------- | ----------------------------- |
| `stock_price`              | number?                                      | Current price                 |
| `stock_change_percent`     | number?                                      | Today's % change              |
| `stock_change_30d_percent` | number?                                      | 30-day % change               |
| `stock_trend_30d`          | "positive" \| "negative" \| "stable" \| null | 30-day trend direction        |
| `stock_trend_signal`       | "bullish" \| "bearish" \| "neutral" \| null  | Technical indicator consensus |
| `stock_rsi_signal`         | string?                                      | RSI classification            |
| `stock_macd_signal`        | string?                                      | MACD classification           |
| `stock_volatility_30d`     | number?                                      | 30-day volatility             |

### 10.8 Prediction Market Fields

| Field                         | Type                                          | Source                                      |
| ----------------------------- | --------------------------------------------- | ------------------------------------------- |
| `polymarket_outlook`          | "positive" \| "neutral" \| "negative" \| null | Overall outlook from linked markets         |
| `polymarket_outlook_score`    | number?                                       | Numerical outlook score                     |
| `polymarket_count`            | number?                                       | Number of linked markets                    |
| `polymarket_positive_markets` | number?                                       | Count of bullish markets                    |
| `polymarket_negative_markets` | number?                                       | Count of bearish markets                    |
| `polymarket_markets`          | Array?                                        | Market details (question, active, category) |

### 10.9 Signal Agreement Fields

| Field               | Type                                                   | Source                         |
| ------------------- | ------------------------------------------------------ | ------------------------------ |
| `signal_agreement`  | "agreement" \| "conflict" \| "partial" \| "edgar_only" | Cross-source agreement         |
| `sources_available` | number?                                                | Count of sources with data     |
| `sources_risky`     | number?                                                | Count of sources flagging risk |
| `signal_summary`    | string?                                                | Human-readable summary         |
| `signal_details`    | Array?                                                 | Per-source detail objects      |

### 10.10 Analyst Fields

| Field                   | Type                                            | Source                  |
| ----------------------- | ----------------------------------------------- | ----------------------- |
| `analyst_assessment`    | "HIGH" \| "MEDIUM" \| "LOW" \| "IGNORE" \| null | User-set severity       |
| `analyst_justification` | string?                                         | Free-text justification |

---

## 11. Performance Targets

| Metric                          | Target        | Current  |
| ------------------------------- | ------------- | -------- |
| Fast mode load (< 300 entities) | < 3 seconds   | ~2-3s    |
| Full enrichment (50 entities)   | < 60 seconds  | ~30-45s  |
| Full enrichment (200 entities)  | < 120 seconds | ~90-120s |
| Sort/filter interaction         | < 100ms       | < 100ms  |
| Row click to detail dialog      | < 200ms       | ~150ms   |
| Assessment save                 | < 1 second    | ~500ms   |

---

## 12. Future Columns (Planned)

| Column           | Group       | Source                   | Description                                   |
| ---------------- | ----------- | ------------------------ | --------------------------------------------- |
| **ACS Score**    | Compliance  | ACS module               | Adversarial Capital Screening risk level chip |
| **Blast Radius** | Network     | Blast radius computation | Network contagion risk score                  |
| **Score Trend**  | (ungrouped) | Score history            | Sparkline of fused score over last 90 days    |
| **Last Event**   | SEC EDGAR   | Event store              | Most recent material event date and type      |
| **FOCI Flag**    | Compliance  | ACS module               | Foreign ownership/control indicator           |

---

## 13. Integration with Monitor Page

The Entity Risk Assessment Table lives within the Monitor page as the default tab under the ENTITIES top-level tab. The Monitor page also contains:

| Tab                           | Purpose                                          | Relationship to Table                                   |
| ----------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| **Entities** (contains table) | Primary risk ranking view                        | This PRD                                                |
| **Alerts**                    | Agent-generated threshold crossing notifications | Alerts reference entities in the table                  |
| **Entity Updates**            | Feed of score changes and new data arrivals      | Updates correspond to table row changes                 |
| **Events**                    | Material events across the portfolio             | Events feed into event pressure scores in the table     |
| **Patterns**                  | Cross-entity patterns (contagion, clusters)      | Patterns highlight relationships between table entities |

Sub-tabs under Entities provide alternative views of the same data:

| Sub-Tab                   | View                                              |
| ------------------------- | ------------------------------------------------- |
| **Project**               | The Entity Risk Assessment Table (this PRD)       |
| **Companies**             | Company-only filtered view                        |
| **Financial Instruments** | Instruments associated with portfolio entities    |
| **People**                | Officers and directors across portfolio entities  |
| **Locations**             | Geographic presence of portfolio entities         |
| **Portfolio Summary**     | LLM-generated narrative summary of portfolio risk |
| **Network**               | Relationship graph visualization                  |

---

## 14. What Belongs in Elemental vs. What the Table Computes

| Elemental Provides                        | Table/Agent Computes                     |
| ----------------------------------------- | ---------------------------------------- |
| Entity identity (NEID, CIK, name, ticker) | Fused risk score from module outputs     |
| Raw financial facts (XBRL)                | FHS score (via Query Agent)              |
| Relationships with dates and titles       | ERS score (via Query Agent)              |
| 8-K events with types                     | Event pressure score (via Query Agent)   |
| News sentiment and velocity signals       | News activity classification             |
| Stock price and technical indicators      | Stock trend signal consensus             |
| Polymarket event data                     | Outlook classification                   |
| CIK mention frequency counts              | Velocity trend, QoQ %, divergence        |
| —                                         | Signal agreement/conflict classification |
| —                                         | Rank position (client-side sort)         |
| —                                         | Risk category thresholds                 |
| —                                         | 24h news summary (LLM composition)       |
| —                                         | Analyst assessments (local user state)   |
