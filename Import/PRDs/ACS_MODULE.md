# Adversarial Capital Screening (ACS) Module — Product Requirements Document

**Created:** 2026-05-27  
**Author:** Cursor + Product Team  
**Status:** Draft  
**Module ID:** acs  
**Context:** Prism Portfolio Risk Prototype + Agent Demonstration Environments

---

## 1. Purpose

Define the Adversarial Capital Screening (ACS) module — the analytical module responsible for assessing an entity's proximity to sanctioned parties, politically exposed persons (PEPs), high-risk jurisdictions, and foreign ownership/control/influence (FOCI) indicators. ACS produces a compliance exposure score (0–100) by traversing Elemental's ownership and relationship graph and evaluating each path against sanctions lists, jurisdiction risk, and beneficial ownership depth.

ACS is an **agent-level module**. Elemental provides the graph (entities, relationships, ownership chains, locations, identifiers); ACS traverses that graph, evaluates each node and path against risk indicators, and produces a structured compliance exposure assessment. The module is invoked by the Query Agent within the four-agent pipeline.

ACS addresses the compliance screening dimension that FHS and ERS do not cover. While FHS measures financial health and ERS measures governance stability, ACS answers: **"Is this entity, or anyone in its ownership chain, connected to sanctioned, adversarial, or high-risk parties?"**

---

## 2. Inputs from Elemental

### 2.1 Graph Data (Retrieved by History Agent)

| Data                       | Elemental Source                                  | Fields Used                                                                        | Purpose                                                 |
| -------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
| **Beneficial Ownership**   | Relationship graph (`beneficial_owner_of`)        | from_entity, to_entity, ownership_percentage, start_date, end_date                 | Map ownership chains and identify controlling interests |
| **Subsidiary Chain**       | Relationship graph (`subsidiary_of`)              | from_entity, to_entity, jurisdiction                                               | Trace corporate structure upward to ultimate parent     |
| **Officer/Director Roles** | Relationship graph (`officer_of`, `director_of`)  | from_entity (person), to_entity (company), title                                   | Identify persons with governance control                |
| **Entity Identifiers**     | Entity properties                                 | NEID, LEI, CIK, name, aliases, entity_type, jurisdiction, country_of_incorporation | Match against sanctions lists; assess jurisdiction risk |
| **Location Data**          | Location graph (`located_at`, `headquartered_in`) | Location name, country, jurisdiction                                               | Geographic risk assessment                              |
| **LEI Relationships**      | GLEIF data                                        | Direct/ultimate parent LEIs, relationship type                                     | Validate corporate structure via authoritative registry |

### 2.2 External Reference Data

| Data                                  | Source                            | Purpose                                                 |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------- |
| **Consolidated Screening List (CSL)** | Trade.gov                         | U.S. government sanctions, denied parties, entity lists |
| **OFAC SDN List**                     | Treasury Department               | Specially Designated Nationals                          |
| **UN Sanctions**                      | UN Security Council               | International sanctions designations                    |
| **PEP Databases**                     | Configurable (demo: curated list) | Politically Exposed Person identification               |
| **Jurisdiction Risk Classification**  | Internal (configurable)           | Country/jurisdiction risk tiers                         |

### 2.3 Jurisdiction Risk Tiers

ACS classifies jurisdictions into risk tiers for FOCI assessment:

| Tier                   | Classification                             | Examples                                                                | Risk Weight |
| ---------------------- | ------------------------------------------ | ----------------------------------------------------------------------- | ----------- |
| **Tier 1: Sanctioned** | Comprehensive sanctions programs           | North Korea, Iran, Syria, Cuba, Russia (partial), Crimea                | 1.0         |
| **Tier 2: High Risk**  | Elevated compliance risk jurisdictions     | China, Venezuela, Belarus, Myanmar, certain African jurisdictions       | 0.7         |
| **Tier 3: Watch**      | Jurisdictions with notable regulatory gaps | Various offshore financial centers, jurisdictions with weak AML regimes | 0.4         |
| **Tier 4: Standard**   | Normal-risk jurisdictions                  | Most OECD countries, well-regulated financial centers                   | 0.1         |

