import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from '../cache';
import { resolveRefs } from '../citations';
import type { ContextPackage } from '../contextPackage';
import type { ErsThresholds, LensDetail } from '../types';
import { computeErsComposite } from './composite';
import { buildGovernanceSnapshot } from './governanceSnapshot';
import { computeErsSignals } from './signals';

export interface ErsResult {
    score: number;
    hasRealData: boolean;
    detail: LensDetail;
    departures12m: number;
    departures90d: number;
    officerCount: number;
    directorCount: number;
    cSuiteCount: number;
    cSuiteRoles: string[];
    auditorChanges12m: number;
    isSystemic: boolean;
    governanceFlags: string[];
    keyPersonRisk: string;
}

export async function computeErsScore(
    event: H3Event,
    portfolioId: string,
    neid: string,
    ctx?: ContextPackage,
    ersThresholds?: ErsThresholds
): Promise<ErsResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'ers');
    const cached = await readScoringCache<ErsResult>(event, cacheKey);
    if (cached) return cached;

    const snapshot = await buildGovernanceSnapshot(event, neid, ctx);
    const signals = computeErsSignals(snapshot, ctx?.events, ersThresholds);
    const citationMap = await resolveRefs(snapshot.references, event, ctx);
    const citations = snapshot.references
        .map((ref) => citationMap.get(ref))
        .filter((citation): citation is NonNullable<typeof citation> => Boolean(citation));
    const result = computeErsComposite(snapshot, signals, citations);

    // Derive human-readable governance flags from signals for table display
    const governanceFlags: string[] = [];
    for (const signal of result.signals) {
        switch (signal.signalType) {
            case 'officer_count':
                governanceFlags.push('Low officer count');
                break;
            case 'c_suite_coverage':
            case 'c_suite_coverage_ratio':
                governanceFlags.push('Low C-suite coverage');
                break;
            case 'officer_departures':
                governanceFlags.push(`${result.governanceSummary.departures12m} departures (12m)`);
                break;
            case 'auditor_changes':
                governanceFlags.push('Auditor change');
                break;
            case 'cumulative_departure_pattern':
                governanceFlags.push(
                    result.governanceSummary.isSystemic
                        ? 'Systemic departures'
                        : 'Cumulative departures'
                );
                break;
            case '8k_item_5_02_events':
                governanceFlags.push('8-K 5.02 events');
                break;
        }
    }

    const out: ErsResult = {
        score: result.score,
        hasRealData: result.hasRealData,
        departures12m: result.governanceSummary.departures12m,
        departures90d: result.governanceSummary.departures90d,
        officerCount: result.governanceSummary.officerCount,
        directorCount: result.governanceSummary.directorCount,
        cSuiteCount: result.governanceSummary.cSuiteCount,
        cSuiteRoles: result.governanceSummary.cSuiteRoles,
        auditorChanges12m: result.governanceSummary.auditorChanges12m,
        isSystemic: result.governanceSummary.isSystemic,
        governanceFlags: [...new Set(governanceFlags)],
        keyPersonRisk: result.keyPersonRisk,
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
