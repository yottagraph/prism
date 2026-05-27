import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from '../cache';
import { resolveRefs } from '../citations';
import type { ContextPackage } from '../contextPackage';
import type { LensDetail } from '../types';
import { computeErsComposite } from './composite';
import { buildGovernanceSnapshot } from './governanceSnapshot';
import { computeErsSignals } from './signals';

export interface ErsResult {
    score: number;
    hasRealData: boolean;
    detail: LensDetail;
}

export async function computeErsScore(
    event: H3Event,
    portfolioId: string,
    neid: string,
    ctx?: ContextPackage
): Promise<ErsResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'ers');
    const cached = await readScoringCache<ErsResult>(event, cacheKey);
    if (cached) return cached;

    const snapshot = await buildGovernanceSnapshot(event, neid, ctx);
    const signals = computeErsSignals(snapshot, ctx?.events);
    const citationMap = await resolveRefs(snapshot.references, event);
    const citations = snapshot.references
        .map((ref) => citationMap.get(ref))
        .filter((citation): citation is NonNullable<typeof citation> => Boolean(citation));
    const result = computeErsComposite(snapshot, signals, citations);

    const out: ErsResult = {
        score: result.score,
        hasRealData: result.hasRealData,
        detail: {
            metrics: [
                { label: 'Risk level', value: result.riskLevel },
                { label: 'Confidence', value: `${result.confidence} (${result.confidenceLevel})` },
                ...result.detail.metrics,
            ],
            findings: result.detail.findings,
        },
    };

    await writeScoringCache(event, cacheKey, out, 24 * 60 * 60);
    return out;
}
