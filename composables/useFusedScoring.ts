/**
 * Multi-source fused scoring.
 *
 * Each entity carries four per-lens scores (solvency / executive / news /
 * market) plus a fused composite, all computed from Elemental-backed inputs.
 */

export type RiskTier = 'critical' | 'high' | 'watch' | 'normal';
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

export function deriveTier(fused: number): RiskTier {
    if (fused >= 80) return 'critical';
    if (fused >= 65) return 'high';
    if (fused >= 50) return 'watch';
    return 'normal';
}

export function tierColor(tier: RiskTier): string {
    switch (tier) {
        case 'critical':
            return 'error';
        case 'high':
            return 'warning';
        case 'watch':
            return 'info';
        default:
            return 'success';
    }
}

export function tierLabel(tier: RiskTier): string {
    return tier.charAt(0).toUpperCase() + tier.slice(1);
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
}
