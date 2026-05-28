export type RiskTier = 'critical' | 'high' | 'medium' | 'low';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';

export type EventSeverity = 'critical' | 'major' | 'minor' | 'trivial';

export const EVENT_SEVERITY_WEIGHTS: Record<EventSeverity, number> = {
    critical: 28,
    major: 18,
    minor: 10,
    trivial: 4,
};
export type ConfidenceLevel = 'High' | 'Medium' | 'Low';
export type SignalAgreement = 'agreement' | 'conflict' | 'partial' | 'sec_only' | 'limited';

export interface SourceFusionWeights {
    solvency: number;
    executive: number;
    news: number;
    market: number;
    eventPressure?: number;
    compliance?: number;
}

export interface FhsThresholds {
    leverageHighThreshold: number;
    equityLowThreshold: number;
    currentRatioLowThreshold: number;
    interestCoverageLowThreshold: number;
    stockDeclineThreshold: number;
    stockVolatilityThreshold: number;
    tierWeights: { t1: number; t2: number; t3: number; t4: number; t5: number };
}

export interface ErsThresholds {
    minOfficers: number;
    minCSuite: number;
    departures12mHigh: number;
    cSuiteCoverageLow: number;
    leadershipSentimentLow: number;
}

export interface AcsThresholds {
    directWeight: number;
    pathWeight: number;
    governanceWeight: number;
    jurisdictionWeight: number;
    fociWeight: number;
    ofacExactOverride: number;
    hopDecay: number;
}

export interface TierBands {
    critical: number;
    high: number;
    medium: number;
}

export interface CategoryBands {
    high: number;
    medium: number;
}

export interface EventPressureTypeWeights {
    bankruptcy: EventSeverity;
    delisting: EventSeverity;
    default: EventSeverity;
    auditor: EventSeverity;
    restructuring: EventSeverity;
    officer: EventSeverity;
    director: EventSeverity;
    impairment: EventSeverity;
}

export interface EventPressureRecency {
    daysFresh: number;
    multFresh: number;
    daysRecent: number;
    multRecent: number;
    daysModerate: number;
    multModerate: number;
    multStale: number;
    multNoDate: number;
}

export interface EventPressureCluster {
    windowDays: number;
    countHigh: number;
    bonusHigh: number;
    countMedium: number;
    bonusMedium: number;
}

export interface EventPressureSettings {
    baseOffset: number;
    defaultWeight: number;
    typeWeights: EventPressureTypeWeights;
    recency: EventPressureRecency;
    cluster: EventPressureCluster;
}

export interface DistressEventEntry {
    baseScore: number;
    weight: number;
}

export interface DistressEventConfig {
    bankruptcy: DistressEventEntry;
    delisting: DistressEventEntry;
    nonReliance: DistressEventEntry;
    triggering: DistressEventEntry;
    impairment: DistressEventEntry;
    termination: DistressEventEntry;
    recencyWindowDays: number;
}

export interface ErsSignal8Settings {
    baseScore: number;
    cSuitePremium: number;
    cap: number;
}

export interface ScoringSettings {
    weights: SourceFusionWeights;
    tiers: TierBands;
    categoryBands: CategoryBands;
    fhs: FhsThresholds & { distressEvents: DistressEventConfig };
    ers: ErsThresholds & { signal8: ErsSignal8Settings };
    acs: AcsThresholds;
    events: EventPressureSettings;
}

export const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
    weights: {
        solvency: 0.35,
        executive: 0.25,
        news: 0.15,
        market: 0,
        eventPressure: 0.25,
    },
    tiers: { critical: 80, high: 65, medium: 50 },
    categoryBands: { high: 70, medium: 40 },
    fhs: {
        leverageHighThreshold: 3.0,
        equityLowThreshold: 0.2,
        currentRatioLowThreshold: 1.0,
        interestCoverageLowThreshold: 2.0,
        stockDeclineThreshold: -10,
        stockVolatilityThreshold: 5,
        tierWeights: { t1: 0.45, t2: 0.2, t3: 0.12, t4: 0.08, t5: 0.15 },
        distressEvents: {
            bankruptcy: { baseScore: 100, weight: 3.0 },
            delisting: { baseScore: 90, weight: 2.5 },
            nonReliance: { baseScore: 85, weight: 2.0 },
            triggering: { baseScore: 70, weight: 1.5 },
            impairment: { baseScore: 60, weight: 1.0 },
            termination: { baseScore: 50, weight: 1.0 },
            recencyWindowDays: 730,
        },
    },
    ers: {
        minOfficers: 3,
        minCSuite: 2,
        departures12mHigh: 2,
        cSuiteCoverageLow: 50,
        leadershipSentimentLow: 0.3,
        signal8: { baseScore: 10, cSuitePremium: 1.4, cap: 50 },
    },
    acs: {
        directWeight: 0.35,
        pathWeight: 0.3,
        governanceWeight: 0.15,
        jurisdictionWeight: 0.12,
        fociWeight: 0.08,
        ofacExactOverride: 90,
        hopDecay: 0.5,
    },
    events: {
        baseOffset: 20,
        defaultWeight: 6,
        typeWeights: {
            bankruptcy: 'critical',
            delisting: 'critical',
            default: 'critical',
            auditor: 'major',
            restructuring: 'major',
            officer: 'minor',
            director: 'minor',
            impairment: 'minor',
        },
        recency: {
            daysFresh: 14,
            multFresh: 1.0,
            daysRecent: 30,
            multRecent: 0.85,
            daysModerate: 90,
            multModerate: 0.6,
            multStale: 0.35,
            multNoDate: 0.55,
        },
        cluster: {
            windowDays: 14,
            countHigh: 5,
            bonusHigh: 40,
            countMedium: 3,
            bonusMedium: 25,
        },
    },
};

