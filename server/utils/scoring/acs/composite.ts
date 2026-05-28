import { clampScore } from '../hash';
import type { AcsThresholds, LensDetail } from '../types';
import type { ScreeningMatch, TraversedNode } from './types';

export function computeAcsComposite(
    input: {
        directMatches: ScreeningMatch[];
        pathMatches: ScreeningMatch[];
        traversedNodes: TraversedNode[];
        jurisdictionContributions: Array<{
            node: TraversedNode;
            tier: 1 | 2 | 3 | 4;
            contribution: number;
        }>;
        foci: {
            foreignOwnershipPct: number;
            foreignBoardPct: number;
            foreignOfficerPct: number;
            overallRisk: 'critical' | 'high' | 'medium' | 'low';
        };
    },
    acsThresholds?: AcsThresholds
) {
    const dw = acsThresholds?.directWeight ?? 0.35;
    const pw = acsThresholds?.pathWeight ?? 0.3;
    const gw = acsThresholds?.governanceWeight ?? 0.15;
    const jw = acsThresholds?.jurisdictionWeight ?? 0.12;
    const fw = acsThresholds?.fociWeight ?? 0.08;
    const ofacOverride = acsThresholds?.ofacExactOverride ?? 90;

    const directScore = input.directMatches[0]?.riskContribution ?? 0;
    const pathScore = Math.min(
        100,
        input.pathMatches.reduce((sum, match) => sum + match.riskContribution, 0)
    );
    const governanceScore = Math.min(
        100,
        input.traversedNodes.filter((node) => node.relationshipType.includes('officer')).length * 15
    );
    const jurisdictionScore = Math.min(
        100,
        input.jurisdictionContributions.reduce((sum, row) => sum + row.contribution, 0)
    );
    const fociScore =
        input.foci.overallRisk === 'critical'
            ? 100
            : input.foci.overallRisk === 'high'
              ? 70
              : input.foci.overallRisk === 'medium'
                ? 40
                : 10;

    let score = clampScore(
        directScore * dw +
            pathScore * pw +
            governanceScore * gw +
            jurisdictionScore * jw +
            fociScore * fw
    );
    if (
        input.directMatches.some(
            (match) => match.listSource === 'OFAC_SDN' && match.matchQuality === 'exact'
        )
    ) {
        score = Math.max(score, ofacOverride);
    }
    const riskLevel =
        score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';
    const confidence = clampScore(
        (input.directMatches.length > 0 ? 90 : 60) * 0.4 +
            (input.pathMatches.length > 0 ? 80 : 40) * 0.3 +
            (input.traversedNodes.length > 0 ? 85 : 35) * 0.3
    );
    const confidenceLevel = confidence >= 75 ? 'High' : confidence >= 50 ? 'Medium' : 'Low';

    const detail: LensDetail = {
        metrics: [
            { label: 'Direct matches', value: `${input.directMatches.length}` },
            { label: 'Path matches', value: `${input.pathMatches.length}` },
            { label: 'Graph nodes screened', value: `${input.traversedNodes.length}` },
            { label: 'Foreign ownership', value: `${input.foci.foreignOwnershipPct.toFixed(1)}%` },
            { label: 'Foreign board seats', value: `${input.foci.foreignBoardPct.toFixed(1)}%` },
            { label: 'Foreign officers', value: `${input.foci.foreignOfficerPct.toFixed(1)}%` },
        ],
        findings: [
            ...input.directMatches.slice(0, 3).map((match) => ({
                text: `${match.matchQuality.toUpperCase()} ${match.listSource} match: ${match.matchedEntity}.`,
                citations: [],
            })),
            ...input.pathMatches.slice(0, 3).map((match) => ({
                text: `Ownership-path exposure via ${match.matchedEntity} (${match.matchQuality}).`,
                citations: [],
            })),
            {
                text: `FOCI assessment is ${input.foci.overallRisk}.`,
                citations: [],
            },
        ],
    };

    return {
        score,
        riskLevel,
        confidence,
        confidenceLevel,
        detail,
        hasRealData:
            input.directMatches.length > 0 ||
            input.pathMatches.length > 0 ||
            input.traversedNodes.length > 0,
    };
}
