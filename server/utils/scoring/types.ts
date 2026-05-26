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

export interface RiskDriver {
    lens: keyof SubScores;
    source: 'SEC' | 'NEWS' | 'STOCK' | 'POLY';
    score: number;
    label: string;
    explanation: string;
    evidence: string;
    href?: string;
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
    conflicts: Array<{ lens: keyof SubScores; delta: number }>;
    confidenceLevel: 'High' | 'Medium' | 'Low';
    coverage: SourceCoverage;
}

export interface EntityDescriptor {
    inputName: string;
    resolvedName: string;
    neid: string | null;
}

