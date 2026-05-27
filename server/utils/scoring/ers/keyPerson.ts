import type { RiskLevel } from '../types';
import type { GovernanceSnapshot } from './types';

export function computeKeyPersonRisk(snapshot: GovernanceSnapshot): RiskLevel {
    if (snapshot.officerCount === 0) return 'critical';
    if (snapshot.officerCount < 3 || snapshot.cSuiteCount < 2) return 'high';
    if (snapshot.officerCount < 5) return 'medium';
    return 'low';
}
