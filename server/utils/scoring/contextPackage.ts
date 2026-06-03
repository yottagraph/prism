import type { H3Event } from 'h3';

import { getSchema, normalizePidMap } from './elemental';
import type { ElementalPropertyFact, ElementalSchema } from './elemental';
import {
    getPrefetchedContextSlice,
    prefetchPortfolioContext,
    type PrefetchedContextSlice,
} from './prefetch';
import type { GalaxyQuad } from './galaxy';

export interface ContextEvent {
    eventType: string;
    date: string | null;
    description: string | null;
    snippet: string | null;
    category: string | null;
    ref: string | null;
    raw: Record<string, unknown>;
}

export interface ContextRelationship {
    neid: string;
    name: string;
    relationshipType: string;
    title: string | null;
    startDate: string | null;
    endDate: string | null;
    ownershipPercentage: number | null;
    jurisdiction: string | null;
    ref: string | null;
    raw: Record<string, unknown>;
}

export interface ContextArticle {
    headline: string | null;
    source: string | null;
    publishedDate: string | null;
    sentiment: number | null;
    url: string | null;
    ref: string | null;
}

export interface ContextPackage {
    neid: string;
    galaxyEnabled: boolean;
    schema: ElementalSchema;
    pidMap: Record<string, string>;

    financials: Record<string, ElementalPropertyFact[]>;
    events: ContextEvent[];
    officers: ContextRelationship[];
    directors: ContextRelationship[];
    instruments: ContextRelationship[];
    ownership: ContextRelationship[];
    subsidiaries: ContextRelationship[];
    articles: ContextArticle[];

    rawQuads: GalaxyQuad[];
    quadsByProperty: Map<string, GalaxyQuad[]>;

    seriesByPid: Record<string, ElementalPropertyFact[]>;
    latestByPid: Record<string, ElementalPropertyFact | null>;
}

function requestContextPackages(event: H3Event): Map<string, Promise<ContextPackage>> {
    const ctx = event.context as Record<string, unknown>;
    if (!ctx.__contextPackages) {
        ctx.__contextPackages = new Map<string, Promise<ContextPackage>>();
    }
    return ctx.__contextPackages as Map<string, Promise<ContextPackage>>;
}

export async function getContextPackage(event: H3Event, neid: string): Promise<ContextPackage> {
    const cache = requestContextPackages(event);
    const existing = cache.get(neid);
    if (existing) return existing;
    const promise = buildContextPackage(event, neid);
    cache.set(neid, promise);
    return promise;
}

async function buildContextPackage(event: H3Event, neid: string): Promise<ContextPackage> {
    const schema = await getSchema(event);
    const pidMap = normalizePidMap(schema);
    let prefetched = getPrefetchedContextSlice(event, neid);
    if (!prefetched) {
        await prefetchPortfolioContext(event, [neid]);
        prefetched = getPrefetchedContextSlice(event, neid);
    }
    if (prefetched) {
        return buildFromPrism(neid, schema, pidMap, prefetched);
    }
    return buildFromPrism(neid, schema, pidMap, {
        neid,
        financials: {},
        events: [],
        officers: [],
        directors: [],
        instruments: [],
        ownership: [],
        subsidiaries: [],
        articles: [],
        seriesByPid: {},
        latestByPid: {},
    });
}

function buildFromPrism(
    neid: string,
    schema: ElementalSchema,
    pidMap: Record<string, string>,
    prefetched: PrefetchedContextSlice
): ContextPackage {
    return {
        neid,
        galaxyEnabled: false,
        schema,
        pidMap,
        financials: prefetched.financials,
        events: prefetched.events,
        officers: prefetched.officers,
        directors: prefetched.directors,
        instruments: prefetched.instruments,
        ownership: prefetched.ownership,
        subsidiaries: prefetched.subsidiaries,
        articles: prefetched.articles,
        rawQuads: [],
        quadsByProperty: new Map(),
        seriesByPid: prefetched.seriesByPid,
        latestByPid: prefetched.latestByPid,
    };
}
