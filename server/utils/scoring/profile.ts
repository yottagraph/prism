import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { deriveDrivers, detectConflicts, confidence } from './fuse';
import { findEntities, getEntityName, getSchema, normalizePidMap } from './elemental';
import { scoreEntity } from './scoreEntity';

async function resolveNeighborNames(event: H3Event, eids: string[], limit = 10): Promise<string[]> {
    const trimmed = eids.slice(0, limit);
    return Promise.all(
        trimmed.map(async (eid) => {
            try {
                return await getEntityName(eid, event);
            } catch {
                return eid;
            }
        })
    );
}

async function getRelationships(event: H3Event, neid: string) {
    const schema = await getSchema(event).catch(() => ({ flavors: [], properties: [] }));
    const pid = normalizePidMap(schema);
    const links = {
        companies: [] as any[],
        people: [] as any[],
        instruments: [] as any[],
        locations: [] as any[],
    };

    async function linkedBy(
        propertyPid?: number,
        relationship = 'related_to',
        bucket?: keyof typeof links
    ) {
        if (!propertyPid || !bucket) return;
        try {
            const eids = await findEntities(
                {
                    type: 'linked',
                    linked: {
                        to_entity: neid,
                        distance: 1,
                        pids: [propertyPid],
                        direction: 'outgoing',
                    },
                },
                50,
                event
            );
            const names = await resolveNeighborNames(event, eids, 8);
            names.forEach((name, index) => {
                links[bucket].push({
                    neid: eids[index],
                    name,
                    relationship,
                });
            });
        } catch {
            // Keep fallback empty when live relationship lookup fails.
        }
    }

    await Promise.all([
        linkedBy(pid.subsidiary_of ?? pid.compensation_peer_of, 'subsidiary_of', 'companies'),
        linkedBy(pid.is_officer ?? pid.is_director ?? pid.officer_of ?? pid.director_of, 'officer_of', 'people'),
        linkedBy(pid.issued_by ?? pid.lender_of, 'issued_by', 'instruments'),
        linkedBy(pid.is_located_at ?? pid.located_at, 'located_at', 'locations'),
    ]);

    return links;
}

export async function getEntityProfile(event: H3Event, portfolioId: string, neid: string) {
    const cacheKey = makeCacheKey(portfolioId, neid, 'profile');
    const cached = await readScoringCache<any>(event, cacheKey);
    if (cached) return cached;

    const name = await getEntityName(neid, event).catch(() => neid);
    const relationships = await getRelationships(event, neid).catch(() => ({
        companies: [],
        people: [],
        instruments: [],
        locations: [],
    }));
    const scored = await scoreEntity(event, portfolioId, neid).catch(() => null);

    const profile = {
        neid,
        name,
        ticker: null as string | null,
        cik: null as string | null,
        sector: null as string | null,
        entityType: null as string | null,
        properties: [] as Array<{ pid: number; name: string; value: string | number | null }>,
        relationships,
        events: [] as Array<{
            date: string;
            category: string;
            title: string;
            severity: 'low' | 'medium' | 'high';
        }>,
        scores: scored?.scores ?? {
            solvency: 0,
            executive: 0,
            news: 0,
            market: 0,
            fused: 0,
            tier: 'normal',
            updatedAt: Date.now(),
        },
        drivers: scored?.drivers ?? [],
        conflicts: scored?.conflicts ?? [],
        confidenceLevel: scored?.confidenceLevel ?? 'Low',
        lensDetails: {
            solvency: {
                metrics: [{ label: 'Score', value: `${scored?.scores?.solvency ?? 0}` }],
                evidence: scored
                    ? ['Elemental fundamentals and filing cadence']
                    : ['Elemental solvency data unavailable for this entity'],
            },
            executive: {
                metrics: [{ label: 'Score', value: `${scored?.scores?.executive ?? 0}` }],
                evidence: scored
                    ? ['Officer/director relationship graph signals']
                    : ['Elemental governance data unavailable for this entity'],
            },
            news: {
                metrics: [{ label: 'Score', value: `${scored?.scores?.news ?? 0}` }],
                evidence: scored
                    ? ['News sentiment and mention velocity properties']
                    : ['Elemental news data unavailable for this entity'],
            },
            market: {
                metrics: [{ label: 'Score', value: `${scored?.scores?.market ?? 0}` }],
                evidence: scored
                    ? ['Market return/volatility/anomaly features']
                    : ['Elemental market data unavailable for this entity'],
            },
            macro: {
                metrics: [{ label: 'Status', value: 'Macro signals loaded separately' }],
                evidence: ['Macro context rendered from live Elemental-backed macro endpoints'],
            },
        },
    };

    await writeScoringCache(event, cacheKey, profile);
    return profile;
}

export async function getEntityScoreBreakdown(event: H3Event, portfolioId: string, neid: string) {
    const scored = await scoreEntity(event, portfolioId, neid);
    return {
        scores: scored.scores,
        drivers: deriveDrivers(neid, scored.scores),
        conflicts: detectConflicts(scored.scores),
        confidenceLevel: confidence(scored.scores),
        coverage: scored.coverage,
    };
}

export async function getEntityRelationships(event: H3Event, portfolioId: string, neid: string) {
    const profile = await getEntityProfile(event, portfolioId, neid);
    return profile.relationships;
}

export async function getEntityEvents(event: H3Event, portfolioId: string, neid: string) {
    const profile = await getEntityProfile(event, portfolioId, neid);
    return profile.events;
}
