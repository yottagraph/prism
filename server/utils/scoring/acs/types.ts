import type { LensDetail, RiskLevel } from '../types';

export interface ScreeningMatch {
    matchedEntity: string;
    listSource: 'OFAC_SDN' | 'CSL' | 'UN' | 'PEP' | 'custom';
    matchQuality: 'exact' | 'strong' | 'probable' | 'possible';
    matchConfidence: number;
    matchedIdentifiers: string[];
    requiresReview: boolean;
    riskContribution: number;
}

export interface TraversedNode {
    neid: string;
    name: string;
    hopDistance: number;
    relationshipType: string;
    ownershipPercentage?: number | null;
    jurisdiction?: string | null;
}

export interface AcsComputationResult {
    score: number;
    riskLevel: RiskLevel;
    confidence: number;
    confidenceLevel: 'High' | 'Medium' | 'Low';
    detail: LensDetail;
    hasRealData: boolean;
}
