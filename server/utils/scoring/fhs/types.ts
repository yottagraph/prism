import type { EvidenceItem, LensDetail, RiskLevel } from '../types';

export interface FhsSignal {
    signalType: string;
    tier: 1 | 2 | 3 | 4 | 5;
    severity: RiskLevel;
    score: number;
    weight: number;
    description: string;
    evidence: EvidenceItem[];
}

export interface FhsTierResult {
    tier: 1 | 2 | 3 | 4 | 5;
    tierName: string;
    score: number | null;
    weight: number;
    signalCount: number;
    hasData: boolean;
    metrics: LensDetail['metrics'];
    findings: EvidenceItem[];
    signals: FhsSignal[];
}

export interface FhsComputationContext {
    nowMs: number;
}

export interface FhsCompositeResult {
    score: number;
    riskLevel: RiskLevel;
    confidence: number;
    confidenceLevel: 'High' | 'Medium' | 'Low';
    trendDirection: 'rapid_deterioration' | 'deteriorating' | 'stable' | 'improving';
    stalenessDays: number | null;
    stalenessLevel: 'fresh' | 'aging' | 'stale' | 'very_stale' | 'unknown';
    tierBreakdown: FhsTierResult[];
    detail: LensDetail;
    hasRealData: boolean;
}
