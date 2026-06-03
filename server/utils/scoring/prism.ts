import type { H3Event } from 'h3';
import { prismFetch } from './galaxy';

export interface PrismSchema {
    properties: Array<{
        pid: string;
        name: string;
        type: 'numerical' | 'categorical' | 'relational';
    }>;
    flavors: Array<{ fid: string; name: string }>;
}

const PRISM_SCHEMA_TTL_MS = 10 * 60_000;
let prismSchemaCache: { schema: PrismSchema; expiresAt: number } | null = null;

export async function getPrismSchema(force = false, event?: H3Event): Promise<PrismSchema> {
    if (!force && prismSchemaCache && prismSchemaCache.expiresAt > Date.now()) {
        return prismSchemaCache.schema;
    }
    const schema = await prismFetch<PrismSchema>({
        path: 'prism/schema',
        method: 'GET',
        caller: 'getPrismSchema',
        reqSummary: { cache: force ? 'force' : 'miss' },
        event,
    });
    prismSchemaCache = { schema, expiresAt: Date.now() + PRISM_SCHEMA_TTL_MS };
    return schema;
}

export async function pidsFor(
    names: string[],
    type: 'numerical' | 'categorical' | 'relational' = 'relational',
    event?: H3Event
): Promise<string[]> {
    const schema = await getPrismSchema(false, event);
    const wanted = new Set(names);
    return schema.properties.filter((p) => p.type === type && wanted.has(p.name)).map((p) => p.pid);
}

export async function findexFor(name: string, event?: H3Event): Promise<string | undefined> {
    const schema = await getPrismSchema(false, event);
    return schema.flavors.find((f) => f.name === name)?.fid;
}

export async function getEntityNames(
    neids: string[],
    event?: H3Event
): Promise<Record<string, string>> {
    if (!neids.length) return {};
    const res = await prismFetch<{ results?: Record<string, string> }>({
        path: 'entities/names',
        method: 'POST',
        body: { neids },
        caller: 'getEntityNames',
        reqSummary: { neids: neids.length },
        event,
    });
    return res?.results ?? {};
}

export interface PrismScanFundamentalsResponse {
    organizations?: Array<Record<string, unknown>>;
}

export async function scanFundamentals(neids: string[], windowDays?: number, event?: H3Event) {
    return prismFetch<PrismScanFundamentalsResponse>({
        path: 'prism/scan-fundamentals',
        method: 'POST',
        body: { neids, ...(windowDays ? { window_days: windowDays } : {}) },
        caller: 'scanFundamentals',
        reqSummary: { neids: neids.length, windowDays },
        event,
    });
}

export interface PrismScanFilingsResponse {
    records?: Array<Record<string, unknown>>;
    coverage?: Record<string, string>;
}

export async function scanFilings(neids: string[], windowDays?: number, event?: H3Event) {
    return prismFetch<PrismScanFilingsResponse>({
        path: 'prism/scan-filings',
        method: 'POST',
        body: { neids, ...(windowDays ? { window_days: windowDays } : {}) },
        caller: 'scanFilings',
        reqSummary: { neids: neids.length, windowDays },
        event,
    });
}

export interface PrismScanEventsResponse {
    records?: Array<Record<string, unknown>>;
    coverage?: Record<string, string>;
}

export async function scanEvents(neids: string[], windowDays?: number, event?: H3Event) {
    return prismFetch<PrismScanEventsResponse>({
        path: 'prism/scan-events',
        method: 'POST',
        body: { neids, ...(windowDays ? { window_days: windowDays } : {}) },
        caller: 'scanEvents',
        reqSummary: { neids: neids.length, windowDays },
        event,
    });
}

export interface PrismScanGovernanceResponse {
    organizations?: Array<Record<string, unknown>>;
}

export async function scanGovernance(neids: string[], event?: H3Event) {
    return prismFetch<PrismScanGovernanceResponse>({
        path: 'prism/scan-governance',
        method: 'POST',
        body: { neids },
        caller: 'scanGovernance',
        reqSummary: { neids: neids.length },
        event,
    });
}

export interface PrismScanNewsResponse {
    relational?: Array<Record<string, unknown>>;
    categorical?: Array<Record<string, unknown>>;
    numerical?: Array<Record<string, unknown>>;
}

export async function scanNews(neids: string[], windowDays?: number, event?: H3Event) {
    return prismFetch<PrismScanNewsResponse>({
        path: 'prism/scan-news',
        method: 'POST',
        body: { neids, ...(windowDays ? { window_days: windowDays } : {}) },
        caller: 'scanNews',
        reqSummary: { neids: neids.length, windowDays },
        event,
    });
}

export interface PrismScanMarketResponse {
    organizations?: Array<Record<string, unknown>>;
}

export async function scanMarket(neids: string[], event?: H3Event) {
    return prismFetch<PrismScanMarketResponse>({
        path: 'prism/scan-market',
        method: 'POST',
        body: { neids },
        caller: 'scanMarket',
        reqSummary: { neids: neids.length },
        event,
    });
}

export interface PrismRelationshipClassRequest {
    name: string;
    pindexes: string[];
    direction?: 'incoming' | 'outgoing' | 'both';
}

