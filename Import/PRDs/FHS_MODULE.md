# Financial Health Scoring (FHS) Module — Product Requirements Document

**Created:** 2026-05-27  
**Author:** Cursor + Product Team  
**Status:** Draft  
**Module ID:** fhs  
**Context:** Prism Portfolio Risk Prototype + Agent Demonstration Environments

---

## 1. Purpose

Define the Financial Health Scoring (FHS) module — the analytical module responsible for computing a solvency risk score (0–100) for any entity in Elemental's knowledge graph. FHS assesses how likely an entity is to experience financial distress based on structured financial data, distress events, behavioral signals, and instrument-level exposure.

FHS is an **agent-level module**. Elemental provides the primitives (XBRL facts, events, relationships, instrument data); FHS applies scoring logic, temporal adjustments, and confidence modeling on top. The module is invoked by the Query Agent within the four-agent pipeline and produces structured outputs that the Composition Agent formats for display.

---

## 2. Inputs from Elemental

FHS does not ingest or store raw data. All inputs are retrieved by the History Agent from Elemental at query time and passed to FHS as a Context Package.

### 2.1 Required Data

| Data                     | Elemental Source          | Fields Used                                                                                                                                                                    | Purpose                                                                    |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **XBRL Financial Facts** | Entity properties / facts | Total Assets, Total Liabilities, Stockholders' Equity, Current Assets, Current Liabilities, Cash, Revenue, Operating Income, Net Income, Interest Expense, Operating Cash Flow | Compute Tier 1 financial ratios                                            |
| **Filing Metadata**      | Filing records            | Form type, filing date, amendment flag                                                                                                                                         | Tier 3 behavioral signals (late filings, filing gaps, amendment frequency) |
| **8-K Distress Events**  | Event store               | Event type, event date, severity, description                                                                                                                                  | Tier 2 distress event scoring                                              |
| **Relationships**        | Relationship graph        | Officer/director relationships with start/end dates                                                                                                                            | Tier 3 departure detection                                                 |
| **Credit Facilities**    | Instrument store          | Amount, maturity date, lender, covenants (JSON)                                                                                                                                | Tier 5 maturity wall and covenant headroom                                 |
| **Indenture Terms**      | Instrument store          | Principal amount, maturity date, financial covenants, events of default, subordination level, cross-default clauses                                                            | Tier 5 cross-default exposure and subordination risk                       |
| **User Assessments**     | Local project DB          | Event severity overrides per project                                                                                                                                           | Tier 2 user-adjusted event scores                                          |

### 2.2 Optional/Enrichment Data

