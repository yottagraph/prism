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
        propertyPid?: string,
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
        linkedBy(
            pid.is_officer ?? pid.is_director ?? pid.officer_of ?? pid.director_of,
            'officer_of',
            'people'
        ),
        linkedBy(pid.issued_by ?? pid.lender_of, 'issued_by', 'instruments'),
        linkedBy(pid.is_located_at ?? pid.located_at, 'located_at', 'locations'),
    ]);

    return links;
}

/**
 * Map an Elemental event_type/category string to a display source tag.
 * Most corporate events originate from SEC filings; override for news, stocks, Polymarket.
 */
function inferEventSource(category: string, title: string): string {
    const upper = (category + ' ' + title).toUpperCase();
    if (
        upper.includes('NEWS') ||
        upper.includes('PRESS') ||
        upper.includes('MEDIA') ||
        upper.includes('ARTICLE') ||
        upper.includes('COVERAGE')
    )
        return 'NEWS';
    if (
        upper.includes('STOCK') ||
        upper.includes('PRICE') ||
        upper.includes('TRADING') ||
        upper.includes('MARKET_CAP') ||
        upper.includes('EARNINGS_SURPRISE')
    )
        return 'STOCK';
    if (upper.includes('POLYMARKET') || upper.includes('PREDICTION_MARKET')) return 'POLY';
    return 'SEC';
}

/**
 * Build a one-line status summary from the scored entity for the Overview card.
 */
function buildStatusSummary(scored: any, name: string): string | null {
    if (!scored?.scores) return null;
    const tier: string = scored.scores.tier ?? 'low';
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    const parts: string[] = [`${name} is assessed as ${tierLabel} risk.`];
    if (scored.scores.solvency >= 65) parts.push('Financial health is stressed.');
    if (scored.scores.executive >= 65) parts.push('Governance instability detected.');
    if (scored.monitor?.sanctions?.listed) parts.push('Direct sanctions listing present.');
    if (scored.monitor?.fhs?.totalDistressEvents)
        parts.push(`${scored.monitor.fhs.totalDistressEvents} distress event(s) on record.`);
    return parts.join(' ');
}

export async function getEntityProfile(event: H3Event, portfolioId: string, neid: string) {
    const cacheKey = makeCacheKey(portfolioId, neid, 'profile');
    const cached = await readScoringCache<any>(event, cacheKey);
    if (cached) return cached;

    const name = await getEntityName(neid, event).catch(() => neid);

    // Fetch entity snapshot + descriptive properties
    const entitySnapshot = await callMcpTool(
        'elemental',
        'elemental_get_entity',
        {
            entity_id: { id_type: 'neid', id: neid },
            properties: [
                'ticker_symbol',
                'company_cik',
                'industry',
                'address',
                'headquarters',
                'founded_date',
                'inception_date',
                'num_employees',
                'total_employees',
                'market_cap',
                'market_capitalization',
            ],
        },
        event
    ).catch(() => null);
    const entityData = extractMcpStructuredContent<{
        entity?: {
            flavor?: string;
            properties?: Record<string, { value?: unknown }>;
        };
    }>(entitySnapshot);

    const props = entityData?.entity?.properties ?? {};
    const strProp = (key: string): string | null => {
        const v = props[key]?.value;
        return typeof v === 'string' && v.trim() ? v.trim() : null;
    };

    // Descriptive fields — try multiple aliases per concept
    const headquartersRaw = strProp('headquarters') ?? strProp('address') ?? null;
    const foundedRaw = strProp('founded_date') ?? strProp('inception_date') ?? null;
    const employeesRaw =
        strProp('num_employees') ??
        strProp('total_employees') ??
        (props['num_employees']?.value != null ? String(props['num_employees'].value) : null) ??
        null;
    const marketCapRaw = strProp('market_cap') ?? strProp('market_capitalization') ?? null;

    // Location fallback from relationships (locations bucket)
    let headquartersFromRelationships: string | null = null;
    if (!headquartersRaw) {
        try {
            const relResult = await callMcpTool(
                'elemental',
                'elemental_get_related',
                {
                    entity_id: { id_type: 'neid', id: neid },
                    related_flavor: 'location',
                    relationship_types: ['is_located_at', 'headquartered_at'],
                    direction: 'outgoing',
                    limit: 1,
                },
                event
            );
            const relData = extractMcpStructuredContent<{
                relationships?: Array<{ name?: string }>;
            }>(relResult);
            headquartersFromRelationships = relData?.relationships?.[0]?.name ?? null;
        } catch {
            // Location lookup is best-effort
        }
    }

    const eventsResult = await callMcpTool(
        'elemental',
        'elemental_get_events',
        {
            entity_id: { id_type: 'neid', id: neid },
            limit: 100,
            include_participants: false,
        },
        event
    ).catch(() => null);
    const eventRows =
        extractMcpStructuredContent<{
            events?: Array<{
                name?: string;
                properties?: Record<string, { value?: unknown; ref?: string }>;
            }>;
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

    const headquarters = headquartersRaw ?? headquartersFromRelationships;

    const profile = {
        neid,
        name,
        ticker:
            (entityData?.entity?.properties?.ticker_symbol?.value as string | null | undefined) ??
            null,
        cik:
            (entityData?.entity?.properties?.company_cik?.value as string | null | undefined) ??
            null,
        sector:
            (entityData?.entity?.properties?.industry?.value as string | null | undefined) ?? null,
        entityType: (entityData?.entity?.flavor as string | null | undefined) ?? null,
        descriptive: {
            headquarters,
            founded: foundedRaw,
            employees: employeesRaw,
            marketCap: marketCapRaw,
        },
        statusSummary: buildStatusSummary(scored, name),
        properties: [] as Array<{ pid: string; name: string; value: string | number | null }>,
        relationships,
        // Include scored monitor data so the entity page can read lens sub-objects
        monitor: scored?.monitor ?? null,
        events: eventRows
            .slice(0, 100)
            .map((eventRow) => {
                const category = String(eventRow?.properties?.category?.value || 'Event');
                const date = String(eventRow?.properties?.date?.value || '');
                const title = String(
                    eventRow?.properties?.description?.value ||
                        eventRow?.name ||
                        category ||
                        'Event'
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
                    severity: /bankrupt|default|fraud|regulator|litig|delist|non.relian/i.test(
                        title
                    )
                        ? ('high' as const)
                        : /departure|officer|director|auditor|impair|trigger/i.test(title)
                          ? ('medium' as const)
                          : ('low' as const),
                    source: inferEventSource(category, title),
                    citations,
                };
            })
            .sort((a, b) => {
                if (!a.date && !b.date) return 0;
                if (!a.date) return 1;
                if (!b.date) return -1;
                return b.date.localeCompare(a.date);
            }) as Array<{
            date: string;
            category: string;
            title: string;
            severity: 'low' | 'medium' | 'high';
            source: string;
            citations: Array<{
                ref?: string;
                url?: string;
                title?: string;
                source?: string;
                date?: string;
                snippet?: string;
            }>;
        }>,
        scores: scored?.scores ?? {
            solvency: 0,
            executive: 0,
            news: 0,
            market: 0,
            fused: 0,
            tier: 'low',
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