export interface PrismRelationshipUniverseResponse {
    classes?: Array<{
        name: string;
        nodes: Array<{ neid: string; name: string; connects_to?: string[]; connectsTo?: string[] }>;
    }>;
    edges?: Array<{ source: string; target: string; relationship: string }>;
}

export async function relationshipUniverse(
    neids: string[],
    classes: PrismRelationshipClassRequest[],
    event?: H3Event
) {
    return prismFetch<PrismRelationshipUniverseResponse>({
        path: 'prism/relationship-universe',
        method: 'POST',
        body: { neids, classes },
        caller: 'relationshipUniverse',
        reqSummary: { neids: neids.length, classes: classes.length },
        event,
    });
}

export interface PrismAcsBundleResponse {
    per_seed?: Array<{
        seed: string;
        traversal?: Array<{
            neid: string;
            name?: string;
            hop?: number;
            parent?: string;
            ownership_percent?: number;
            jurisdiction?: string;
        }>;
    }>;
    screening_list_neids?: string[];
    screening_list_source?: string;
}

export async function acsBundle(
    neids: string[],
    maxDepth = 3,
    screeningFindex?: string,
    event?: H3Event
) {
    return prismFetch<PrismAcsBundleResponse>({
        path: 'prism/acs-bundle',
        method: 'POST',
        body: {
            neids,
            max_depth: maxDepth,
            ...(screeningFindex ? { screening_findex: screeningFindex } : {}),
        },
        caller: 'acsBundle',
        reqSummary: { neids: neids.length, maxDepth, screening: Boolean(screeningFindex) },
        event,
    });
}

export interface PrismStockBundleResponse {
    bundles?: Array<{
        neid: string;
        instrument: {
            neid: string;
            name?: string;
            ticker?: string;
            exchange?: string;
            currency?: string;
            sector?: string;
            industry?: string;
        } | null;
        ohlcv?: Array<{
            date: string;
            open?: number;
            high?: number;
            low?: number;
            close: number;
            volume?: number;
        }>;
        coverage?: 'full' | 'partial' | 'none';
    }>;
}

export async function stockBundle(neids: string[], windowDays = 90, event?: H3Event) {
    return prismFetch<PrismStockBundleResponse>({
        path: 'prism/stock-bundle',
        method: 'POST',
        body: { neids, window_days: windowDays },
        caller: 'stockBundle',
        reqSummary: { neids: neids.length, windowDays },
        event,
    });
}

export interface PrismCikVelocityResponse {
    bundles?: Array<{
        neid: string;
        quarter_counts?: Record<string, number>;
        latest_quarter?: string | null;
        prev_quarter?: string | null;
    }>;
}

export async function cikVelocityBundle(neids: string[], quarters = 16, event?: H3Event) {
    return prismFetch<PrismCikVelocityResponse>({
        path: 'prism/cik-velocity-bundle',
        method: 'POST',
        body: { neids, quarters },
        caller: 'cikVelocityBundle',
        reqSummary: { neids: neids.length, quarters },
        event,
    });
}

export interface PrismOhlcvSeriesResponse {
    series?: Array<{
        neid: string;
        bars?: Array<{
            date: string;
            open?: number;
            high?: number;
            low?: number;
            close?: number;
            volume?: number;
        }>;
    }>;
    coverage?: Record<string, string>;
}

export async function ohlcvSeries(neids: string[], windowDays = 3650, event?: H3Event) {
    return prismFetch<PrismOhlcvSeriesResponse>({
        path: 'prism/ohlcv-series',
        method: 'POST',
        body: { neids, window_days: windowDays },
        caller: 'ohlcvSeries',
        reqSummary: { neids: neids.length, windowDays },
        event,
    });
}

export interface PrismOwnershipTraversalResponse {
    seeds?: Array<{
        seed: string;
        nodes?: Array<{
            neid: string;
            hop: number;
            parent?: string;
            ownership_percent?: number;
            jurisdiction?: string;
        }>;
    }>;
    coverage?: Record<string, string>;
}

export async function ownershipTraversal(
    neids: string[],
    maxHops = 3,
    maxResultsPerSeed = 100,
    event?: H3Event
) {
    return prismFetch<PrismOwnershipTraversalResponse>({
        path: 'prism/ownership-traversal',
        method: 'POST',
        body: { neids, max_hops: maxHops, max_results_per_seed: maxResultsPerSeed },
        caller: 'ownershipTraversal',
        reqSummary: { neids: neids.length, maxHops, maxResultsPerSeed },
        event,
    });
}

export interface PrismEntitySanctionsResponse {
    organizations?: Array<{
        neid: string;
        topics?: string[];
        list_ids?: string[];
        sectors?: string[];
        programs?: string[];
        start_date?: string | null;
    }>;
}

export async function entitySanctions(neids: string[], event?: H3Event) {
    return prismFetch<PrismEntitySanctionsResponse>({
        path: 'prism/entity-sanctions',
        method: 'POST',
        body: { neids },
        caller: 'entitySanctions',
        reqSummary: { neids: neids.length },
        event,
    });
}
