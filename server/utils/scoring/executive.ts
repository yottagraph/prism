import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { findEntities, getSchema, normalizePidMap } from './elemental';
import { clampScore } from './hash';

interface ExecutiveResult {
    score: number;
    hasRealData: boolean;
    metrics: Array<{ label: string; value: string }>;
    evidence: string[];
}

export async function computeExecutiveScore(
    event: H3Event,
    portfolioId: string,
    neid: string
): Promise<ExecutiveResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'executive');
    const cached = await readScoringCache<ExecutiveResult>(event, cacheKey);
    if (cached) return cached;

    let score = 0;
    let hasRealData = false;
    const metrics: Array<{ label: string; value: string }> = [];
    const evidence: string[] = [];

    try {
        const schema = await getSchema(event);
        const pids = normalizePidMap(schema);

        const officerPid = pids.officer_of ?? pids.officer ?? pids.has_officer;
        const directorPid = pids.director_of ?? pids.director ?? pids.has_director;
        const ownerPid = pids.beneficial_owner_of ?? pids.beneficial_owner;

        const relationshipPids = [officerPid, directorPid, ownerPid].filter(
            (v): v is number => typeof v === 'number'
        );
        if (relationshipPids.length) {
            let links = 0;
            for (const pid of relationshipPids) {
                const eids = await findEntities(
                    {
                        type: 'linked',
                        linked: {
                            expression: { type: 'is_entity', is_entity: { eid: neid } },
                            pid,
                            direction: 'incoming',
                        },
                    },
                    50,
                    event
                );
                links += eids.length;
            }
            hasRealData = true;
            const turnoverProxy = links > 30 ? 25 : links > 15 ? 14 : links > 8 ? 8 : 2;
            score = clampScore(38 + turnoverProxy);
            metrics.push({ label: 'Governance links', value: `${links}` });
            metrics.push({ label: 'Turnover proxy', value: `${turnoverProxy}` });
            evidence.push('Computed from officer/director/owner relationship graph degree');
        }
    } catch (error) {
        console.warn('[executive] failed', error);
    }

    const result: ExecutiveResult = {
        score,
        hasRealData,
        metrics: metrics.length
            ? metrics
            : [{ label: 'Status', value: 'Elemental data unavailable' }],
        evidence: evidence.length
            ? evidence
            : ['No executive risk signals returned from Elemental sources'],
    };
    await writeScoringCache(event, cacheKey, result);
    return result;
}
