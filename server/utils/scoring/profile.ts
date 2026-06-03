import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { confidence, detectConflicts } from './fuse';
import { resolveRefs } from './citations';
import { getContextPackage } from './contextPackage';
import {
    extractPropertyFacts,
    findEntities,
    getEntityName,
    getPropertyValues,
    getSchema,
    normalizePidMap,
} from './elemental';
import { scoreEntity } from './scoreEntity';
import type { CitationRef, ScoreComputationResult } from './types';

export interface EntityProfileEvent {
    date: string;
    category: string;
    title: string;
    severity: 'low' | 'medium' | 'high';
    source: string;
    citations: CitationRef[];
}

export interface EntityProfile {
    neid: string;
    name: string;
    ticker: string | null;
    cik: string | null;
    sector: string | null;
    entityType: string | null;
    descriptive: {
        headquarters: string | null;
        founded: string | null;
        employees: string | null;
        marketCap: string | null;
    };
    statusSummary: string | null;
    properties: Array<{ pid: string; name: string; value: string | number | null }>;
    relationships: Awaited<ReturnType<typeof getRelationships>>;
    monitor: NonNullable<ScoreComputationResult['monitor']> | null;
    events: EntityProfileEvent[];
    scores: ScoreComputationResult['scores'];
    drivers: ScoreComputationResult['drivers'];
    conflicts: ScoreComputationResult['conflicts'];
    confidenceLevel: ScoreComputationResult['confidenceLevel'];
    lensDetails: ScoreComputationResult['lensDetails'];
}

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

function inferEventSeverity(title: string): 'low' | 'medium' | 'high' {
    if (/bankrupt|default|fraud|regulator|litig|delist|non.relian/i.test(title)) return 'high';
    if (/departure|officer|director|auditor|impair|trigger/i.test(title)) return 'medium';
    return 'low';
}

function toTimestamp(date: string): number | null {
    if (!date) return null;
    const parsed = Date.parse(date);
    return Number.isFinite(parsed) ? parsed : null;
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

export async function getEntityProfile(
    event: H3Event,
    portfolioId: string,
    neid: string,
    precomputedScoring?: ScoreComputationResult
): Promise<EntityProfile> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'profile');
    const cached = await readScoringCache<EntityProfile>(event, cacheKey);
    if (cached) return cached;

    const name = await getEntityName(neid, event).catch(() => neid);
    const now = new Date();
    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsAgoMs = threeMonthsAgo.getTime();

    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoMs = oneYearAgo.getTime();

    const relationships = await getRelationships(event, neid).catch(() => ({
        companies: [],
        people: [],
        instruments: [],
        locations: [],
    }));
    const ctx = await getContextPackage(event, neid).catch(() => null);

    const schema = await getSchema(event).catch(() => ({ flavors: [], properties: [] }));
    const pid = normalizePidMap(schema);
    const wantedProps = [
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
    ];
    const wantedPids = wantedProps
        .map((key) => pid[key])
        .filter((value): value is string => Boolean(value));
    const entityValues =
        wantedPids.length > 0
            ? await getPropertyValues([neid], wantedPids, true, event).catch(() => [])
            : [];

    const latestString = (...keys: string[]): string | null => {
        for (const key of keys) {
            const propertyPid = pid[key];
            if (!propertyPid) continue;
            const facts = extractPropertyFacts(entityValues, propertyPid);
            if (!facts.length) continue;
            const sorted = [...facts].sort((a, b) => {
                const ad = a.date ? Date.parse(a.date) : 0;
                const bd = b.date ? Date.parse(b.date) : 0;
                return bd - ad;
            });
            const value = sorted.find((fact) => fact.value != null)?.value;
            if (typeof value === 'string' && value.trim()) return value.trim();
            if (typeof value === 'number' && Number.isFinite(value)) return String(value);
        }
        return null;
    };

    // Descriptive fields — try multiple aliases per concept.
    const headquartersRaw = latestString('headquarters', 'address');
    const foundedRaw = latestString('founded_date', 'inception_date');
    const employeesRaw = latestString('num_employees', 'total_employees');
    const marketCapRaw = latestString('market_cap', 'market_capitalization');
    const tickerRaw = latestString('ticker_symbol');
    const cikRaw = latestString('company_cik');
    const sectorRaw = latestString('industry');

    const headquartersFromRelationships = relationships.locations[0]?.name ?? null;
    const contextEvents = ctx?.events ?? [];
    const eventRefs = contextEvents
        .map((eventRow) => eventRow.ref)
        .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);
    const eventCitationMap = await resolveRefs(eventRefs, event).catch(() => new Map());

    const scored =
        precomputedScoring ?? (await scoreEntity(event, portfolioId, neid).catch(() => null));

    const headquarters = headquartersRaw ?? headquartersFromRelationships;

    const profile: EntityProfile = {
        neid,
        name,
        ticker: tickerRaw,
        cik: cikRaw,
        sector: sectorRaw,
        entityType: null,
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
        events: contextEvents
            .map((eventRow) => {
                const category = String(eventRow.category || eventRow.eventType || 'Event');
                const date = eventRow.date ?? '';
                const title = String(
                    eventRow.description ||
                        eventRow.snippet ||
                        eventRow.eventType ||
                        category ||
                        'Event'
                );
                const citations = eventRow.ref
                    ? [eventCitationMap.get(eventRow.ref)].filter(
                          (citation): citation is NonNullable<typeof citation> => !!citation
                      )
                    : [];
                const severity = inferEventSeverity(title);
                const source = inferEventSource(category, title);
                const timestampMs = toTimestamp(date);
                const isSecCritical =
                    severity === 'high' || /critical/i.test(`${category} ${title}`);
                return {
                    date,
                    category,
                    title,
                    severity,
                    source,
                    timestampMs,
                    isSecCritical,
                    citations,
                };
            })
            .filter((eventItem) => {
                if (eventItem.timestampMs == null) return false;
                if (
                    eventItem.source === 'NEWS' ||
                    eventItem.source === 'STOCK' ||
                    eventItem.source === 'POLY'
                ) {
                    return eventItem.timestampMs >= threeMonthsAgoMs;
                }
                if (eventItem.source === 'SEC') {
                    return eventItem.isSecCritical && eventItem.timestampMs >= oneYearAgoMs;
                }
                return false;
            })
            .sort((a, b) => {
                if (a.timestampMs == null && b.timestampMs == null) return 0;
                if (a.timestampMs == null) return 1;
                if (b.timestampMs == null) return -1;
                if (a.timestampMs === b.timestampMs) return b.date.localeCompare(a.date);
                return b.timestampMs - a.timestampMs;
            })
            .slice(0, 100)
            .map(({ timestampMs: _timestampMs, isSecCritical: _isSecCritical, ...rest }) => rest),
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
