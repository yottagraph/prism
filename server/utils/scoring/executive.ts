import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { findEntities, getSchema, normalizePidMap } from './elemental';
import { clampScore, seededScore } from './hash';

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

    let score = seededScore(neid, 'ers');
    let hasRealData = false;
    const metrics: Array<{ label: string; value: string }> = [];
    const evidence: string[] = [];

    try {
        const schema = await getSchema();
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
                const eids = await findEntities({
                    type: 'linked',
                    linked: {
                        expression: { type: 'is_entity', is_entity: { eid: neid } },
                        pid,
                        direction: 'incoming',
                    },
                });
                links += eids.length;
            }
            hasRealData = true;
            const turnoverProxy = links > 30 ? 25 : links > 15 ? 14 : links > 8 ? 8 : 2;
            score = clampScore(38 + turnoverProxy + seededScore(neid, 'ers-jitter', 0, 42));
            metrics.push({ label: 'Governance links', value: `${links}` });
            metrics.push({ label: 'Turnover proxy', value: `${turnoverProxy}` });
            evidence.push('Computed from officer/director/owner relationship graph degree');
        }
    } catch (error) {
        console.warn('[executive] failed, using fallback', error);
    }

    const result: ExecutiveResult = {
        score,
        hasRealData,
        metrics: metrics.length ? metrics : [{ label: 'Fallback model', value: 'Seeded baseline' }],
        evidence: evidence.length ? evidence : ['Fallback seeded score while relationship density is sparse'],
    };
    await writeScoringCache(event, cacheKey, result);
    return result;
}