export interface SubScores {
    solvency: number;
    executive: number;
    news: number;
    market: number;
    eventPressure?: number;
    compliance?: number;
}

export type CoreLensKey = 'solvency' | 'executive' | 'news' | 'market';
export type LensKey = CoreLensKey | 'eventPressure' | 'compliance';

export interface CitationRef {
    ref?: string;
    url?: string;
    title?: string;
    source?: string;
    date?: string;
    snippet?: string;
}

export interface EvidenceCitation extends CitationRef {
    id?: string;
}

export interface EvidenceItem {
    text: string;
    date?: string;
    citations: EvidenceCitation[];
}

export interface LensDetail {
    metrics: Array<{ label: string; value: string; ref?: string }>;
    findings: EvidenceItem[];
}

export interface RiskDriver {
    lens: LensKey;
    source:
        | 'SEC'
        | 'NEWS'
        | 'STOCK'
        | 'POLY'
        | 'CSL'
        | 'OFAC'
        | 'GLEIF'
        | 'ownership_graph'
        | 'jurisdiction';
    score: number;
    finding: EvidenceItem;
}

export interface EntityRiskScore extends SubScores {
    fused: number;
    tier: RiskTier;
    updatedAt: number;
    previousFused?: number;
}

export interface SourceCoverage {
    sec: boolean;
    news: boolean;
    stock: boolean;
    poly: boolean;
    acs?: boolean;
    eventPressure?: boolean;
    velocity?: boolean;
    polymarket?: boolean;
}

export interface MonitorEntitySignalsSummary {
    signalAgreement?: SignalAgreement | null;
    sourcesAvailable?: number;
    sourcesRisky?: number;
    signalSummary?: string;
}

export interface MonitorEntityNewsSummary {
    headlineSummary?: string | null;
    mentionRatioLabel?: string | null;
    mentionRatioToday?: number | null;
    mentionDailyAvg30d?: number | null;
    sentimentAvg30d?: number | null;
    sentimentTrend?: string | null;
    mentionVelocity?: number | null;
}

export interface MonitorEntityStockSummary {
    stockPrice?: number | null;
    stockChangePercent?: number | null;
    stockChange30dPercent?: number | null;
    stockTrend30d?: 'positive' | 'negative' | 'stable' | null;
    stockTrendSignal?: 'bullish' | 'bearish' | 'neutral' | null;
    stockRsiSignal?: string | null;
    stockMacdSignal?: string | null;
    stockVolatility30d?: number | null;
}

export interface MonitorEntityVelocitySummary {
    edgarTrend?: 'accelerating' | 'declining' | 'stable' | 'new' | 'inactive' | null;
    edgarQoqPct?: number | null;
    edgarLatestMentions?: number | null;
    edgarPrevMentions?: number | null;
    edgarLatestQuarter?: string | null;
    edgarPrevQuarter?: string | null;
    edgarAvgMentions?: number | null;
    edgarAvgDiffPct?: number | null;
    edgarDivergenceScore?: number | null;
    edgarDivergenceLabel?: 'gaining-attention' | 'fading' | 'in-sync' | null;
}

export interface MonitorEntityPolymarketSummary {
    polymarketOutlook?: 'positive' | 'neutral' | 'negative' | null;
    polymarketOutlookScore?: number | null;
    polymarketCount?: number | null;
    polymarketPositiveMarkets?: number | null;
    polymarketNegativeMarkets?: number | null;
    polymarketMarkets?: Array<{ question?: string; active?: boolean; category?: string }>;
}

export interface MonitorEntitySectorSummary {
    /** Industry/sector string from Elemental (e.g. "Technology", "Financials"). Used for macro regime overlay. */
    sector?: string | null;
}

export interface SourceCoverageDetail {
    sec: { filings: number; earliest: string | null; latest: string | null };
    news: { articles: number; events: number; earliest: string | null; latest: string | null };
    stock: {
        readings: number;
        instruments: number;
        earliest: string | null;
        latest: string | null;
    };
    poly: { markets: number; active: number };
    fred: { series: number; earliest: string | null; latest: string | null };
    acs: boolean;
    eventPressure: boolean;
    velocity: boolean;
}

export interface PortfolioCoverageDetail {
    sec: { entities: number; filings: number; earliest: string | null; latest: string | null };
    news: {
        entities: number;
        articles: number;
        events: number;
        earliest: string | null;
        latest: string | null;
    };
    stock: {
        entities: number;
        readings: number;
        instruments: number;
        earliest: string | null;
        latest: string | null;
    };
    poly: { entities: number; markets: number; active: number };
    fred: { entities: number; series: number; earliest: string | null; latest: string | null };
    acs: number;
    eventPressure: number;
    velocity: number;
}

export interface ScoreComputationResult {
    scores: EntityRiskScore;
    drivers: RiskDriver[];
    conflicts: Array<{ lens: LensKey; delta: number }>;
    confidenceLevel: ConfidenceLevel;
    coverage: SourceCoverage;
    coverageDetail: SourceCoverageDetail;
    lensDetails: Partial<Record<LensKey, LensDetail>>;
    monitor?: MonitorEntitySignalsSummary &
        MonitorEntityNewsSummary &
        MonitorEntityStockSummary &
        MonitorEntityVelocitySummary &
        MonitorEntityPolymarketSummary &
        MonitorEntitySectorSummary & {
            riskCategory?: 'HIGH' | 'MEDIUM' | 'LOW' | 'IGNORE';
        };
}

export interface EntityDescriptor {
    inputName: string;
    resolvedName: string;
    neid: string | null;
}
