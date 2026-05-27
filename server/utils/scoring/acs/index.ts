import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from '../cache';
import { getEntityName } from '../elemental';
import type { LensDetail } from '../types';
import { computeAcsComposite } from './composite';
import { runDirectScreening } from './directScreening';
import { traverseOwnershipGraph } from './graphTraversal';
import { evaluateFoci, evaluateJurisdictionExposure } from './jurisdiction';

export interface AcsResult {
    score: number;
    hasRealData: boolean;
    detail: LensDetail;
}

export async function computeAcsScore(
    event: H3Event,
    portfolioId: string,
    neid: string
): Promise<AcsResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'acs');
    const cached = await readScoringCache<AcsResult>(event, cacheKey);
    if (cached) return cached;

    const name = await getEntityName(neid, event);
    const directMatches = runDirectScreening(name);
    const traversed = await traverseOwnershipGraph(event, neid, 3);
    const pathMatches = traversed.flatMap((node) => runDirectScreening(node.name));
    const jurisdictionContributions = evaluateJurisdictionExposure(traversed);
    const foci = evaluateFoci(traversed);
    const composite = computeAcsComposite({
        directMatches,
        pathMatches,
        traversedNodes: traversed,
        jurisdictionContributions,
        foci,
    });

    const out: AcsResult = {
        score: composite.score,
        hasRealData: composite.hasRealData,
        detail: {
            metrics: [
                { label: 'Risk level', value: composite.riskLevel },
                {
                    label: 'Confidence',
                    value: `${composite.confidence} (${composite.confidenceLevel})`,
                },
                ...composite.detail.metrics,
            ],
            findings:
                composite.detail.findings.length > 0
                    ? composite.detail.findings
                    : [
                          {
                              text: 'No direct or ownership-path screening hits were found.',
                              citations: [],
                          },
                      ],
        },
    };
    await writeScoringCache(event, cacheKey, out, 7 * 24 * 60 * 60);
    return out;
}
