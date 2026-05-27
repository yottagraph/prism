import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { confidence, detectConflicts } from './fuse';
import { resolveRefs } from './citations';
import { findEntities, getEntityName, getSchema, normalizePidMap } from './elemental';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
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
    const entitySnapshot = await callMcpTool(
        'elemental',
        'elemental_get_entity',
        {
            entity_id: { id_type: 'neid', id: neid },
            properties: ['ticker_symbol', 'company_cik', 'industry'],
        },
        event
    ).catch(() => null);
    const entityData = extractMcpStructuredContent<{
        entity?: {
            flavor?: string;
            properties?: Record<string, { value?: unknown }>;
        };
    }>(entitySnapshot);

    const eventsResult = await callMcpTool(
        'elemental',
        'elemental_get_events',
        {
            entity_id: { id_type: 'neid', id: neid },
            limit: 25,
            include_participants: false,
        },
        event
    ).catch(() => null);
    const eventRows =
        extractMcpStructuredContent<{
            events?: Array<{ name?: string; properties?: Record<string, { value?: unknown; ref?: string }> }>;
        }>(eventsResult)?.events ?? [];
    const eventRefs = eventRows.flatMap((eventRow) =>
        Object.values(eventRow.properties || {})
            .map((property) => property?.ref)
            .filter((ref): ref is string => typeof ref === 'string')
    );
    const eventCitationMap = await resolveRefs(eventRefs, event).catch(() => new Map());

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
        ticker:
            (entityData?.entity?.properties?.ticker_symbol?.value as string | null | undefined) ?? null,
        cik: (entityData?.entity?.properties?.company_cik?.value as string | null | undefined) ?? null,
        sector: (entityData?.entity?.properties?.industry?.value as string | null | undefined) ?? null,
        entityType: (entityData?.entity?.flavor as string | null | undefined) ?? null,
        properties: [] as Array<{ pid: number; name: string; value: string | number | null }>,
        relationships,
        events: eventRows.slice(0, 25).map((eventRow) => {
            const category = String(eventRow?.properties?.category?.value || 'Event');
            const date = String(eventRow?.properties?.date?.value || '');
            const title = String(
                eventRow?.properties?.description?.value || eventRow?.name || category || 'Event'
            );
            const refs = Object.values(eventRow?.properties || {})
                .map((property) => property?.ref)
                .filter((ref): ref is string => typeof ref === 'string');
            const citations = refs
                .map((ref) => eventCitationMap.get(ref))
                .filter((citation): citation is NonNullable<typeof citation> => !!citation);
            return {
                date,
                category,
                title,
                severity:
                    /bankrupt|default|fraud|regulator|litig/i.test(title) ? ('high' as const) : ('medium' as const),
                citations,
            };
        }) as Array<{
            date: string;
            category: string;
            title: string;
            severity: 'low' | 'medium' | 'high';
            citations: Array<{ ref?: string; url?: string; title?: string; source?: string; date?: string; snippet?: string }>;
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
        lensDetails: scored?.lensDetails ?? {
            solvency: { metrics: [{ label: 'Score', value: '0' }], findings: [] },
            executive: { metrics: [{ label: 'Score', value: '0' }], findings: [] },
            news: { metrics: [{ label: 'Score', value: '0' }], findings: [] },
            market: { metrics: [{ label: 'Score', value: '0' }], findings: [] },
        },
    };

    await writeScoringCache(event, cacheKey, profile);
    return profile;
}

export async function getEntityScoreBreakdown(event: H3Event, portfolioId: string, neid: string) {
    const scored = await scoreEntity(event, portfolioId, neid);
    return {
        scores: scored.scores,
        drivers: scored.drivers,
        conflicts: detectConflicts(
            {
                solvency: scored.scores.solvency,
                executive: scored.scores.executive,
                news: scored.scores.news,
                market: scored.scores.market,
            },
            20
        ),
        confidenceLevel: confidence(scored.scores),
        coverage: scored.coverage,
        lensDetails: scored.lensDetails,
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
