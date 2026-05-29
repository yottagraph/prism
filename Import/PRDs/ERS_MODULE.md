# Executive Risk Scoring (ERS) Module — Product Requirements Document

**Created:** 2026-05-27  
**Author:** Cursor + Product Team  
**Status:** Draft  
**Module ID:** ers  
**Context:** Prism Portfolio Risk Prototype + Agent Demonstration Environments

---

## 1. Purpose

Define the Executive Risk Scoring (ERS) module — the analytical module responsible for computing a governance and leadership stability score (0–100) for any entity in Elemental's knowledge graph. ERS measures how stable and trustworthy an entity's leadership is based on officer/director tenure, departure patterns, C-suite continuity, auditor stability, and board composition.

ERS is an **agent-level module**. Elemental provides the primitives (relationships, events, entity facts); ERS applies recency-weighted scoring, cumulative pattern detection, key person risk assessment, and confidence modeling. The module is invoked by the Query Agent within the four-agent pipeline.

---

## 2. Inputs from Elemental

All inputs are retrieved by the History Agent and passed to ERS as part of the Context Package.

### 2.1 Required Data

| Data                       | Elemental Source   | Fields Used                                                                           | Purpose                                                     |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Officer Relationships**  | Relationship graph | from_entity, to_entity, relationship_type (`officer_of`), title, start_date, end_date | Count current officers, detect departures, identify C-suite |
| **Director Relationships** | Relationship graph | Same fields with type `director_of`                                                   | Count current directors, detect departures                  |
| **8-K Departure Events**   | Event store        | Event type (`EXEC_DEPARTURE_APPOINTMENT`), event_date, description/snippet            | Item 5.02 official departure filings                        |
| **Auditor Change Events**  | Event store        | Event type (`ACCOUNTING_AUDITOR_CHANGE`), event_date, description                     | Auditor stability signal                                    |

### 2.2 Optional/Enrichment Data

| Data                     | Elemental Source                           | Purpose                                                 |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------- |
| **Beneficial Ownership** | Relationship graph (`beneficial_owner_of`) | Ownership concentration and insider dynamics            |
| **Form 4 Events**        | Event store (insider transactions)         | Insider selling patterns (feeds Risk Activities engine) |
| **Score History**        | Local project DB                           | Trend analysis over time                                |

---

## 3. Governance Summary Assembly

Before scoring, ERS assembles a governance snapshot for the entity:

| Component                    | Definition                                                                                             | Time Window       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------- |
| **Current Officers**         | Relationships where type = `officer_of` and active (no end_date, or end_date in future)                | Current           |
| **Current Directors**        | Same filter with `director_of`                                                                         | Current           |
| **C-Suite Identification**   | Titles containing: CEO, CFO, CTO, COO, CMO, CHIEF, PRESIDENT, PRINCIPAL EXECUTIVE, PRINCIPAL FINANCIAL | Current           |
| **Officer Departures (90d)** | Officer relationships with end_date in last 90 days                                                    | Rolling 90 days   |
| **All Departures (12m)**     | All officer + director relationships with end_date in last 12 months                                   | Rolling 12 months |
| **Auditor Changes (12m)**    | Events of type `ACCOUNTING_AUDITOR_CHANGE`                                                             | Rolling 12 months |
| **8-K Departure Events**     | Events of type `EXEC_DEPARTURE_APPOINTMENT` with snippet analysis                                      | Rolling 12 months |

---

## 4. Signal Scoring

ERS produces up to 8 signal types. Each contributes additively to the total score.

### Signal 1: Officer Count

| Condition    | Risk Level | Score |
| ------------ | ---------- | ----- |
| 0 officers   | Critical   | +50   |
| < 3 officers | Medium     | +20   |
| ≥ 3 officers | Low        | +0    |

### Signal 2: C-Suite Coverage

| Condition                            | Risk Level | Score |
| ------------------------------------ | ---------- | ----- |
| < 2 C-suite roles (and officers > 0) | High       | +25   |
| ≥ 2 C-suite roles                    | Low        | +0    |

### Signal 3: Officer Departures (Recency-Weighted)

Each officer departure in the past 12 months:

```
departure_score = 15.0 × recency_multiplier × c_suite_premium
```

