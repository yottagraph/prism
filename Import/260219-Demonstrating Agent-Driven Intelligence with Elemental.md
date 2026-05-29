# From Context to Action

Updated 2/19

## Demonstrating Agent-Driven Intelligence with Elemental

Across financial services, national security, and logistics, organizations are confronting the same underlying problem: the volume of available data has exploded, timelines are compressing, and decision-makers are expected to act with confidence before the picture is fully clear. Analysts pull reports, reconcile conflicting signals, decide what matters, and then communicate conclusions downstream. This model worked when data volumes were smaller. It does not scale when millions of transactions, articles, movements, and signals must be monitored continuously. The constraint is no longer access to information. It is the ability to make sense of change, risk, and opportunity fast enough to matter.

AI is widely seen as the answer to this problem of scale. Large language models have been connected to systems of record, LLMs can summarize a document, and agents have been demonstrated in controlled environments (and outside of enterprise, in uncontrolled environments).

Agents are particularly important in how they can scale workflows across an enterprise. Instead of waiting for a user to ask a question, agents receive standing instructions: watch these entities, portfolios, or regions, and surface what changes. They monitor continuously, pull from multiple sources, and escalate only when thresholds are crossed or patterns emerge. The role of the human shifts from integration and aggregation to judgment, interpretation, and decision.

Despite this activity, AI pilots have rarely become durable operational capabilities, widescale AI adoption across the enterprise remains uneven, and gains from AI have been challenging to measure or attribute. In many organizations, AI projects have remained an experiment rather than an operational capability.

The limiting factor is not model intelligence. It is caused by architectural constraints that prevent systems from operating reliably at enterprise scale.

- Context is fragmented across systems of record. Entities are represented inconsistently, relationships are implicit or buried in documents, and time is captured in incompatible ways. Agents can retrieve individual records or summarize isolated documents, but they cannot reliably reason across sources to understand how real-world events, agreements, exposures, and policies connect. Each workflow reconstructs its own partial view of reality, and those views rarely align.

- Reliability is also insufficient by default. When agent outputs lack explicit grounding, provenance, and an auditable decision path, they cannot be treated as deterministic system calls. In high-stakes environments, teams must be able to answer not only what the system concluded, but how it arrived there and which evidence supports that conclusion. Without this capability, AI outputs remain advisory at best and are excluded from operational workflows.

- Finally, memory does not scale. Many pilots attempt to simulate context by injecting large document bundles into prompts. This approach increases latency and cost linearly with data volume and introduces variability that is difficult to control. As data grows, teams face a tradeoff between affordability and insight that ultimately breaks production deployments.

Because agents are typically connected directly to these fragmented systems, they inherit all three constraints. As a result, leaders cannot rely on agent-driven outputs when those outputs cannot be traced, reproduced, or defended under scrutiny. Teams hesitate to operationalize AI in high-stakes workflows, and manual processes persist where automation was expected to take hold.

If agent workflows are going to scale, organizations need a layer that produces a consistent representation of the world across systems of record. This layer must resolve entities across sources, construct explicit relationships, model events over time, and preserve provenance across structured and unstructured data. This is especially true in regulated and mission-critical environments. In order to defend decisions, teams need to understand how entities relate over time, how conclusions were reached, and which sources support every decision.

The benefit of this approach is that teams can now build agents and applications against a shared foundation. Different departments can operate from the same picture of reality, even when they apply different policies or objectives. This creates significant internal productivity gains because context is reused rather than reconstructed, and governance improves because outputs are derived from a common source of truth.

Elemental was built to close this gap. Here at Lovelace AI, we believe AI should transform your decision-making. We provide our customers with a shared context layer that allows humans and AI agents to operate from the same understanding of the world — who is involved, what is connected, what has changed, and why it matters. This context layer is enabled by Elemental, our context engine that organizes raw data into entities, relationships, events, and evidence over time, ensuring that every conclusion can be traced back to source material and lineage. It is what makes agents viable for high-stakes, real-world work rather than one-off demos or brittle copilots.

In addition to producing shared context, Elemental provides a stable contract for how agents interact with that context. These instructions define how agents retrieve entities and relationships, evaluate changes over time, invoke analytical computations, attach evidence, and package outputs. New filings arrive. New articles appear. New movement patterns emerge. New entities are resolved. Relationships strengthen or weaken as evidence accumulates. The agent does not need to change its behavior to handle this. Engineers — or even analysts — can build agents against this interface once, and those agents can operate continuously.

---

## The Three-Layer Architecture: Datasets, Modules, and Solution Packs

Before describing what agents do, it is worth describing what they operate on and how those capabilities are organized. Lovelace's approach rests on a three-layer architecture that separates data, analysis, and demonstration into distinct, composable layers.

### Layer 1: Datasets and the Two-Pipeline Architecture

The foundation of everything is data — but the way that data is organized and delivered is what makes the system work. Lovelace operates two parallel data pipelines, both powered by the same Elemental context engine, that merge into a single enriched graph for the customer.

#### **Pipeline 1: Lovelace builds the YottaGraph from public data.**

Lovelace continuously ingests and resolves entities across public data sources to produce the YottaGraph — a canonical reference graph of the world's publicly known entities, relationships, events, and evidence. The YottaGraph contains millions of resolved entities drawn from decades of regulatory filings, sanctions designations, news coverage, market data, and movement signals. Lovelace maintains this graph continuously. Customers do not rebuild public knowledge.

The public datasets that power the YottaGraph span several categories:

- **Corporate and Regulatory Data** includes SEC EDGAR filings (10-K annual reports, 8-K material events, proxy statements, Exhibit 21 subsidiary lists, Forms 3/4/5 officer disclosures, S-4 merger registrations), GLEIF legal entity identifiers, OFAC sanctions lists, and state-level business registrations. These sources provide the structural backbone: who exists, who owns what, who runs what, and what legal or regulatory events have occurred.

- **Financial and Market Data** includes extracted financial statements (leverage, coverage, liquidity metrics from 10-K/10-Q filings), stock price feeds, institutional holdings (13F filings), credit facility disclosures, municipal bond data (EMMA/MSRB), corporate bond trading activity (FINRA TRACE), and macroeconomic indicators (FRED). These sources provide the signals needed to assess financial health, market sentiment, and portfolio exposure.

- **News, Sentiment, and Intelligence** includes entity-linked news articles with sentiment scoring, prediction market probabilities, and adverse media monitoring. These sources provide the fastest-moving risk signals — often preceding formal disclosures by days or weeks.

- **Geospatial and Movement Data** includes vessel tracking (AIS via Spire), aircraft tracking (ADS-B), address geocoding, Census-level economic indicators, and device-level geolocation intelligence. These sources ground abstract corporate structures in physical reality — where entities operate, where assets move, and where disruptions emerge.

