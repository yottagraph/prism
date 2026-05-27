import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from '../cache';
import type { LensDetail } from '../types';
import { computeFhsComposite } from './composite';
import { computeTier1Financials } from './tier1Financials';
import { computeTier2Events } from './tier2Events';
import { computeTier3Behavioral } from './tier3Behavioral';
import { computeTier5Instruments } from './tier5Instruments';

export interface FhsResult {
    score: number;
    hasRealData: boolean;
    detail: LensDetail;
}

export async function computeFhsScore(
    event: H3Event,
    portfolioId: string,
    neid: string
): Promise<FhsResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'fhs');
    const cached = await readScoringCache<FhsResult>(event, cacheKey);
    if (cached) return cached;

    const tier1 = await computeTier1Financials(event, neid);
    const tier2 = await computeTier2Events(event, neid, Date.now());
    const tier3 = await computeTier3Behavioral(event, neid);
    const tier5 = await computeTier5Instruments(event, neid);
    const tier4 = {
        tier: 4 as const,
        tierName: 'Stake Changes',
        score: null,
        weight: 0.08,
        signalCount: 0,
        hasData: false,
        metrics: [],
        findings: [],
        signals: [],
    };

    const composite = computeFhsComposite([tier1, tier2, tier3, tier4, tier5], {
        freshestFilingDays: tier1.freshestFilingDays,
        leverageLatest: tier1.leverageLatest,
        leveragePrevious: tier1.leveragePrevious,
    });

    const riskPrefix =
        composite.riskLevel.charAt(0).toUpperCase() + composite.riskLevel.slice(1).toLowerCase();
    const result: FhsResult = {
        score: composite.score,
        hasRealData: composite.hasRealData,
        detail: {
            metrics: [
                { label: 'Risk level', value: riskPrefix },
                {
                    label: 'Confidence',
                    value: `${composite.confidence} (${composite.confidenceLevel})`,
                },
                { label: 'Trend', value: composite.trendDirection.replaceAll('_', ' ') },
                {
                    label: 'Staleness',
                    value:
                        composite.stalenessDays != null
                            ? `${composite.stalenessLevel} (${composite.stalenessDays}d)`
                            : 'unknown',
                },
                ...composite.detail.metrics,
            ],
            findings:
                composite.detail.findings.length > 0
                    ? composite.detail.findings
                    : [{ text: 'No solvency evidence returned for this entity.', citations: [] }],
        },
    };

    await writeScoringCache(event, cacheKey, result, 24 * 60 * 60);
    return result;
}