Jurisdiction tier assignments are **configurable** per deployment. Different customers will have different risk appetites and regulatory requirements.

---

## 3. Screening Architecture

ACS performs three types of screening, then fuses them into a composite compliance exposure score.

### 3.1 Screening Layers

| Layer                        | What It Checks                                                                                    | Output                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Direct Screening**         | Does this entity or its identifiers match any sanctions/screening list?                           | Match/no-match with match quality score |
| **Ownership Path Screening** | Do any entities in the ownership chain (beneficial owners, parent companies, subsidiaries) match? | Path-based matches with hop distance    |
| **Governance Screening**     | Do any officers, directors, or beneficial owners match sanctions lists or PEP databases?          | Person-level matches with role context  |

### 3.2 Processing Flow

```
Entity Under Review
        │
        ▼
┌─────────────────────────────────────────┐
│  STEP 1: DIRECT SCREENING              │
│                                         │
│  Match entity identifiers against:      │
│  - CSL (Trade.gov)                      │
│  - OFAC SDN                            │
│  - UN Sanctions                         │
│  - PEP databases                        │
│                                         │
│  Fuzzy name matching + identifier match │
│  Output: Direct match results           │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  STEP 2: GRAPH TRAVERSAL               │
│                                         │
│  Walk the ownership/relationship graph: │
│  - Upward: beneficial_owner_of chain    │
│  - Upward: subsidiary_of to parent      │
│  - Lateral: officer_of, director_of     │
│  - LEI: GLEIF parent chain validation   │
│                                         │
│  Max depth: configurable (default 3     │
│  hops for ownership, 2 for governance)  │
│                                         │
│  At each node: run Direct Screening     │
│  Output: Screened graph with matches    │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  STEP 3: JURISDICTION ASSESSMENT        │
│                                         │
│  For each entity in the traversed       │
│  graph, evaluate:                       │
│  - Country of incorporation            │
│  - HQ jurisdiction                      │
│  - Facility locations                   │
│  - LEI registration authority           │
│                                         │
│  Apply jurisdiction risk tiers          │
│  Output: Jurisdiction exposure map      │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  STEP 4: FOCI ASSESSMENT               │
│                                         │
│  Evaluate Foreign Ownership, Control,   │
│  or Influence indicators:               │
│  - Foreign ownership percentage         │
│  - Foreign board seat percentage        │
│  - Foreign officer positions            │
│  - Debt held by foreign entities        │
│  - Technology/data sharing agreements   │
│                                         │
│  Output: FOCI risk indicators           │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  STEP 5: COMPOSITE SCORING             │
│                                         │
│  Fuse all layers into compliance        │
│  exposure score (0-100)                 │
│                                         │
│  Output: ACS Score + Evidence           │
└─────────────────────────────────────────┘
```

---

## 4. Direct Screening

### 4.1 Matching Strategy

For each entity, ACS matches against screening lists using multiple identifiers:

| Identifier      | Match Type                        | Confidence         |
| --------------- | --------------------------------- | ------------------ |
| **LEI**         | Exact match                       | Very High (0.95)   |
| **CIK**         | Exact match                       | High (0.90)        |
| **EIN**         | Exact match                       | High (0.85)        |
| **Legal Name**  | Fuzzy match (Jaro-Winkler ≥ 0.92) | Medium-High (0.80) |
| **Aliases/DBA** | Fuzzy match (Jaro-Winkler ≥ 0.88) | Medium (0.70)      |
| **Address**     | Structured comparison             | Supplementary      |

### 4.2 Match Classification

| Match Quality | Criteria                                                     | Score Impact                          |
| ------------- | ------------------------------------------------------------ | ------------------------------------- |
| **Exact**     | Strong identifier match (LEI, CIK, EIN)                      | Full score applied                    |
| **Strong**    | Legal name match ≥ 0.95 + corroborating identifier           | 90% of full score                     |
| **Probable**  | Legal name match ≥ 0.92 + address/jurisdiction corroboration | 70% of full score                     |
| **Possible**  | Name-only match ≥ 0.88, requires human review                | 40% of full score, flagged for review |