- **People and Career Data** includes officer and director relationships from SEC filings, board composition from proxy statements, and career trajectory data that links the same person across employers over time. These sources enable executive risk assessment, board interlock analysis, and talent-flight detection.

#### **Pipeline 2: Customers process proprietary data with their own Elemental instance.**

Customers run their own Elemental instance — the same engine, in their environment, against their data. This might be loan portfolios, KYC documents, internal PDFs, case management systems, proprietary research, or financial models. Elemental parses, extracts, resolves entities, and builds a private context graph. Private entities and relationships never leave the customer's perimeter.

#### **The Enrichment: YottaGraph flows into the customer's graph.**

This is the key value proposition. The customer's private graph is enriched with public context from the YottaGraph. When the customer's loan portfolio contains "Acme Corp," Elemental resolves it against the YottaGraph's "Acme Corp (CIK 0001234567)" — and instantly that entity inherits its full corporate tree, officer network, sanctions proximity, solvency history, and news signals. The customer didn't build any of that. Elemental resolved it.

**The result is one enriched graph in the customer's environment:** their proprietary data plus public entity resolution, corporate structures, sanctions chains, market signals, and officer networks. Everything downstream — the API, the analytical modules, the agents, the Solution Packs — runs against this single enriched graph. There are not two separate databases. There is one graph, one API surface, and one shared context.

No dataset is useful in isolation. A sanctions list without corporate ownership data cannot detect indirect exposure. An SEC filing without entity resolution cannot connect a subsidiary default to a parent company's credit portfolio. Elemental resolves entities across all of these sources and maintains those linkages as data changes. The YottaGraph pays the cost of maintaining public context once. The value compounds across every customer, every module, and every Solution Pack that uses it.

### Layer 2: Analytical Modules

Datasets provide raw material. Analytical modules turn that material into structured assessments. Each module answers a single, well-defined question about an entity, a portfolio, or a network. Modules do not make decisions. They produce scored, evidence-backed findings that agents and humans can interpret. We’ve talked about those as primitives.

