import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from '../cache';
import type { ContextPackage } from '../contextPackage';
import type { DistressEventConfig, FhsThresholds, LensDetail } from '../types';
import { computeFhsComposite } from './composite';
import { computeTier1Financials } from './tier1Financials';
import { computeTier2Events } from './tier2Events';
import { computeTier3Behavioral } from './tier3Behavioral';
import { computeTier4Stakes } from './tier4Stakes';
import { computeTier5Instruments } from './tier5Instruments';

export interface FhsDistressEventCount {
    bankruptcy: number;
    delisting: number;
    nonReliance: number;
    triggering: number;
    impairment: number;
    termination: number;
}

export interface FhsResult {
    score: number;
    hasRealData: boolean;
    detail: LensDetail;
    leverageLatest: number | null;
    leveragePrevious: number | null;
    trendDirection: 'worsening' | 'stable' | 'improving' | null;
    distressEventCounts: FhsDistressEventCount;
    totalDistressEvents: number;
    latestDistressDate: string | null;
    freshestFilingDays: number | null;
}

export async function computeFhsScore(
    event: H3Event,
    portfolioId: string,
    neid: string,
    ctx?: ContextPackage,
    fhsThresholds?: FhsThresholds,
    distressEvents?: DistressEventConfig
): Promise<FhsResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'fhs');
    const cached = await readScoringCache<FhsResult>(event, cacheKey);
    if (cached) return cached;

    const tier1 = await computeTier1Financials(event, neid, ctx, fhsThresholds);
    const tier2 = await computeTier2Events(event, neid, Date.now(), ctx, distressEvents);
    const tier3 = await computeTier3Behavioral(event, neid, ctx);
    const tier5 = await computeTier5Instruments(event, neid, ctx);
    const tier4 = computeTier4Stakes(ctx);

    const composite = computeFhsComposite(
        [tier1, tier2, tier3, tier4, tier5],
        {
            freshestFilingDays: tier1.freshestFilingDays,
            leverageLatest: tier1.leverageLatest,
            leveragePrevious: tier1.leveragePrevious,
        },
        fhsThresholds?.tierWeights
    );

    const riskPrefix =
        composite.riskLevel.charAt(0).toUpperCase() + composite.riskLevel.slice(1).toLowerCase();

    // Derive distress event counts from tier2 signals by signal type
    const distressSignals = tier2.signals;
    const distressEventCounts: FhsDistressEventCount = {
        bankruptcy: distressSignals.filter((s) => s.signalType === 'BANKRUPTCY_EVENT').length,
        delisting: distressSignals.filter((s) => s.signalType === 'DELISTING_EVENT').length,
        nonReliance: distressSignals.filter((s) => s.signalType === 'NON_RELIANCE_EVENT').length,
        triggering: distressSignals.filter((s) => s.signalType === 'TRIGGERING_EVENT').length,
        impairment: distressSignals.filter((s) => s.signalType === 'IMPAIRMENT_EVENT').length,
        termination: distressSignals.filter((s) => s.signalType === 'TERMINATION_EVENT').length,
    };
    const totalDistressEvents = distressSignals.length;

    // Latest distress event date from tier2 findings
    const latestDistressDate =
        tier2.findings
            .map((f) => f.date)
            .filter((d): d is string => !!d)
            .sort()
            .pop() ?? null;

    // Map composite trendDirection to simplified worsening/stable/improving
    let trendDirection: FhsResult['trendDirection'];
    switch (composite.trendDirection) {
        case 'rapid_deterioration':
        case 'deteriorating':
            trendDirection = 'worsening';
            break;
        case 'improving':
            trendDirection = 'improving';
            break;
        default:
            trendDirection = 'stable';
    }

    const result: FhsResult = {
        score: composite.score,
        hasRealData: composite.hasRealData,
        leverageLatest: tier1.leverageLatest,
        leveragePrevious: tier1.leveragePrevious,
        trendDirection,
        distressEventCounts,
        totalDistressEvents,
        latestDistressDate,
        freshestFilingDays: tier1.freshestFilingDays,
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