### 4.3 False Positive Mitigation

- **Negative evidence**: Conflicting identifiers (different CIK, different LEI) reduce match confidence
- **Entity type mismatch**: Person match against organization name (and vice versa) reduces confidence
- **Jurisdiction mismatch**: Entity in low-risk jurisdiction matching sanctioned entity in different country is flagged but downweighted
- **Human review queue**: Possible matches are surfaced for analyst confirmation, not auto-scored

---

## 5. Ownership Path Screening

### 5.1 Graph Traversal Rules

| Traversal Direction         | Relationship Types                     | Max Depth  | Purpose                                     |
| --------------------------- | -------------------------------------- | ---------- | ------------------------------------------- |
| **Upward (ownership)**      | `beneficial_owner_of`, `subsidiary_of` | 3 hops     | Find sanctioned parents/owners              |
| **Lateral (governance)**    | `officer_of`, `director_of`            | 2 hops     | Find sanctioned persons in governance roles |
| **Downward (subsidiaries)** | `subsidiary_of` (inverted)             | 2 hops     | Find sanctioned subsidiaries                |
| **LEI chain**               | GLEIF direct/ultimate parent           | Full chain | Authoritative ownership validation          |

### 5.2 Hop Distance Decay

Matches farther from the entity under review are less impactful:

| Hop Distance             | Impact Multiplier | Rationale                                  |
| ------------------------ | ----------------- | ------------------------------------------ |
| 0 (direct match)         | 1.0               | Entity itself is sanctioned                |
| 1 (direct owner/officer) | 0.8               | Immediate relationship to sanctioned party |
| 2                        | 0.5               | One degree of separation                   |
| 3                        | 0.3               | Two degrees of separation                  |

### 5.3 Ownership Percentage Weighting

For `beneficial_owner_of` relationships where ownership percentage is available:

| Ownership %          | Weight Multiplier |
| -------------------- | ----------------- |
| ≥ 50% (controlling)  | 1.0               |
| 25–49% (significant) | 0.7               |
| 10–24% (notable)     | 0.4               |
| < 10% (minor)        | 0.2               |

---

## 6. FOCI Assessment

Foreign Ownership, Control, or Influence indicators are evaluated for entities where defense, government contracting, or critical infrastructure exposure is relevant.

### 6.1 FOCI Indicators

| Indicator                        | Data Source                         | Detection                                                             |
| -------------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| **Foreign ownership percentage** | Beneficial ownership chain          | Sum of ownership % held by foreign-incorporated entities              |
| **Foreign board seats**          | Director relationships              | Count of directors associated with foreign entities / total directors |
| **Foreign officer positions**    | Officer relationships               | Count of officers associated with foreign entities / total officers   |
| **Foreign debt holdings**        | Instrument data (credit facilities) | Credit facilities where lender is foreign-incorporated                |
| **Parent entity jurisdiction**   | Subsidiary chain                    | Ultimate parent country of incorporation                              |

### 6.2 FOCI Risk Thresholds

| Indicator                       | Low  | Medium | High   | Critical |
| ------------------------------- | ---- | ------ | ------ | -------- |
| Foreign ownership %             | < 5% | 5–24%  | 25–49% | ≥ 50%    |
| Foreign board seat %            | 0%   | 1–20%  | 21–49% | ≥ 50%    |
| Foreign officer %               | 0%   | 1–15%  | 16–39% | ≥ 40%    |
| Parent in Tier 1/2 jurisdiction | No   | —      | Tier 2 | Tier 1   |

---

## 7. Composite Scoring

### 7.1 Component Scores

| Component                   | Score Range | Weight |
| --------------------------- | ----------- | ------ |
| **Direct Sanctions Match**  | 0–100       | 0.35   |
| **Ownership Path Exposure** | 0–100       | 0.30   |
| **Governance Exposure**     | 0–100       | 0.15   |
| **Jurisdiction Risk**       | 0–100       | 0.12   |
| **FOCI Indicators**         | 0–100       | 0.08   |

### 7.2 Direct Sanctions Match Scoring

