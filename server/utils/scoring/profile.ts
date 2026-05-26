import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { deriveDrivers, detectConflicts, confidence } from './fuse';
import { findEntities, getEntityName, getSchema, normalizePidMap } from './elemental';
import { scoreEntity } from './scoreEntity';

async function resolveNeighborNames(eids: string[], limit = 10): Promise<string[]> {
    const trimmed = eids.slice(0, limit);
    return Promise.all(
        trimmed.map(async (eid) => {
            try {
                return await getEntityName(eid);
            } catch {
                return eid;
            }
        })
    );
}

async function getRelationships(neid: string) {
    const schema = await getSchema();
    const pid = normalizePidMap(schema);
    const links = {
        companies: [] as any[],
        people: [] as any[],
        instruments: [] as any[],
        locations: [] as any[],
    };

    async function linkedBy(propertyPid?: number, relationship = 'related_to', bucket?: keyof typeof links) {
        if (!propertyPid || !bucket) return;
        try {
            const eids = await findEntities({
                type: 'linked',
                linked: {
                    expression: { type: 'is_entity', is_entity: { eid: neid } },
                    pid: propertyPid,
                    direction: 'outgoing',
                },
            });
            const names = await resolveNeighborNames(eids, 8);
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
        linkedBy(pid.officer_of ?? pid.director_of, 'officer_of', 'people'),
        linkedBy(pid.issued_by ?? pid.lender_of, 'issued_by', 'instruments'),
        linkedBy(pid.located_at, 'located_at', 'locations'),
    ]);

    return links;
}

export async function getEntityProfile(event: H3Event, portfolioId: string, neid: string) {
    const cacheKey = makeCacheKey(portfolioId, neid, 'profile');
    const cached = await readScoringCache<any>(event, cacheKey);
    if (cached) return cached;

    const [name, scored, relationships] = await Promise.all([
        getEntityName(neid).catch(() => neid),
        scoreEntity(event, portfolioId, neid),
        getRelationships(neid),
    ]);

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
        scores: scored.scores,
        drivers: scored.drivers,
        conflicts: scored.conflicts,
        confidenceLevel: scored.confidenceLevel,
        lensDetails: {
            solvency: {
                metrics: [{ label: 'Score', value: `${scored.scores.solvency}` }],
                evidence: ['Elemental fundamentals and filing cadence'],
            },
            executive: {
                metrics: [{ label: 'Score', value: `${scored.scores.executive}` }],
                evidence: ['Officer/director relationship graph signals'],
            },
            news: {
                metrics: [{ label: 'Score', value: `${scored.scores.news}` }],
                evidence: ['News sentiment and mention velocity properties'],
            },
            market: {
                metrics: [{ label: 'Score', value: `${scored.scores.market}` }],
                evidence: ['Market return/volatility/anomaly features'],
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

