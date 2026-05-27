import type { EvidenceItem, LensDetail, RiskLevel } from '../types';

export interface GovernanceSnapshot {
    officerCount: number;
    directorCount: number;
    cSuiteCount: number;
    cSuiteRoles: string[];
    departures90d: number;
    departures12m: number;
    auditorChanges12m: number;
}

export interface ErsSignal {
    signalType: string;
    severity: RiskLevel;
    score: number;
    description: string;
    evidence: EvidenceItem[];
}

export interface ErsComputationResult {
    score: number;
    riskLevel: RiskLevel;
    confidence: number;
    confidenceLevel: 'High' | 'Medium' | 'Low';
    keyPersonRisk: RiskLevel;
    governanceSummary: GovernanceSnapshot & { isSystemic: boolean };
    signals: ErsSignal[];
    detail: LensDetail;
    hasRealData: boolean;
}