| Condition                                        | Score |
| ------------------------------------------------ | ----- |
| Exact match on primary sanctions list (OFAC SDN) | 100   |
| Exact match on secondary list (CSL, UN)          | 90    |
| Strong match (name + corroborating ID)           | 75    |
| Probable match (name + jurisdiction)             | 50    |
| Possible match (name only, flagged for review)   | 25    |
| No match                                         | 0     |

### 7.3 Ownership Path Exposure Scoring

For each sanctioned entity found in the ownership chain:

```
path_score = match_score × hop_decay × ownership_weight
```

Multiple paths sum (capped at 100). The highest-risk path is identified as the primary risk driver.

### 7.4 Critical Override

A direct exact match on OFAC SDN forces `composite ≥ 90`.

### 7.5 Risk Level Classification

| Score | Risk Level | Action Implication                                  |
| ----- | ---------- | --------------------------------------------------- |
| ≥ 75  | Critical   | Immediate review required; potential account action |
| ≥ 50  | High       | Enhanced due diligence required                     |
| ≥ 25  | Medium     | Standard monitoring with flagged indicators         |
| < 25  | Low        | Routine screening passed                            |

---

## 8. Output Contract

```
ACSScore:
  score: number (0-100)
  risk_level: "critical" | "high" | "medium" | "low"
  confidence: number (0-100)
  confidence_level: "high" | "medium" | "low"
  screening_summary:
    direct_matches: number
    path_matches: number
    governance_matches: number
    jurisdictions_flagged: number
    foci_indicators_flagged: number
    total_entities_screened: number
    graph_depth_reached: number
  direct_matches: DirectMatch[]
    - matched_entity: EntityRef
    - list_source: "OFAC_SDN" | "CSL" | "UN" | "PEP" | "custom"
    - match_quality: "exact" | "strong" | "probable" | "possible"
    - match_confidence: number (0-1)
    - matched_identifiers: string[]
    - requires_review: boolean
  path_matches: PathMatch[]
    - sanctioned_entity: EntityRef
    - path: EntityRef[] (entity chain from subject to match)
    - hop_distance: number
    - relationship_types: string[]
    - ownership_percentage: number | null
    - list_source: string
    - risk_contribution: number
  jurisdiction_exposure: JurisdictionExposure[]
    - jurisdiction: string
    - country_code: string
    - risk_tier: 1 | 2 | 3 | 4
    - entities_present: EntityRef[]
    - relationship_to_subject: string
  foci_assessment: FOCIAssessment
    - foreign_ownership_pct: number
    - foreign_board_pct: number
    - foreign_officer_pct: number
    - parent_jurisdiction_tier: number
    - overall_foci_risk: "critical" | "high" | "medium" | "low"
  risk_drivers: RiskDriver[] (top 5)
    - driver: string
    - lens: "compliance"
    - source: "CSL" | "OFAC" | "GLEIF" | "ownership_graph" | "jurisdiction"
    - description: string
    - evidence: EvidenceCitation[]
  review_queue: ReviewItem[]
    - entity: EntityRef
    - reason: string
    - match_details: object
    - priority: "urgent" | "standard"
```

---

## 9. Agent Integration

### 9.1 Invocation

The Query Agent invokes ACS alongside FHS and ERS:

```
Pipeline: Dialogue → History → Query (FHS + ERS + ACS) → Composition
```

ACS requires additional data from the History Agent beyond what FHS/ERS need — specifically, multi-hop graph traversal and screening list lookups.

### 9.2 History Agent Additions for ACS

The History Agent must support these additional operations when ACS is requested:

| Operation                                      | Purpose                                                     |
| ---------------------------------------------- | ----------------------------------------------------------- |
| Multi-hop ownership traversal (up to 3 hops)   | Build the ownership chain for path screening                |
| Screening list lookup (CSL, OFAC)              | Check entities against sanctions databases                  |
| GLEIF parent chain resolution                  | Validate ownership via LEI registry                         |
| Jurisdiction resolution for all graph entities | Map each entity to country/jurisdiction for risk assessment |

### 9.3 Performance Considerations