Over the past year, Lovelace has developed, or at least conceptualized, five core analytical modules. These are counts, ratios, and other measures like co-travel or sentiment that would be reasonable to make accessible through the Yottagrapha. These modules can be thought of as the building blocks — the legos — that can be combined in different configurations to address different customer use cases (aka problems). The same module can appear in multiple contexts, but the thresholds, policies, and interpretive framing change depending on the use case (which are things that users would decide when building agents working with Elemental.

- **Adversarial Capital Screening (ACS)** answers the question: _Are funding sources linked to sanctioned, politically exposed, or high-risk entities?_ This module traverses ownership and affiliation graphs to evaluate proximity to designated entities. It resolves beneficial ownership chains across corporate registries and sanctions lists, computes hop-distance to flagged entities, and scores exposure with evidence and confidence. ACS draws primarily on corporate structure data, sanctions lists, and entity resolution across regulatory sources. We discussed this during our Diligence proposal with Palantir.

- **Executive Risk Scoring (ERS)** answers the question: _Do company leaders have ties to adversarial networks, suspicious legal history, or patterns that indicate governance weakness?_ This module evaluates the people who run an organization — their career trajectories, board interlocks, enforcement history, departure patterns, and network affiliations. It draws on SEC officer and director filings, career history data, news sentiment, and regulatory actions. ERS detects signals like executive migration from distressed companies, cluster departures that precede public trouble, and board-level relationships that create hidden correlation across seemingly unrelated entities. We have this in the DSERP Demo App already.

- **Supply Chain Risk Assessment (SCR)** answers the question: _Are there dependencies on vendors, counterparties, or logistics corridors in sanctioned regions or with opaque ownership structures?_ This module maps dependency networks — which suppliers feed which products, which ports serve which routes, which facilities are critical to which operations — and evaluates the risk embedded in those dependencies. It draws on corporate structure data, geospatial indicators, movement data, news signals, and entity resolution to identify concentration risk, geographic exposure, and ownership opacity in supply chains.

- **Financial Health Scoring (FHS)** answers the question: _Are financials stable, or do they show signs of distress, fraud, or excessive leverage?_ This module computes solvency indicators from financial statement data — leverage ratios, equity erosion, margin compression, coverage adequacy, and trend trajectories over time. It incorporates stock price movements, macro context, and prediction market signals to distinguish idiosyncratic stress from systemic conditions. FHS is the most data-rich module, drawing on extracted SEC financials, market feeds, and macroeconomic indicators. We have this in the DSERP Demo App already as solvency.

- **Cyber Hygiene Scoring (CHS)** answers the question: _Has the entity experienced repeated data breaches, security incidents, or noncompliance with security regulations?_ This module monitors for cybersecurity events — breach disclosures, regulatory actions related to data protection, incident frequency and severity patterns — and scores an entity's cyber risk posture. It draws primarily on news and event data, SEC 8-K disclosures (which now include mandatory cybersecurity incident reporting), and regulatory enforcement actions.

These five modules should be thought about as siloed capabilities. They are designed to be invoked independently or in combination. An agent monitoring a corporate customer for compliance purposes might invoke ACS and ERS together. An agent assessing a refinancing target might invoke FHS, ERS, and SCR. An agent tracking a procurement network for national security might invoke ACS, SCR, and ERS with defense-specific thresholds. The modules do not change. The instructions do.

### Layer 3: Solution Packs

Solution Packs are curated combinations of modules, agent behaviors, and output templates that demonstrate how agents solve a specific class of problems. A Solution Pack is not a product or a codebase. It is a configuration: which modules to run, which entities to watch, which thresholds to apply, and how to format the output. **This is what we need to build to demo. If we demo things well, customers will want to buy them too, because I suspect people’s agent infrastructure isn’t that great.**

The distinction between modules and Solution Packs is important. Modules are what customers license and extend. Solution Packs are how we show them what is possible. The same modules that power a demonstration can be reconfigured by the customer's own teams to address their specific policies and workflows.

Each Solution Pack answers a simple question: _What would an agent do if you asked it to continuously monitor this problem and tell you when something changes?_

---

## Demonstrating How Agents Interact with Elemental

Most customers will build their own agent workflows. They still need to see what "good" looks like. They need to understand how an agent should behave when it is grounded, evidence-backed, and governed. To support adoption, Lovelace has developed Solution Packs that demonstrate how agents behave when grounded in shared context and governed by stable interfaces. These Solution Packs are not applications — they are demonstration environments that show how monitoring, analysis, and output generation work in practice against real use cases. They show how the same analytical modules can be reused across different problems. They show how agent outputs can be surfaced as artifacts or through generative interfaces.

A deliberate design choice underpins how we are thinking about agentic workflows and how our technology enhances enterprise software. **Lovelace is not attempting to build full end-user applications for every customer workflow.** Customers will build their own agents and interfaces. What we are doing with Solution Packs is demonstrate how _agents interact with the machine_ — how they query context, invoke analytical modules, evaluate signals, and surface outputs in usable forms. Artifacts are one surface. Generative interfaces are another. The key is that agents operate against the same underlying modules and context, regardless of how results are consumed.

While we developed Solution Packs to show our customers what is possible with Elemental, we can also work with partners to instrument them with metrics and deploy them inside customer environments.

### Solution Packs in Financial Services

**Know Your Customer (KYC)** combines **ACS** (primary), **ERS**, **SCR**, and a lightweight application of **FHS** to answer: _Should we onboard or retain this customer, and has their risk profile changed?_ Agents monitor beneficial ownership graphs for structural changes, screen new entities against sanctions and PEP lists via ACS, evaluate executive and director networks for adversarial ties via ERS, check vendor and counterparty relationships for opacity via SCR, and flag financial distress signals via FHS that might indicate layering or structuring risk. When any module's output crosses a policy threshold, the monitoring agent triggers analysis and the composition agent assembles a compliance review package with full evidence lineage.

**Enhanced Due Diligence (EDD)** combines **FHS** (primary), **ERS** (primary), **ACS**, **SCR**, and **CHS** to answer: _What is the complete risk picture for this counterparty or investment target?_ This is the most comprehensive Solution Pack. Agents maintain a living risk assessment rather than a point-in-time report. FHS tracks solvency deterioration and financial anomalies. ERS monitors executive changes, governance quality, and career-trajectory risk. ACS screens ownership paths for adversarial capital exposure. SCR evaluates supply-chain dependencies. CHS monitors for cybersecurity posture and incident history. The composition agent assembles these into a diligence memo that a human can review in minutes rather than days.

**Portfolio Risk Monitoring (CLOs and Credit)** combines **FHS** (primary), **SCR**, and a lighter application of **ERS** to answer: _Where is deterioration occurring across our portfolio, and how does exposure correlate?_ Agents track issuer-level solvency signals via FHS and propagate risk through ownership and affiliation graphs. SCR evaluates whether supply-chain disruptions are creating correlated stress across portfolio names. ERS flags executive departures or governance shifts that might precede credit events. The composition agent produces portfolio-level risk briefs — aggregated, compared across holdings, and formatted for investment committees rather than individual issuers.

**Private Wealth Risk and Opportunity** combines **FHS**, **ERS**, and macro/sector context to answer: _What changes in the world create risk or opportunity relative to our clients' positions?_ Agents monitor entities, sectors, and regions tied to client portfolios. FHS detects improving or deteriorating financial health across clusters of companies. ERS identifies executive movement patterns that often precede sector inflection points. Prediction market and macroeconomic signals provide the broader context. The composition agent assembles opportunity briefs or risk alerts depending on the direction of change.

### Solution Packs in Defense and National Security

**Threat Identification** combines **ACS** (primary), **ERS**, **SCR** (primary), **CHS**, and movement analysis to answer: _Is this entity, network, or pattern of behavior connected to an adversarial threat?_ Agents monitor movement data for deviations from historical patterns, co-travel behavior, AIS gaps, or unusual proximity to sensitive locations. When anomalies appear, ACS traces ownership chains from vessel or aircraft identifiers through shell companies to beneficial owners, checking for sanctions proximity. ERS evaluates the people associated with flagged entities. SCR maps procurement networks to identify transshipment patterns and end-user risk. CHS assesses whether cyber indicators correlate with other threat signals. The composition agent produces a watch officer brief with tracks, timelines, entity networks, and evidence.

**Targeting** extends Threat Identification with deeper temporal analysis and pattern-of-life modeling. The same modules are invoked, but over longer time windows and with different confidence thresholds for escalation.

### Solution Packs in Logistics and Transportation

**Supply Chain Disruption Monitoring** combines **SCR** (primary), **FHS**, and geospatial/movement data to answer: _Where is disruption emerging, and which operations will it affect first?_ Agents watch supplier entities, facilities, transport routes, and jurisdictions. SCR evaluates dependency depth, alternative sourcing options, and geographic concentration. FHS assesses whether suppliers are under financial stress that might compound operational disruption. Movement data provides real-time signals about port congestion, route deviation, and asset repositioning. The composition agent assembles ranked impact assessments with evidence and estimated time horizons.

**Network Reliability** applies similar module combinations to evaluate the stability of logistics networks over time, surfacing structural vulnerabilities before they manifest as operational failures.

### The Composability Proof

Across all of these Solution Packs, a pattern emerges. The five analytical modules appear repeatedly, but in different configurations and with different weights:

| Solution Pack      |   ACS   |   ERS   |   SCR   |   FHS   |  CHS   |
| :----------------- | :-----: | :-----: | :-----: | :-----: | :----: |
| **KYC**            | Primary |  High   | Medium  |  Light  |   —    |
| **EDD**            |  High   | Primary | Medium  | Primary | Light  |
| **Portfolio Risk** |    —    |  Light  | Medium  | Primary |   —    |
| **Private Wealth** |    —    |  High   |    —    | Primary |   —    |
| **Threat ID**      | Primary |  High   | Primary |  Light  | Medium |
| **Supply Chain**   |    —    |    —    | Primary | Medium  |   —    |

This is not a coincidence. It is the architecture. The same module that screens ownership paths for sanctions proximity in KYC is the same module that traces vessel ownership through shell companies in Threat Identification. The same module that evaluates executive risk for a diligence memo is the same module that detects talent flight from a portfolio company. The difference is the policy, the thresholds, and the narrative assembled at the end.

This composability is what makes Solution Packs demonstrations rather than products. Customers can see the modules working in a KYC context, understand that the same ACS module would work identically against their correspondent banking book, and build their own configuration. Lovelace does not need to ship a KYC product. It ships the modules and shows how they compose.

---

## The Data That Powers the Modules

Each analytical module draws on specific datasets. Understanding this mapping clarifies both what powers the system today and where expansion creates the most leverage.

**Adversarial Capital Screening (ACS)** requires:

- Corporate structure data (ownership graphs, subsidiary hierarchies, beneficial ownership chains)
- Sanctions lists (OFAC SDN, EU sanctions, UN designations)
- Entity resolution across corporate registries, SEC filings, and regulatory databases
- Securities data (for tracing capital flows through instrument chains)

**Executive Risk Scoring (ERS)** requires:

- Officer and director relationships (SEC Forms 3/4/5, DEF 14A proxy statements)
- Career history data (linking the same person across employers over time)
- News and sentiment data (adverse media, enforcement actions)
- Board composition and interlock analysis

**Supply Chain Risk Assessment (SCR)** requires:

- Corporate structure data (vendor ownership, counterparty relationships)
- Geospatial data (facility locations, port activity, transit corridors)
- Movement data (vessel AIS, aircraft ADS-B for logistics monitoring)
- News signals (labor unrest, regulatory changes, weather events)
- State-level business registrations (for SMB vendor identification)

**Financial Health Scoring (FHS)** requires:

- Extracted financial statements (10-K/10-Q: leverage, equity, margins, coverage)
- Stock market data (price movements, technical indicators, anomaly detection)
- Macroeconomic indicators (GDP, CPI, interest rates, sector-specific trends)
- Prediction market data (market-implied probabilities for material events)
- Municipal and corporate bond data (for credit portfolio analysis)
- FINRA TRACE (for bond trading activity and liquidity signals)

**Cyber Hygiene Scoring (CHS)** requires:

- News and event data (breach disclosures, security incidents)
- SEC 8-K filings (mandatory cybersecurity incident disclosures)
- Regulatory enforcement actions (data protection violations, compliance orders)

Several datasets appear across multiple modules. Corporate structure data feeds ACS, ERS, and SCR. News and sentiment feed ERS, SCR, and CHS. Entity resolution underpins everything. This overlap is intentional: Elemental resolves entities once, maintains relationships over time, and makes that context available to any module that needs it. The cost of maintaining shared context is paid once. The value compounds across every module and every Solution Pack that uses it.

---

## Dataset Investment Priority

Not all datasets deliver equal leverage. The priority is determined by how many analytical modules a dataset enables, how many Solution Packs benefit, and how many demonstration tranches it powers. Datasets that appear across multiple modules compound their value — invest in them first.

### Tier 1: Foundation (Built or Mostly Built)

These datasets are already in the YottaGraph and form the base layer every Solution Pack requires.

| Dataset                                                                 | Modules It Feeds | Status                                                                                   |
| :---------------------------------------------------------------------- | :--------------- | :--------------------------------------------------------------------------------------- |
| **Corporate Structure** (EDGAR Exhibit 21, DEF 14A, Forms 3/4/5, GLEIF) | ACS, ERS, SCR    | Built — 683K subsidiary records, 820K officer relationships, 411K director relationships |
| **Mergers & Acquisitions** (S-4, DEFM14A, 8-K succession tracking)      | ACS, ERS, FHS    | Built — deal value extraction, entity succession, predecessor merging                    |
| **News & Sentiment** (entity-linked articles, sentiment scoring)        | ERS, SCR, CHS    | Built — cached articles, mention counts, sentiment trends, velocity detection            |
| **Stock Market Data** (Alpha Vantage, yfinance)                         | FHS              | Built — price feeds, technical indicators, anomaly detection                             |
| **Prediction Markets** (Polymarket, \~2K events)                        | FHS              | Built — market-implied probabilities linked to entity profiles                           |
| **Macroeconomic Indicators** (FRED)                                     | FHS              | Built — GDP, CPI, interest rates, sector-specific trends                                 |

These six datasets compose into the core of EDD, Portfolio Risk, and Private Wealth Solution Packs today. The corporate lineage work (BNY, HSBC analysis) proves the pipeline works end-to-end.

### Tier 2: Highest-Leverage Additions

These datasets unlock new Solution Packs or dramatically strengthen existing ones. Each is either partially in place or identified with a clear acquisition path.

**1\. Sanctions (OFAC SDN) — Unlocks KYC and Threat ID**

This is the single biggest gap. Without sanctions data in the entity graph, ACS cannot function — and ACS is the primary module for both KYC and Threat Identification, which are the two Solution Packs most likely to resonate with HSBC and defense clients. OFAC SDN data is free, structured (XML/CSV), and maps directly to existing entity resolution. It also directly powers Tranche C (enforcement cascade) and Tranche H (shadow networks).

_Priority: Highest. Free data. Clear pipeline path. Enables two Solution Packs._

**2\. Securities Chain (OpenFIGI \+ EMMA/MSRB) — Completes Portfolio Risk**

The CUSIP-to-issuer-to-tranche chain is currently incomplete. Completing it with OpenFIGI resolution (free API) and EMMA municipal bond data (free) connects corporate entities to capital markets instruments. This is essential for Portfolio Risk (CLO/CMBS monitoring) and powers Tranche A (PA municipal bonds for PNC) and Tranche F (BofA CMBS securitization).

_Priority: High. Free data. Connects corporate graph to capital markets._

**3\. Career History Enrichment — Deepens ERS**

We already have 820K officer relationships from Forms 3/4/5 and 411K director relationships from DEF 14A, but these are point-in-time snapshots. The investment is in linking the same person across filings over time to build career trajectories. This transforms ERS from "who runs this company now" to "where has this person been, and what happened at those companies." The data is already ingested — the gap is the temporal linkage pipeline.

_Priority: High. No new data acquisition needed. Pipeline enhancement on existing data._

**4\. FINRA Data (TRACE \+ BrokerCheck) — Enriches FHS and ERS**

FINRA TRACE closes the loop on fixed-income trading activity — showing which bonds are actually trading, at what prices, and with what frequency. BrokerCheck adds broker-dealer employment history and disciplinary records, enriching both FHS (bond market signals) and ERS (people data beyond SEC filings). Combined with existing CUSIP/issuer mapping, this enables bond market surveillance tied to corporate entities.

_Priority: High. Moderate acquisition cost. Two-module enrichment._

### Tier 3: Differentiation (New Capabilities)

These datasets open entirely new Solution Pack categories, particularly defense/logistics and geographic risk.

| Dataset                                                        | What It Unlocks                                                                                                                                                            | Investment Level                   |
| :------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------- |
| **Private Companies** (state registries)                       | KYC for SMB borrowers — entities that never appear in SEC filings but carry $1M+ loans. Critical for PNC and BofA commercial lending books.                                | Medium-High (50 states, some paid) |
| **Spire / Geo Integration** (AIS/ADS-B)                        | Threat ID vessel and aircraft surveillance. The Elemental Geo API already supports MMSI/IMO lookups. The gap is connecting tracking data to the corporate ownership graph. | High for defense demos             |
| **Places / Geocoding** (Census Geocoder, OSM)                  | KYC shell company detection (mass-registration addresses), SCR geographic risk. Partially covered by GLEIF HQ addresses.                                                   | Medium                             |
| **Geospatial Economic Indicators** (FRED, Census ACS, FBI UCR) | Private Wealth geographic risk overlay, SCR regional disruption signals. Block-level economic and crime data.                                                              | Medium                             |
| **Vehicle-Company Linkage** (FAA registry, ship registries)    | Threat ID asset tracking, KYC asset concealment detection. Currently only sanctions-sourced vessel entities exist.                                                         | Medium for defense                 |
| **Anomaly 6** (device geolocation)                             | Threat ID pattern-of-life validation. Niche capability, high impact for specific defense use cases.                                                                        | Low (specialized)                  |

### How Dataset Priority Maps to Demonstration Tranches

The dataset investments directly enable the client-facing demonstrations:

| Dataset Investment            | Tranches It Powers                                                                  | Clients It Reaches            |
| :---------------------------- | :---------------------------------------------------------------------------------- | :---------------------------- |
| Sanctions (OFAC)              | **C** (TD Bank enforcement), **H** (Shadow Networks)                                | HSBC, BofA, RBC, PNC, Defense |
| Securities (OpenFIGI \+ EMMA) | **A** (PA Muni Bond), **F** (BofA CMBS)                                             | PNC, BofA, RBC, Macquarie     |
| Career History                | **B** (M\&A timeline — exec changes), **E** (HSBC corporate web — board interlocks) | RBC, BofA, HSBC               |
| FINRA                         | **F** (Structured credit — bond trading activity)                                   | BofA, RBC                     |
| Spire / Geo                   | **H** (Shadow fleet — vessel tracking \+ ownership)                                 | Defense, HSBC                 |
| Private Companies             | Opens new tranche potential (SMB lending demos for PNC, BofA)                       | PNC, BofA                     |

The highest-leverage investment is clear: **Sanctions data enables the most tranches (C \+ H), reaches the most clients (all five plus defense), and unlocks two Solution Packs (KYC \+ Threat ID).** It should be first.

---

## The Types of Agents in Our Solution Packs

The agents that we build and demonstrate fall into a small number of recurring types. These agent types appear across financial services, defense, and logistics because the underlying work is the same: monitoring change, reconciling signals, and deciding when something is worth human attention.

The first category is **monitoring agents**. These agents are given standing instructions rather than ad hoc prompts. They are told which entities, portfolios, regions, or networks matter, and what kinds of change should trigger attention. A monitoring agent does not generate conclusions. It watches. It repeatedly queries the context layer, evaluates signals produced by analytical modules, and determines whether thresholds or patterns have been crossed. In financial services, this is the agent that continuously scans issuers, executives, and ownership structures for deterioration, new exposure, or anomalous behavior. In defense, it is the agent watching vessels, facilities, or regions for deviations from expected patterns. In logistics, it is the agent tracking suppliers, routes, and hubs for early signs of disruption. The monitoring agent is configured per Solution Pack: a KYC monitoring agent watches for changes that implicate ACS and ERS thresholds; a Portfolio Risk monitoring agent watches for changes that implicate FHS thresholds. The watching behavior is identical. The thresholds differ.

The second category is **analytic agents**. These agents are responsible for invoking analytical modules and assembling their outputs into structured assessments. They do not invent logic. They select which modules to run, with which parameters, over which time windows. When a monitoring agent detects a material change, the analytic agent determines which combination of ACS, ERS, SCR, FHS, and CHS is appropriate for the context. An EDD analytic agent might run all five modules against a counterparty. A Portfolio Risk analytic agent might run FHS and SCR across a portfolio with aggregation. A Threat ID analytic agent might run ACS and SCR with defense-specific entity resolution against a vessel cluster. Every result is tied to evidence and confidence. Nothing is summarized yet. These agents overlap heavily across Solution Packs because the same analytical work supports multiple outcomes. The difference lies in which modules are selected, which thresholds are applied, and how the results are interpreted downstream.

The third category is **composition agents**. These agents are responsible for turning analysis into something a human can consume. They assemble module outputs into narratives — timelines, maps, tables, cards, evidence panels, briefing documents, and exportable artifacts. They never alter the underlying analysis. They decide how to present it, how much context to include, and which format to produce. In financial services, this is the agent that produces a diligence memo, a compliance review package, a portfolio risk brief, or a leave-behind for an investment committee. In defense, it is the agent that produces a watch officer brief or a targeting package. The composition agent is also where branding, redaction, classification, and shareability are applied. The same analytical outputs can be composed into a regulatory-defensible compliance package or a concise executive summary, depending on the audience.

Finally, there are **control agents**, which govern execution rather than analysis. These agents handle scheduling, backfill, replay, version pinning, and failure recovery. They ensure that when data arrives late, past windows are reprocessed. They ensure that a report can be regenerated identically weeks later. They manage the priority queue — deciding which entities need scanning next based on staleness, event velocity, portfolio exposure, and score trajectory. These agents are rarely visible in demonstrations, but they are essential to making the system credible in production.

Many of our agents can be reused across Solution Packs. A monitoring agent watching an issuer in a CLO portfolio behaves almost identically to a monitoring agent watching a vessel near an exercise area. The analytic agents it invokes differ only in which modules are selected and which policies are applied. This reuse is intentional. It demonstrates that Lovelace is not delivering isolated solutions, but a consistent way of operationalizing agent behavior against shared context and composable analytical modules.

---

## Solution Pack Walkthroughs

Solution Packs exist to make the architecture concrete for customers. They show how a small number of agent types, operating over shared context, invoke composable analytical modules to solve real problems. The following walkthroughs illustrate the agent behavior in detail.

### FSI Enhanced Due Diligence Solution Pack

A monitoring agent is configured to watch a set of target companies. Its job is not to decide whether a company is good or bad. Its job is to detect when the company's risk profile meaningfully changes. It watches for new executives, ownership shifts, litigation events, adverse media, and changes in solvency indicators. When something crosses a defined threshold, the monitoring agent triggers an analytic agent.

The analytic agent runs the EDD module combination: FHS, ERS, ACS, SCR, and CHS. It resolves new entities introduced by recent events. It invokes FHS to compare current solvency indicators against trailing baselines. It invokes ERS to evaluate the career history and network affiliations of any new executives. It invokes ACS to recompute ownership and affiliation graphs two hops out and evaluate exposure to sanctioned or high-risk entities. It invokes SCR to assess whether supply-chain dependencies have shifted. It invokes CHS to check for recent cybersecurity incidents. Every result is tied to evidence and confidence. Nothing is summarized yet.

Once the analysis is complete, a composition agent takes over. It assembles the module outputs into a briefing page. At the top is a short description of what changed and why it matters. Below that is a timeline of relevant events, a table of exposures with hop-by-hop ownership paths and confidence scores, and an evidence panel that links directly to the filings and articles used to construct the assessment. The human does not need to ask follow-up questions to understand why the agent raised the issue. The evidence is already there.

### Portfolio Risk Monitoring Solution Pack (CLOs and Credit)

The agents involved are almost identical to EDD. The monitoring agent watches a portfolio rather than a single company. It tracks aggregate exposure, correlation risk, and early signs of deterioration across issuers. When portfolio-level risk shifts, it triggers analytic agents that invoke FHS and SCR — the same modules, but aggregated and compared across holdings. ERS runs in a lighter mode, flagging only executive departures or governance events that historically precede credit deterioration. The composition agent produces a different narrative, focused on portfolio health, sector concentration, and early warning signals rather than individual issuer diligence. The underlying machinery is unchanged.

### Know Your Customer Solution Pack

A compliance team instructs the system to monitor a corporate customer continuously. The monitoring agent watches the customer's representation in shared context: beneficial owners, directors, parent entities, associated facilities, sanctions lists, regulatory actions, adverse media, and jurisdictional exposure.

When the beneficial ownership graph changes — a new shareholder, a restructured holding company, a cross-border acquisition — the monitoring agent triggers analysis. The analytic agent invokes ACS to recompute ownership paths and evaluate sanctions proximity. It invokes ERS to check whether newly linked individuals have enforcement history or adversarial network ties. It invokes SCR to assess whether the customer's vendor relationships introduce geographic or structural risk. FHS runs in a supporting role, checking whether financial distress signals suggest layering or structuring risk.

The composition agent assembles a compliance review package suitable for both internal review and regulatory examination. The compliance officer does not initiate an investigation because an alert is fired. They initiate it because the context changed in a way the bank has defined as meaningful.

### Threat Identification Solution Pack

Before a joint exercise begins, an intelligence team instructs the system to watch vessel activity in a defined region. The monitoring agent observes movement data as it arrives — traffic density, co-travel patterns, port visits, signal gaps. Most vessels behave normally and never surface.

Three days in, the monitoring agent detects a cluster of vessels exhibiting repeated co-movement patterns that deviate from historical baselines. The analytic agent invokes ACS to link vessel identifiers to management companies, trace ownership through shell entities, and evaluate whether beneficial owners appear on sanctions or watch lists. It invokes SCR to map the procurement and logistics networks associated with the flagged entities — are these vessels part of a known transshipment pattern? It invokes ERS to evaluate the individuals associated with the management companies. Each computation produces structured outputs with full lineage.

The composition agent assembles a watch officer brief: a map of vessel tracks, a timeline of relevant movements, a table of linked entities with ownership chains, and an explanation of why this cluster differs from routine traffic. Evidence panels allow the analyst to drill into individual AIS records, ownership registries, and historical comparisons.

The watch officer reviews the brief and elevates it. No one asks how the system knows this. The evidence is embedded.

### Private Wealth Opportunity Monitoring

A private wealth advisor instructs the system to watch for changes that could create risk or opportunity relative to clients' positions. The monitoring agent tracks entities, sectors, executives, and regions tied to client portfolios.

Over several weeks, the agent observes a pattern: a cluster of mid-cap firms in an adjacent sector shows repeated executive movement (detected by ERS), increased acquisition activity, and improving solvency indicators (detected by FHS). Individually, none of these signals are decisive. Together, they represent a shift.

The analytic agent evaluates the cluster against current client exposures. FHS computes overlap, correlation, and diversification impact. ERS examines executive histories and prior performance through the context graph. Macroeconomic and prediction market signals provide the backdrop.

The composition agent assembles an opportunity brief explaining why this cluster surfaced, how it relates to existing holdings, and what distinguishes it from background activity. It does not recommend a transaction. It provides evidence-backed context for a human decision.

### Supply Chain Disruption Monitoring

A manufacturer instructs the system to monitor its supply chain continuously. The monitoring agent tracks supplier entities, facilities, transport routes, and jurisdictions.

One morning, it detects a combination of signals: a supplier facility appears in multiple news reports related to labor unrest, and movement data shows irregular congestion near a key port used by that supplier. Neither signal alone crosses a threshold. Together, they do.

The analytic agent invokes SCR to resolve the facility and its parent entities, evaluate dependency depth, identify alternative suppliers, and propagate disruption risk through the supply network. FHS runs against the supplier to assess whether financial distress might compound operational disruption. The output is a ranked impact assessment identifying which products and regions would be affected first, with estimated time horizons and evidence.

The operations team initiates contingency planning before production is affected. The system continues monitoring. If the issue resolves, nothing further happens. If it escalates, the agents surface the progression.

---

## Vignettes

The same agent pattern holds across financial services, national security, logistics, and many other analytical workflows. Monitoring agents watch continuously. Analytic agents invoke the appropriate combination of ACS, ERS, SCR, FHS, and CHS when change occurs. Composition agents surface outputs that humans can trust and act on. The difference between domains is not the architecture. It is the policy, the thresholds, the module weights, and the narrative assembled at the end.

The following vignettes show what this looks like in practice — not as architecture diagrams, but as lived experience.

---

### **Vignette 1: A Day in the Life of an Organization Running on Lovelace**

At 6:00 a.m., nothing happens.

That is the point.

Overnight, your enterprise agents have been running continuously. They are not waiting for prompts. They are not generating reports. They are watching the organization's operating environment as it exists in shared context: companies, people, assets, facilities, movements, and events, all evolving over time.

A credit portfolio monitoring agent reviews issuer exposure as new filings and news arrive, running FHS against the portfolio. A compliance monitoring agent tracks ownership and sanctions proximity across active customers, running ACS and ERS. A supply chain monitoring agent watches key suppliers, ports, and transit corridors, running SCR. A defense-facing monitoring agent tracks vessel activity near a region of interest, running ACS against vessel ownership chains. These agents are not independent systems. They are different instructions operating over the same underlying context, invoking overlapping combinations of the same analytical modules.

Most of what they see is noise. They surface nothing.

At 8:17 a.m., a change occurs.

A minority ownership transaction posts for a corporate customer. The transaction is legal and properly disclosed. On its own, it is unremarkable. The compliance monitoring agent notices because it alters the beneficial ownership graph. That change introduces a new indirect relationship that was not present before.

The compliance agent flags the change as material and triggers analysis.

An analytic agent invokes ACS to recompute ownership paths and evaluate proximity to sanctioned entities. It invokes ERS to check regulatory history tied to the newly linked individuals. The result is not an alert. It is a structured update: the customer's risk profile has changed in a way that exceeds the bank's internal policy threshold.

At the same time, that ownership change propagates elsewhere.

The portfolio monitoring agent, operating over the same context, observes that the customer is also an issuer in a credit portfolio. It pulls the updated ownership graph into its next FHS evaluation cycle. The exposure does not yet affect portfolio risk materially, so nothing is surfaced. The system notes the change and keeps watching.

At 9:40 a.m., another change occurs.

Movement data shows unusual congestion near a port used by one of the organization's key suppliers. The supply chain monitoring agent has seen congestion before and does nothing. This time, however, the congestion coincides with multiple reports of labor unrest at a nearby facility. The signals reinforce each other.

The supply chain agent triggers analysis.

An analytic agent invokes SCR to resolve the facility, link it to supplier entities, evaluate dependency depth, and propagate disruption risk through the supply network. FHS runs against the supplier to check whether financial distress might compound the operational risk. The analysis identifies which products and regions would be affected first if the disruption persists.

The analysis produces no recommendation. It produces a ranked impact assessment with evidence.

At 10:15 a.m., a composition agent assembles two briefs.

The first is a compliance review package. It explains how the customer's ownership structure changed, why the new configuration matters, and where the evidence comes from. It is formatted for internal review and regulatory defensibility.

The second is an operations brief. It shows the supplier facility, the port congestion, the dependency paths, and the likely time horizon for disruption. It is formatted for operations leadership, not compliance.

Both briefs are generated from the same context, using overlapping modules with different output templates. Neither required a human to ask a question.

At 11:30 a.m., a watch officer opens the system.

Overnight, the defense monitoring agent detected a small cluster of vessels exhibiting repeated co-movement near an exercise area. The pattern did not cross a threshold until this morning, when one of the vessels exhibited a prolonged signal gap.

The defense monitoring agent triggered analysis.

An analytic agent invoked ACS to link the vessels to ownership entities through management company shell structures. It invoked SCR to check for procurement network patterns. It evaluated historical behavior across prior exercises and propagated risk across the co-travel network. The composition agent assembled a watch brief with tracks, timelines, ownership chains, and evidence.

The watch officer reviews the brief. They elevate it for further attention. No one asks how the system knows this. The evidence is embedded.

At noon, four different teams inside the organization have received four different outputs.

Compliance has a customer risk update (ACS \+ ERS). Credit has an updated issuer context (FHS). Operations has an early warning on potential supply disruption (SCR \+ FHS). Security has a watch brief (ACS \+ SCR \+ ERS).

None of these teams are using different systems. None of them triggered bespoke workflows. The same agents, running with different instructions, invoked overlapping combinations of the same five analytical modules to surface different consequences of change in the same underlying reality.

At 3:00 p.m., nothing happens.

The supplier labor issue resolves. Movement congestion eases. The monitoring agent observes the change and de-escalates the risk. No one is notified. The context updates quietly.

At 5:45 p.m., an investment committee meets.

They review a diligence packet that was generated earlier in the week when an executive appointment introduced new exposure into a refinancing target. The packet was produced by the EDD module combination — FHS, ERS, ACS, SCR — and is evidence-backed, current, and consistent with what compliance and portfolio monitoring already see. There are no contradictions to reconcile because there is only one context, and the same modules powered every assessment.

By the end of the day, dozens of module invocations have run. Thousands of entities have been updated. Millions of data points have been processed.

Most humans saw nothing.

The ones who did saw exactly what they needed, when they needed it, with the evidence to make a decision and take action.

---

### **Vignette 2: Enhanced Due Diligence inside a Credit Investment Firm**

On Monday morning, a credit analyst adds a mid-market industrial firm to a watchlist. The instruction is simple: keep an eye on this company while the investment committee prepares for a refinancing decision. No one asks a question. No report is requested. The system is told to watch.

From that point on, a monitoring agent runs continuously. It checks the company's representation in the shared context layer. It watches for changes to executives, ownership, affiliated entities, facilities, and jurisdictions. It monitors incoming news, corporate filings, and registry updates. Most of the time, nothing happens, and nothing is surfaced.

On Wednesday afternoon, a new executive appointment appears in the news. The monitoring agent does not treat this as inherently risky. It resolves the individual as a new entity, links them to the company, and evaluates whether this change intersects with any existing risk policies. The agent notices that this executive has prior affiliations that introduce a new ownership path into the company's network. That path did not exist before.

The monitoring agent triggers an analytic agent.

The analytic agent runs the EDD combination. ERS evaluates the executive's career trajectory — where they have worked, what happened at those companies, whether they have enforcement history or adversarial network ties. ACS recomputes the ownership and affiliation graph two hops out from the company and evaluates exposure to sanctioned or politically exposed entities introduced by the new executive's prior affiliations. FHS compares current solvency indicators to the trailing baseline. SCR checks whether the executive's prior companies had supply-chain risk patterns that might indicate operational management style. Every result is tied to evidence and confidence.

The results show that the new executive introduces a previously unseen indirect exposure to a foreign industrial conglomerate. The exposure is legal, but it crosses the firm's internal diligence threshold for committee review. The analytic agent marks this as material change.

A composition agent takes over.

The composition agent assembles a briefing page. At the top is a short description of what changed and why it matters. Below that is a timeline showing the executive appointment and the historical affiliations that triggered the exposure. A table shows the ownership path, hop by hop, with confidence scores. An evidence panel links directly to the filings and articles used to construct the graph. Nothing is hidden. Nothing is inferred without sourcing.

By Thursday morning, the analyst opens the briefing. They did not ask the system to investigate the executive. They did not pull filings or reconcile sources. The work was done because the context changed. The analyst spends their time deciding whether the exposure is acceptable, not proving that it exists.

When the investment committee meets on Friday, the analyst exports the briefing as a PDF. The committee does not ask, "How do we know this?" because the evidence is embedded. The decision is faster, and it is defensible.

No custom UI was built. No bespoke logic was written. The same modules will continue running after the deal closes. The same agents will continue watching.

---

## Demonstrating with Public Document Tranches

Architecture and vignettes describe how the system should work. Demonstrations prove it does. Lovelace has identified eight curated collections of publicly available documents — called tranches — that demonstrate the full stack: Elemental ingestion, entity resolution across sources, analytical module invocation, and Solution Pack output generation. Every document is freely downloadable from government sources. No proprietary data is required.

The key design principle: target clients should **see themselves in the graph**. When a bank's name resolves as an entity naturally connected to real parties and real deals, the reaction shifts from "interesting technology" to "we need this."

### How Tranches Map to Solution Packs and Modules

Each tranche is designed to exercise specific Solution Packs and demonstrate specific module behaviors:

| Tranche | Name                                             | Primary Solution Pack      | Primary Modules | Target Clients                                                  |
| :------ | :----------------------------------------------- | :------------------------- | :-------------- | :-------------------------------------------------------------- |
| **A**   | PA Municipal Bond ($1.63B GO Bonds)              | Portfolio Risk             | FHS, SCR        | PNC (home market, trustee), BofA (underwriter)                  |
| **B**   | Capital One / Discover Merger ($35.3B)           | EDD, M\&A Monitoring       | FHS, ERS, ACS   | RBC (M\&A advisory), BofA (deal monitoring), PNC (lending book) |
| **C**   | TD Bank BSA/AML Enforcement ($3B+)               | KYC, Compliance            | ACS, ERS        | BofA (own consent order), HSBC (2012 DPA), RBC, PNC             |
| **D**   | Indiana Toll Road (Macquarie → Bankruptcy → IFM) | Portfolio Risk, EDD        | FHS, SCR        | Macquarie (their deal), PNC (infra lending), RBC (advisory)     |
| **E**   | HSBC USA Corporate Structure                     | KYC, Beneficial Ownership  | ACS, ERS        | HSBC (their structure), RBC (cross-link to Tranche G)           |
| **F**   | BofA CMBS Securitization (BANK 2021-BNK36)       | Portfolio Risk (CLOs/CMBS) | FHS, SCR        | BofA (their deal), RBC (CMBS business), Macquarie               |
| **G**   | RBC Acquisition of HSBC Canada                   | EDD, Cross-Border          | ERS, ACS, FHS   | RBC (their deal), HSBC (divestiture side)                       |
| **H**   | Russian Sanctions Evasion / Shadow Fleet         | Threat ID, KYC             | ACS, SCR, ERS   | HSBC (sanctions), BofA (correspondent banking), Defense         |

### The Reuse Proof Across Tranches

The same modules appear in different tranches with different framing:

- **ACS** in Tranche C traces ownership paths to find BSA/AML compliance gaps. **ACS** in Tranche H traces the same ownership paths to find sanctions evasion networks. Same module. Different policy.

- **FHS** in Tranche A monitors municipal bond performance deterioration. **FHS** in Tranche D detects the same deterioration pattern in infrastructure project finance. Same module. Different instruments.

- **ERS** in Tranche B evaluates executive changes during an M\&A lifecycle. **ERS** in Tranche E maps board interlocks across a complex corporate structure. Same module. Different analytical question.

This is the composability thesis made visible. A customer watching Tranche C (compliance) can see that the same ACS module would work identically against Tranche H (threat identification) — and understand that they could configure their own agents to run ACS against their correspondent banking book with their own thresholds.

### Cross-Tranche Entity Resolution

The most powerful demonstration moments occur when entities resolve across tranches:

- **HSBC Bank Canada** appears in Tranche E as a subsidiary in HSBC's Exhibit 21, and again in Tranche G as RBC's acquisition target. The pipeline resolves these as the same entity, showing its journey from one corporate graph to another.

- **OFAC/DOJ document patterns** appear in both Tranche C (TD Bank enforcement — four agencies, same entity named differently) and Tranche H (Kostin network — DOJ, OFAC, BIS, FBI all naming the same shell companies with different conventions). The cross-source entity resolution challenge is identical. The domain is different.

- **Shared party roles** appear across Tranche A and Tranche F — the same trustees, servicers, and rating agencies serve as parties in both municipal bonds and CMBS securitizations, creating natural graph connections.

These cross-tranche moments prove that Elemental does not just process documents in isolation. It builds a shared context where entities discovered in one collection enrich understanding of entities in another. That is what makes the YottaGraph enrichment architecture work at scale.

### Client-Specific Demo Sequencing

Each target client sees a curated sequence of tranches that tells a coherent story:

**Bank of America**: Tranche F (their CMBS deal — "that's our product") → Tranche C (TD Bank enforcement — "we just got our own consent order") → Tranche H (sanctions networks — "the same compliance patterns extend to national security"). _Narrative: "Your structured credit desk, your compliance team, and your correspondent banking business all run on the same modules."_

**RBC**: Tranche G (their HSBC Canada acquisition — "that's our deal") → Tranche B (Capital One/Discover M\&A — "this is what continuous deal monitoring looks like") → Tranche H (sanctions network — "cross-border transaction monitoring meets threat detection"). _Narrative: "Your own recent acquisition demonstrates cross-border entity monitoring. The same agents detect procurement networks in your correspondent relationships."_

**Macquarie**: Tranche D (Indiana Toll Road — "your deal, your story") → Tranche F (structured credit monitoring) → Tranche A (municipal bond, infrastructure-adjacent). _Narrative: "Your infrastructure portfolio generates exactly the kind of documents agents should monitor continuously. The Indiana Toll Road shows what early detection looks like."_

**PNC**: Tranche A (PA municipal bond — "your home state, your trustee role") → Tranche C (TD Bank compliance — "this changes your BSA program") → Tranche H (sanctions network — "export control risks touch your commercial lending clients"). _Narrative: "When a client's supplier turns up on a BIS entity list, you want to know before your next quarterly review."_

**HSBC**: Tranche E (their corporate structure — "flattering, not threatening") → Tranche G (RBC/HSBC Canada — "entities moving between corporate graphs") → Tranche H (sanctions network — "the gap that cost $1.9 billion in 2012"). _Narrative: "The same graph that maps your subsidiaries also detects when shell companies resolve to sanctioned entities through concealed ownership paths."_

**Defense / National Security**: Tranche H (sanctions evasion — "lead with the threat") → Tranche D (infrastructure lifecycle — "same pattern monitors critical infrastructure") → Tranche C (enforcement cascade — "interagency entity resolution"). _Narrative: "Different policy. Same engine."_

---

### Why This Matters

By grounding agents in shared context, constraining them to five reusable analytical modules, packaging demonstrations as Solution Packs, and proving the architecture with public document tranches where target clients see themselves in the graph, customers can see exactly how agents would behave in their environment, what evidence underpins conclusions, and how outputs could integrate into existing workflows. They can also see which modules they would combine differently for their own use cases.

The path from demonstration to deployment is concrete. The same Elemental engine that processes public documents in the tranche demos processes the customer's proprietary data in their environment. The same YottaGraph that enriches the demo graph enriches the customer's graph. The same five modules that run in a compliance demonstration can be reconfigured by an investment team, a logistics operation, or a defense analyst — with different data feeds, different thresholds, and different output templates, but the same underlying analytical capabilities.

Lovelace is not trying to replace analysts or decision-makers. We are building the context engine and the analytical modules that allow agents and humans to share the same reality — and to act on it before it is too late.
