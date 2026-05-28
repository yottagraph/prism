/**
 * Multi-source fused scoring.
 *
 * Each entity carries four per-lens scores (solvency / executive / news /
 * market) plus a fused composite, all computed from Elemental-backed inputs.
 */

export type RiskTier = 'critical' | 'high' | 'medium' | 'low';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
export type ConfidenceLevel = 'High' | 'Medium' | 'Low';
export type SignalAgreement = 'agreement' | 'conflict' | 'partial' | 'sec_only' | 'limited';

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

export interface EntityRiskScore extends SubScores {
    fused: number;
    tier: RiskTier;
    updatedAt: number;
    previousFused?: number;
}

export interface SourceFusionWeights {
    solvency: number;
    executive: number;
    news: number;
    market: number;
    eventPressure?: number;
    compliance?: number;
}

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

export const DEFAULT_WEIGHTS: SourceFusionWeights = {
    solvency: 0.35,
    executive: 0.25,
    news: 0.15,
    market: 0,
    eventPressure: 0.25,
};

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

export type EventSeverity = 'critical' | 'major' | 'minor' | 'trivial';

export const EVENT_SEVERITY_WEIGHTS: Record<EventSeverity, number> = {
    critical: 28,
    major: 18,
    minor: 10,
    trivial: 4,
};

export function resolveSeverityWeight(severity: EventSeverity): number {
    return EVENT_SEVERITY_WEIGHTS[severity];
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

export const DEFAULT_EVENT_PRESSURE: EventPressureSettings = {
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
};

export const DEFAULT_DISTRESS_EVENTS: DistressEventConfig = {
    bankruptcy: { baseScore: 100, weight: 3.0 },
    delisting: { baseScore: 90, weight: 2.5 },
    nonReliance: { baseScore: 85, weight: 2.0 },
    triggering: { baseScore: 70, weight: 1.5 },
    impairment: { baseScore: 60, weight: 1.0 },
    termination: { baseScore: 50, weight: 1.0 },
    recencyWindowDays: 730,
};

export const DEFAULT_SIGNAL8: ErsSignal8Settings = {
    baseScore: 10,
    cSuitePremium: 1.4,
    cap: 50,
};

export const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
    weights: { ...DEFAULT_WEIGHTS },
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
        distressEvents: { ...DEFAULT_DISTRESS_EVENTS },
    },
    ers: {
        minOfficers: 3,
        minCSuite: 2,
        departures12mHigh: 2,
        cSuiteCoverageLow: 50,
        leadershipSentimentLow: 0.3,
        signal8: { ...DEFAULT_SIGNAL8 },
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
    events: { ...DEFAULT_EVENT_PRESSURE },
};

export function fuseScore(s: SubScores, w: SourceFusionWeights = DEFAULT_WEIGHTS): number {
    const sum =
        w.solvency +
            w.executive +
            w.news +
            w.market +
            (w.eventPressure ?? 0) +
            (w.compliance ?? 0) || 1;
    const raw =
        (s.solvency * w.solvency +
            s.executive * w.executive +
            s.news * w.news +
            s.market * w.market +
            (s.eventPressure ?? 0) * (w.eventPressure ?? 0) +
            (s.compliance ?? 0) * (w.compliance ?? 0)) /
        sum;
    return Math.round(raw);
}

export function deriveTier(fused: number, tiers?: TierBands): RiskTier {
    const c = tiers?.critical ?? 80;
    const h = tiers?.high ?? 65;
    const m = tiers?.medium ?? 50;
    if (fused >= c) return 'critical';
    if (fused >= h) return 'high';
    if (fused >= m) return 'medium';
    return 'low';
}

export function tierColor(tier: RiskTier): string {
    switch (tier) {
        case 'critical':
            return 'error';
        case 'high':
            return 'warning';
        case 'medium':
            return 'info';
        default:
            return 'success';
    }
}

export function tierLabel(tier: RiskTier): string {
    return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function scoreToLabel(score: number, tiers?: TierBands): RiskTier {
    return deriveTier(score, tiers);
}

export function scoreLabelColor(score: number, tiers?: TierBands): string {
    return tierColor(scoreToLabel(score, tiers));
}

/**
 * Identify the source lenses whose scores diverge from the fused average
 * by more than `threshold` points — these are the "agreement / conflict"
 * indicators surfaced in the Query Agent narrative.
 */
export function detectConflicts(
    s: SubScores,
    threshold = 20
): Array<{ lens: CoreLensKey; delta: number }> {
    const mean = (s.solvency + s.executive + s.news + s.market) / 4;
    const out: Array<{ lens: CoreLensKey; delta: number }> = [];
    (['solvency', 'executive', 'news', 'market'] as CoreLensKey[]).forEach((k) => {
        const delta = s[k] - mean;
        if (Math.abs(delta) >= threshold) out.push({ lens: k, delta: Math.round(delta) });
    });
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Confidence proxy from the spread of sub-scores. Tight spread → high. */
export function confidence(s: SubScores): 'High' | 'Medium' | 'Low' {
    const arr = [s.solvency, s.executive, s.news, s.market];
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    const stddev = Math.sqrt(variance);
    if (stddev < 10) return 'High';
    if (stddev < 20) return 'Medium';
    return 'Low';
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

export interface MonitorEntity {
    inputName: string;
    resolvedName: string;
    neid: string | null;
    ticker?: string;
    scores: EntityRiskScore | null;
    riskCategory?: 'HIGH' | 'MEDIUM' | 'LOW' | 'IGNORE';
    confidenceLevel?: ConfidenceLevel;
    signalAgreement?: SignalAgreement | null;
    sourcesAvailable?: number;
    sourcesRisky?: number;
    signalSummary?: string;
    headlineSummary?: string | null;
    mentionRatioLabel?: string | null;
    mentionRatioToday?: number | null;
    mentionDailyAvg30d?: number | null;
    sentimentAvg30d?: number | null;
    sentimentTrend?: string | null;
    mentionVelocity?: number | null;
    stockPrice?: number | null;
    stockChangePercent?: number | null;
    stockChange30dPercent?: number | null;
    stockTrend30d?: 'positive' | 'negative' | 'stable' | null;
    stockTrendSignal?: 'bullish' | 'bearish' | 'neutral' | null;
    stockRsiSignal?: string | null;
    stockMacdSignal?: string | null;
    stockVolatility30d?: number | null;
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
    polymarketOutlook?: 'positive' | 'neutral' | 'negative' | null;
    polymarketOutlookScore?: number | null;
    polymarketCount?: number | null;
    polymarketPositiveMarkets?: number | null;
    polymarketNegativeMarkets?: number | null;
    polymarketMarkets?: Array<{ question?: string; active?: boolean; category?: string }>;
    /** Industry/sector from Elemental, used for portfolio macro regime overlay. */
    sector?: string | null;
}