ACS is the most computationally expensive module because it requires graph traversal and N screening list lookups (one per entity in the traversed graph). For a portfolio of 50 entities with 3-hop traversal, this could mean 500+ screening checks.

**Mitigations:**

- Screening list results are cached aggressively (list data changes weekly, not per-query)
- Traversal depth is configurable per project (1-hop for quick scan, 3-hop for deep diligence)
- Batch screening: all entities from traversal are screened in a single batch call, not individually
- Pre-computed screening for known-clean entities with short TTL bypass

### 9.4 Caching

Cache key: `(project_id, neid, "acs", traversal_depth)`. Default TTL: 7 days (screening lists update weekly).

---

## 10. Configuration

| Parameter                    | Default                    | Where Configured                   |
| ---------------------------- | -------------------------- | ---------------------------------- |
| Traversal depth (ownership)  | 3 hops                     | Per-project settings               |
| Traversal depth (governance) | 2 hops                     | Per-project settings               |
| Fuzzy match threshold        | 0.92 (Jaro-Winkler)        | Agent configuration                |
| Jurisdiction risk tiers      | See Section 2.3            | Per-deployment (customer-specific) |
| FOCI thresholds              | See Section 6.2            | Per-project settings               |
| Component weights            | See Section 7.1            | Per-project settings               |
| Screening list sources       | CSL + OFAC SDN             | Per-deployment                     |
| Cache TTL                    | 7 days                     | Agent configuration                |
| Review queue threshold       | match_quality = "possible" | Agent configuration                |

---

## 11. Demo Narrative

ACS adds a compliance dimension to the Prism demo:

| Step | What the Presenter Shows                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 1    | "This entity has a High compliance exposure score. Let me show you why."                                                   |
| 2    | "The ownership chain shows a beneficial owner two hops away that appears on the CSL."                                      |
| 3    | "The path goes: Target Company → Parent Holding → Beneficial Owner → CSL Match."                                           |
| 4    | "The match confidence is 'Strong' — name match plus corroborating LEI from GLEIF."                                         |
| 5    | "The entity also has 35% foreign ownership from a Tier 2 jurisdiction, triggering a FOCI indicator."                       |
| 6    | "All of this is traced back to source: the GLEIF registry for the ownership chain, Trade.gov CSL for the sanctions match." |

---

## 12. What Belongs in Elemental vs. What ACS Computes

| Elemental Provides (Primitives)                     | ACS Computes (Agent-Level)                                 |
| --------------------------------------------------- | ---------------------------------------------------------- |
| Beneficial ownership relationships with percentages | Ownership chain traversal and path construction            |
| Subsidiary chains with jurisdictions                | Multi-hop graph exploration with depth limits              |
| Officer/director relationships with titles          | Governance exposure assessment                             |
| Entity identifiers (LEI, CIK, EIN, names, aliases)  | Fuzzy matching against screening lists                     |
| GLEIF parent chain data                             | LEI-validated ownership verification                       |
| Location/jurisdiction data for entities             | Jurisdiction risk tier classification                      |
| —                                                   | Direct and path-based sanctions screening                  |
| —                                                   | FOCI indicator computation                                 |
| —                                                   | Composite compliance exposure scoring                      |
| —                                                   | Match quality classification and false positive mitigation |
| —                                                   | Review queue for analyst confirmation                      |
| —                                                   | Risk driver ranking with evidence chains                   |

---

## 13. Relationship to KYC and EDD Solution Packs

ACS is a foundational module for multiple Solution Packs described in the "Demonstrating Agent-Driven Intelligence" document:

| Solution Pack                    | How ACS Is Used                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Know Your Customer (KYC)**     | Continuous ACS screening of customer entities. Monitoring agent watches for ownership changes that alter ACS scores. |
| **Enhanced Due Diligence (EDD)** | Deep ACS with maximum traversal depth. Full FOCI assessment. All matches reviewed, not just high-confidence.         |
| **Portfolio Risk Monitoring**    | Batch ACS across portfolio. Surface entities where ACS score crosses thresholds alongside FHS/ERS signals.           |
| **Private Wealth**               | Screen beneficial owners and associated entities of HNW clients. PEP identification.                                 |
