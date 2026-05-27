import type { TraversedNode } from './types';

const TIER1 = new Set(['KP', 'IR', 'SY', 'CU', 'RU']);
const TIER2 = new Set(['CN', 'VE', 'BY', 'MM']);
const TIER3 = new Set(['AE', 'KY', 'VG', 'PA']);

export function jurisdictionTier(code: string | null | undefined): 1 | 2 | 3 | 4 {
    const normalized = String(code || '').toUpperCase();
    if (TIER1.has(normalized)) return 1;
    if (TIER2.has(normalized)) return 2;
    if (TIER3.has(normalized)) return 3;
    return 4;
}

export function evaluateJurisdictionExposure(nodes: TraversedNode[]) {
    return nodes.map((node) => {
        const tier = jurisdictionTier(node.jurisdiction);
        const contribution = tier === 1 ? 100 : tier === 2 ? 70 : tier === 3 ? 40 : 10;
        return {
            node,
            tier,
            contribution,
        };
    });
}

export function evaluateFoci(nodes: TraversedNode[]) {
    const foreignOwnership = nodes.reduce((sum, node) => {
        const tier = jurisdictionTier(node.jurisdiction);
        if (
            tier <= 2 &&
            typeof node.ownershipPercentage === 'number' &&
            Number.isFinite(node.ownershipPercentage)
        ) {
            return sum + Math.max(0, node.ownershipPercentage);
        }
        return sum;
    }, 0);
    const foreignBoardCount = nodes.filter(
        (node) =>
            node.relationshipType.includes('director') && jurisdictionTier(node.jurisdiction) <= 2
    ).length;
    const foreignOfficerCount = nodes.filter(
        (node) =>
            node.relationshipType.includes('officer') && jurisdictionTier(node.jurisdiction) <= 2
    ).length;
    const totalBoard = Math.max(
        1,
        nodes.filter((node) => node.relationshipType.includes('director')).length
    );
    const totalOfficers = Math.max(
        1,
        nodes.filter((node) => node.relationshipType.includes('officer')).length
    );

    const foreignBoardPct = (foreignBoardCount / totalBoard) * 100;
    const foreignOfficerPct = (foreignOfficerCount / totalOfficers) * 100;
    const overallRisk: 'critical' | 'high' | 'medium' | 'low' =
        foreignOwnership >= 50 || foreignBoardPct >= 50 || foreignOfficerPct >= 40
            ? 'critical'
            : foreignOwnership >= 25 || foreignBoardPct >= 21 || foreignOfficerPct >= 16
              ? 'high'
              : foreignOwnership >= 5 || foreignBoardPct >= 1 || foreignOfficerPct >= 1
                ? 'medium'
                : 'low';
    return {
        foreignOwnershipPct: foreignOwnership,
        foreignBoardPct,
        foreignOfficerPct,
        overallRisk,
    };
}