| Data                  | Elemental Source      | Purpose                                                                                              |
| --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| **Industry/SIC Code** | Entity properties     | Sector-specific threshold adjustments (banks skip current ratio; partnerships use Partners' Capital) |
| **Peer Benchmarks**   | Computed aggregations | Percentile context ("leverage is worse than 85% of peers")                                           |
| **Score History**     | Local project DB      | Trend analysis (quarter-over-quarter score movement)                                                 |

---

## 3. Scoring Architecture

FHS uses a five-tier signal architecture. The tiered design allows graceful degradation — entities with only behavioral signals (no financials) still receive a score.

### 3.1 Tier Overview

| Tier                           | Source                         | What It Measures                                                  | Weight (all tiers present) |
| ------------------------------ | ------------------------------ | ----------------------------------------------------------------- | -------------------------- |
| **Tier 1: Hard Financials**    | XBRL facts from 10-K/10-Q      | Balance sheet health, profitability, liquidity                    | 0.45                       |
| **Tier 2: Distress Events**    | 8-K events                     | Discrete distress occurrences (bankruptcy, delisting, impairment) | 0.20                       |
| **Tier 3: Behavioral Signals** | Filing metadata, relationships | Filing patterns and governance departures                         | 0.12                       |
| **Tier 4: Stake Changes**      | 13D/13G filings                | Activist and major holder shifts                                  | 0.08                       |
| **Tier 5: Instrument Signals** | Credit facilities, indentures  | Maturity wall, covenant headroom, cross-default exposure          | 0.15                       |

### 3.2 Dynamic Weight Redistribution

When tiers lack data, weights redistribute to available tiers:

| Scenario                       | Financial | Instrument | Event | Behavioral | Stake |
| ------------------------------ | --------- | ---------- | ----- | ---------- | ----- |
| All tiers present              | 0.45      | 0.15       | 0.20  | 0.12       | 0.08  |
| No financials, has instruments | —         | 0.45       | 0.30  | 0.15       | 0.10  |
| Events only                    | —         | —          | 0.50  | 0.35       | 0.15  |
| Behavioral only                | —         | —          | —     | 0.70       | 0.30  |

Weights are normalized to sum to 1.0 after zero-weight tiers are removed.

---

## 4. Tier 1: Hard Financials

### 4.1 Ratio Computation

The module computes these ratios from XBRL facts:

| Ratio                | Formula                              | What It Answers                               |
| -------------------- | ------------------------------------ | --------------------------------------------- |
| `leverage_ratio`     | Liabilities / Equity                 | For every $1 of equity, how much debt?        |
| `equity_ratio`       | Equity / Assets                      | What % of the entity is funded by owners?     |
| `net_margin`         | Net Income / Revenue                 | What % of revenue becomes profit?             |
| `current_ratio`      | Current Assets / Current Liabilities | Can they cover this year's obligations?       |
| `cash_ratio`         | Cash / Current Liabilities           | Could they cover obligations with cash alone? |
| `interest_coverage`  | Operating Income / Interest Expense  | Can they service their debt?                  |
| `ocf_to_liabilities` | Operating Cash Flow / Liabilities    | How much cash flow relative to total debt?    |

### 4.2 Entity-Specific Rules

- **Partnerships**: Use Partners' Capital instead of Stockholders' Equity for leverage/equity ratios.
- **Financial Institutions (banks, BHCs)**: Skip current ratio and cash ratio (not meaningful for banks). Use Tier 1 capital ratios if available.
- **Processing Depth**: Up to 20 reporting periods per entity for trend analysis.

### 4.3 Signal Thresholds

Each ratio maps to a signal with severity and score:

**Leverage:**

| Threshold | Severity | Score |
| --------- | -------- | ----- |
| > 5.0x    | Critical | 90    |
| > 3.0x    | High     | 70    |
| > 2.0x    | Medium   | 45    |
| ≤ 2.0x    | Low      | 15    |

**Equity Ratio:**

| Threshold                    | Severity | Score |
| ---------------------------- | -------- | ----- |
| < 0% (technically insolvent) | Critical | 95    |
| < 10%                        | High     | 75    |
| < 20%                        | Medium   | 50    |
| ≥ 20%                        | Low      | 10    |

**Net Margin:**

| Threshold | Severity | Score |
| --------- | -------- | ----- |
| < -50%    | Critical | 85    |
| < -10%    | High     | 65    |
| < 0%      | Medium   | 45    |
| ≥ 0%      | Low      | 10    |

**Signal Weights within Tier 1:** Leverage 1.5, Equity 1.5, Net Margin 1.0.

---

## 5. Tier 2: Distress Events

### 5.1 Event Type to Signal Mapping

| 8-K Event Type                | Signal               | Severity | Base Score | Weight |
| ----------------------------- | -------------------- | -------- | ---------- | ------ |
| `FINANCING_BANKRUPTCY`        | `BANKRUPTCY_EVENT`   | Critical | 100        | 3.0    |
| `DELISTING_NOTICE`            | `DELISTING_EVENT`    | Critical | 90         | 2.5    |
| `ACCOUNTING_NON_RELIANCE`     | `NON_RELIANCE_EVENT` | Critical | 85         | 2.0    |
| `FINANCING_TRIGGERING_EVENTS` | `TRIGGERING_EVENT`   | High     | 70         | 1.5    |
| `FINANCIAL_IMPAIRMENT`        | `IMPAIRMENT_EVENT`   | High     | 60         | 1.0    |
| `FINANCING_TERMINATION`       | `TERMINATION_EVENT`  | Medium   | 50         | 1.0    |

### 5.2 Recency Weighting

Events within the last 730 days (2 years) are scored with linear decay:

- Day 0: multiplier 1.0
- Day 730: multiplier 0.25

### 5.3 User Assessment Overrides

When a `project_id` is provided, analyst `event_assessments` can override default severity. Events marked as `low` by users receive a score of 10 instead of the default. This supports per-project tuning.

---

## 6. Tier 3: Behavioral Signals

| Signal                  | Data Query                                                     | Thresholds                                                |
| ----------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| **Late Filings**        | Filings with form type `NT 10-K` or `NT 10-Q` in 12 months     | ≥3: Critical (85), ≥2: High (70), ≥1: Medium (50)         |
| **Filing Gap**          | Days since entity's most recent filing                         | ≥365d: Critical (90), ≥180d: High (65), ≥90d: Medium (40) |
| **Amendment Frequency** | Amended filings (form type `%/A`) in 12 months                 | ≥5: Medium (40)                                           |
| **Officer Departures**  | Relationships with end_date in last 90 days, type `officer_of` | ≥3: Critical (80), ≥2: High (60), ≥1: Medium (40)         |
| **Director Departures** | Same for `director_of`                                         | ≥2: High (55), ≥1: Medium (35)                            |
| **Auditor Changes**     | Events with type `ACCOUNTING_AUDITOR_CHANGE` in 12 months      | ≥2: Critical (85), 1: High (65)                           |

---

## 7. Tier 5: Instrument Signals

Five signal types computed from credit facility and indenture data:

### 7.1 Maturity Wall

Upcoming credit facility maturities within 18 months compared to available cash.

| Coverage Ratio | Severity | Score |
| -------------- | -------- | ----- |
| < 50%          | Critical | 85    |
| < 80%          | High     | 65    |
| < 120%         | Medium   | 45    |

Imminent maturities (< 6 months) receive a +15 score boost. Weight: 2.0.

### 7.2 Covenant Headroom

Compares current financial ratios to covenant limits from credit facilities and indenture terms.

| Headroom      | Severity | Score |
| ------------- | -------- | ----- |
| ≤ 0% (breach) | Critical | 90    |
| < 10%         | High     | 70    |
| < 20%         | Medium   | 50    |

Weight: 1.8.

### 7.3 Cross-Default Exposure

Counts indentures with cross-default clauses.

| Condition                          | Severity | Score |
| ---------------------------------- | -------- | ----- |
| ≥3 instruments with low thresholds | High     | 75    |
| ≥2 instruments                     | Medium   | 50    |

Weight: 2.2.

### 7.4 Subordination Risk

Subordinated instruments without financial covenants. Weight: 1.2.

### 7.5 Indenture Maturity Wall

Bond/note maturities from indenture terms (complements credit facility maturities). Weight: 2.0.

---

## 8. Composite Score Computation

### 8.1 Within-Tier Aggregation

Each tier produces a category score as a weighted average of its signals:

```
tier_score = Σ(signal_value × signal_weight) / Σ(signal_weight)
```

### 8.2 Cross-Tier Fusion

```
composite = Σ(tier_score × dynamic_tier_weight)
```

Where dynamic tier weights are redistributed based on data availability (see Section 3.2).

### 8.3 Critical Override

Any signal with `CRITICAL` severity forces `composite ≥ 75`.

### 8.4 Risk Level Classification

| Score | Risk Level |
| ----- | ---------- |
| ≥ 75  | Critical   |
| ≥ 50  | High       |
| ≥ 25  | Medium     |
| < 25  | Low        |

---

## 9. Temporal Adjustments

Three post-composite adjustments:

### 9.1 Staleness Decay

Reduces financial score contribution when data is old:

| Data Age     | Multiplier |
| ------------ | ---------- |
| 0–180 days   | 1.0        |
| 181–365 days | 0.85       |
| 366–730 days | 0.6        |
| 730+ days    | 0.3        |

### 9.2 Trend Analysis

Compares leverage ratio between the two most recent periods:

| Change    | Direction           | Score Adjustment |
| --------- | ------------------- | ---------------- |
| ≥ +25%    | Rapid deterioration | +30              |
| ≥ +10%    | Deteriorating       | +15              |
| ≤ -10%    | Improving           | -10              |
| Otherwise | Stable              | 0                |

### 9.3 Event Velocity

Detects event clustering using a 14-day window:

| Cluster Size          | Bonus |
| --------------------- | ----- |
| ≥ 5 events in 14 days | +40   |
| ≥ 3 events in 14 days | +25   |

Event types considered: distress, executive, auditor, governance, M&A, restructuring.

---

## 10. Confidence Assessment

Every FHS score includes a confidence rating:

| Factor           | Weight | Scoring                                                |
| ---------------- | ------ | ------------------------------------------------------ |
| **Data tier**    | 30%    | Tier 1 = 100, Tier 5 = 70, Tier 2 = 75, Tier 3 = 50    |
| **Signal count** | 25%    | ≥5 = 100, ≥3 = 75, ≥1 = 50, 0 = 25                     |
| **Freshness**    | 20%    | ≤30d = 100, ≤90d = 80, ≤180d = 60, ≤365d = 40, else 20 |
| **Certainty**    | 15%    | Ratio of unambiguous signals to total                  |
| **Verification** | 10%    | Ratio of user-assessed events to total                 |

Confidence level: ≥75 HIGH, ≥50 MEDIUM, else LOW.

---

## 11. Output Contract

FHS returns a structured `SolvencyScore` object:

```
SolvencyScore:
  score: number (0-100)
  risk_level: "critical" | "high" | "medium" | "low"
  confidence: number (0-100)
  confidence_level: "high" | "medium" | "low"
  trend_direction: "rapid_deterioration" | "deteriorating" | "stable" | "improving"
  velocity_score: number
  staleness_days: number
  staleness_level: "fresh" | "aging" | "stale" | "very_stale"
  has_financial_data: boolean
  signals: Signal[]
    - signal_type: string
    - tier: number (1-5)
    - severity: "critical" | "high" | "medium" | "low"
    - score: number
    - weight: number
    - description: string
    - evidence: EvidenceCitation[]
  tier_breakdown:
    - tier: number
    - tier_name: string
    - score: number
    - weight: number
    - signal_count: number
  risk_drivers: RiskDriver[] (top 5)
    - driver: string
    - lens: "solvency"
    - source: "SEC" | "instrument"
    - description: string
    - evidence: EvidenceCitation[]
```

---

## 12. Agent Integration

### 12.1 Invocation

The Query Agent invokes FHS as a scoring module within the pipeline:

```
Pipeline: Dialogue → History → Query (FHS invoked here) → Composition
```

FHS receives the Context Package from the History Agent. It never calls Elemental directly.

### 12.2 Caching

FHS results are cached in the local project database with a configurable TTL. Cache key: `(project_id, neid, "fhs")`. Default TTL: 24 hours for demo, configurable for production.

### 12.3 Batch Mode

For portfolio-level scoring, FHS is invoked per entity with bounded concurrency. The Query Agent manages the fan-out.

---

## 13. Configuration

All weights, thresholds, and multipliers documented here are **defaults**. In the Prism prototype, these are configurable:

| Parameter                   | Default          | Where Configured                     |
| --------------------------- | ---------------- | ------------------------------------ |
| Tier weights                | See Section 3.1  | Agent configuration / weight sliders |
| Signal thresholds           | See Sections 4-7 | Per-project settings                 |
| Staleness decay multipliers | See Section 9.1  | Agent configuration                  |
| Trend adjustment values     | See Section 9.2  | Agent configuration                  |
| Velocity window             | 14 days          | Agent configuration                  |
| Confidence factor weights   | See Section 10   | Fixed (v1)                           |

---

## 14. What Belongs in Elemental vs. What FHS Computes

| Elemental Provides (Primitives)            | FHS Computes (Agent-Level)                              |
| ------------------------------------------ | ------------------------------------------------------- |
| Raw XBRL fact values per entity per period | Financial ratios from those facts                       |
| Filing metadata (form type, date)          | Filing gap, late filing, amendment signals              |
| 8-K events with types and dates            | Distress event scoring with recency decay               |
| Relationships with start/end dates         | Departure counting and pattern detection                |
| Credit facility and indenture records      | Maturity wall, covenant headroom, cross-default scoring |
| Industry/SIC codes                         | Sector-specific threshold adjustments                   |
| —                                          | Composite multi-tier fusion score                       |
| —                                          | Temporal adjustments (staleness, trend, velocity)       |
| —                                          | Confidence assessment                                   |
| —                                          | Risk driver ranking with evidence chains                |