**Recency Multipliers:**

| Days Since Departure | Multiplier |
| -------------------- | ---------- |
| ≤ 30 days            | 1.0        |
| ≤ 90 days            | 0.85       |
| ≤ 180 days           | 0.6        |
| ≤ 365 days           | 0.4        |
| > 365 days           | 0.3        |

**C-Suite Premiums:**

| Role          | Premium |
| ------------- | ------- |
| CEO           | 1.5x    |
| CFO           | 1.4x    |
| COO           | 1.3x    |
| PRESIDENT     | 1.3x    |
| CHIEF (other) | 1.2x    |
| PRINCIPAL     | 1.2x    |

Total officer departure contribution is **capped at 60**. Risk levels: ≥45 Critical, ≥25 High, else Medium.

### Signal 4: Director Departures (Recency-Weighted)

Each director departure: `10.0 × recency_multiplier`. Capped at 40.

Risk: ≥30 High, ≥15 Medium.

### Signal 5: C-Suite Departure Premium

Reports the additional premium score applied to C-suite officer departures. Informational — the score is already included in Signal 3.

### Signal 6: Cumulative Departure Pattern

When total departures in 12 months reach a threshold, a pattern bonus applies:

| Departures in 12m | Multiplier | Pattern Bonus |
| ----------------- | ---------- | ------------- |
| 1                 | 1.0        | 0             |
| 2                 | 1.15       | +3            |
| 3                 | 1.3        | +6            |
| 4                 | 1.5        | +10           |
| 5+                | 1.6        | +12           |

Formula: `pattern_bonus = (multiplier - 1.0) × 20.0`

Triggered only when departures ≥ 2 (the "concerning" threshold). Marked **systemic** if ≥ 4 departures in 12 months.

### Signal 7: Auditor Changes

Each auditor change in 12 months: +20 (capped at 40).

| Condition   | Risk Level |
| ----------- | ---------- |
| ≥ 2 changes | Critical   |
| 1 change    | High       |

### Signal 8: 8-K Departure Events (Item 5.02)

Official SEC filings for officer/director changes, scored separately from relationship-based departures:

```
event_score = 10.0 × recency_multiplier × (1.4 if c_suite else 1.0)
```

C-suite detection is based on snippet content (searches for CEO, CFO, etc.). Capped at 50.

Risk levels: ≥40 or ≥2 C-suite events = Critical; ≥25 or ≥1 C-suite = High.

---

## 5. Key Person Risk

Derived from officer/director counts — assessed but not directly scored:

| Condition                   | Key Person Risk |
| --------------------------- | --------------- |
| 0 officers                  | Critical        |
| < 3 officers or < 2 C-suite | High            |
| < 5 officers                | Medium          |
| ≥ 5 officers                | Low             |

Key person risk is reported alongside the ERS score as contextual governance metadata.

---

## 6. Composite Score

All signal contributions are summed and **capped at 100**.

| Score Range | Risk Level |
| ----------- | ---------- |
| ≥ 75        | Critical   |
| ≥ 50        | High       |
| ≥ 25        | Medium     |
| < 25        | Low        |

---

## 7. Confidence Assessment

| Factor            | Weight | Scoring                                                             |
| ----------------- | ------ | ------------------------------------------------------------------- |
| **Data coverage** | 40%    | ≥5 officers + ≥3 directors = 100, ≥3 officers = 75, ≥1 = 50, 0 = 10 |
| **Signal count**  | 35%    | ≥5 signals = 100, ≥3 = 75, ≥1 = 50, 0 = 25                          |
| **Freshness**     | 25%    | Most recent departure: ≤30d = 100, ≤90d = 80, ≤180d = 60, else 40   |

Confidence level: ≥75 HIGH, ≥50 MEDIUM, else LOW.

---

## 8. Secondary Path: Risk Activities Engine

ERS has a secondary analysis path that produces a separate, activity-level governance breakdown. This provides a more granular view than the composite score:

