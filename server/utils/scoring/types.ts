export type RiskTier = 'critical' | 'high' | 'watch' | 'normal';

export interface SourceFusionWeights {
    solvency: number;
    executive: number;
    news: number;
    market: number;
}

export interface SubScores {
    solvency: number;
    executive: number;
    news: number;
    market: number;
}

export type LensKey = keyof SubScores;

export interface CitationRef {
    ref?: string;
    url?: string;
    title?: string;
    source?: string;
    date?: string;
    snippet?: string;
}

export interface EvidenceItem {
    text: string;
    date?: string;
    citations: CitationRef[];
}

export interface LensDetail {
    metrics: Array<{ label: string; value: string; ref?: string }>;
    findings: EvidenceItem[];
}

export interface RiskDriver {
    lens: LensKey;
    source: 'SEC' | 'NEWS' | 'STOCK' | 'POLY';
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
}

export interface ScoreComputationResult {
    scores: EntityRiskScore;
    drivers: RiskDriver[];
    conflicts: Array<{ lens: LensKey; delta: number }>;
    confidenceLevel: 'High' | 'Medium' | 'Low';
    coverage: SourceCoverage;
    lensDetails: Record<LensKey, LensDetail>;
}

export interface EntityDescriptor {
    inputName: string;
    resolvedName: string;
    neid: string | null;
}
