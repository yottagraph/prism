export type RiskTier = 'critical' | 'high' | 'watch' | 'normal';
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
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

export interface ScoreComputationResult {
    scores: EntityRiskScore;
    drivers: RiskDriver[];
    conflicts: Array<{ lens: LensKey; delta: number }>;
    confidenceLevel: ConfidenceLevel;
    coverage: SourceCoverage;
    lensDetails: Partial<Record<LensKey, LensDetail>>;
    monitor?: MonitorEntitySignalsSummary &
        MonitorEntityNewsSummary &
        MonitorEntityStockSummary &
        MonitorEntityVelocitySummary &
        MonitorEntityPolymarketSummary & {
            riskCategory?: 'HIGH' | 'MEDIUM' | 'LOW' | 'IGNORE';
        };
}

export interface EntityDescriptor {
    inputName: string;
    resolvedName: string;
    neid: string | null;
}