| Activity              | Approach                                                   |
| --------------------- | ---------------------------------------------------------- |
| Executive turnover    | Relationship count / unique persons as proxy ratio         |
| Key person dependency | Officer + C-suite count thresholds                         |
| Auditor change        | 8-K event analysis with resignation/disagreement detection |
| Insider selling       | Form 4 event analysis with sell ratio                      |
| Leverage risk         | Debt/equity ratio from XBRL facts                          |
| Equity risk           | Equity/assets ratio from XBRL facts                        |
| Margin risk           | Net income/revenue from XBRL facts                         |
| Event frequency       | Events per year                                            |
| Cybersecurity         | 8-K Item 1.05 incidents                                    |

Category blending:

- `executive_risk = mean(executive turnover + key person + auditor change + insider selling)`
- `financial_risk = mean(leverage + equity + margin)`
- `overall = financial_risk × 0.60 + executive_risk × 0.30 + (news_pressure + event_risk) / 2 × 0.10`

A critical override forces overall score ≥80 if any governance activity is critical.

---

## 9. Output Contract

ERS returns a structured `ExecutiveScore` object:

```
ExecutiveScore:
  score: number (0-100)
  risk_level: "critical" | "high" | "medium" | "low"
  confidence: number (0-100)
  confidence_level: "high" | "medium" | "low"
  key_person_risk: "critical" | "high" | "medium" | "low"
  governance_summary:
    officer_count: number
    director_count: number
    c_suite_count: number
    c_suite_roles: string[]
    departures_90d: number
    departures_12m: number
    auditor_changes_12m: number
    is_systemic: boolean
  signals: Signal[]
    - signal_type: string
    - severity: "critical" | "high" | "medium" | "low"
    - score: number
    - description: string
    - evidence: EvidenceCitation[]
  risk_drivers: RiskDriver[] (top 5)
    - driver: string
    - lens: "executive"
    - source: "SEC"
    - description: string
    - evidence: EvidenceCitation[]
  risk_activities: RiskActivity[] (optional, from secondary path)
    - activity: string
    - score: number (0-100)
    - risk_level: string
    - description: string
```

---

## 10. Agent Integration

### 10.1 Invocation

Same pattern as FHS — the Query Agent invokes ERS as a scoring module:

```
Pipeline: Dialogue → History → Query (ERS invoked here) → Composition
```

### 10.2 ERS + FHS Relationship

ERS and FHS are independent modules that operate on the same Context Package. The Query Agent runs both, then computes a fused score:

```
fused = fhs_score × fhs_weight + ers_score × ers_weight + ...
```

When FHS and ERS diverge (strong financials but governance instability, or vice versa), the Query Agent flags this as a **signal conflict** — a key analytical insight.

### 10.3 Caching

Cache key: `(project_id, neid, "ers")`. Default TTL: 24 hours.

---

## 11. Configuration

| Parameter                     | Default                                                           | Where Configured     |
| ----------------------------- | ----------------------------------------------------------------- | -------------------- |
| Recency multipliers           | See Section 4, Signal 3                                           | Agent configuration  |
| C-suite premiums              | See Section 4, Signal 3                                           | Agent configuration  |
| Departure base scores         | Officer: 15, Director: 10                                         | Agent configuration  |
| Signal caps                   | Officer departures: 60, Director: 40, Auditor: 40, 8-K events: 50 | Agent configuration  |
| Cumulative pattern thresholds | ≥2 concerning, ≥4 systemic                                        | Agent configuration  |
| Risk Activities weights       | See Section 8                                                     | Per-project settings |

---

## 12. What Belongs in Elemental vs. What ERS Computes

| Elemental Provides (Primitives)                                | ERS Computes (Agent-Level)                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| Officer/director relationships with start/end dates and titles | Current governance snapshot (counts, C-suite identification)        |
| 8-K events with types, dates, descriptions                     | Departure detection and C-suite classification from snippet content |
| Entity facts (for risk activities secondary path)              | Recency-weighted departure scoring with premiums                    |
| —                                                              | Cumulative pattern detection (systemic instability)                 |
| —                                                              | Key person risk assessment                                          |
| —                                                              | Auditor change severity (resignation, disagreement detection)       |
| —                                                              | Composite score with confidence                                     |
| —                                                              | Risk driver ranking with evidence chains                            |
| —                                                              | Risk Activities engine (9-activity governance breakdown)            |
