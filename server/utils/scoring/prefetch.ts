import type { H3Event } from 'h3';

import type { ContextArticle, ContextEvent, ContextRelationship } from './contextPackage';
import type { ElementalPropertyFact } from './elemental';
import {
    scanEvents,
    scanFilings,
    scanFundamentals,
    scanGovernance,
    scanNews,
    type PrismScanFundamentalsResponse,
    type PrismScanGovernanceResponse,
    type PrismScanNewsResponse,
} from './prism';

export interface PrefetchedContextSlice {
    neid: string;
    financials: Record<string, ElementalPropertyFact[]>;
    events: ContextEvent[];
    officers: ContextRelationship[];
    directors: ContextRelationship[];
    instruments: ContextRelationship[];
    ownership: ContextRelationship[];
    subsidiaries: ContextRelationship[];
    articles: ContextArticle[];
    seriesByPid: Record<string, ElementalPropertyFact[]>;
    latestByPid: Record<string, ElementalPropertyFact | null>;
}

type AnyRow = Record<string, unknown>;

function asString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
}

function asNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function rowNeid(row: AnyRow): string | null {
    return (
        asString(row.neid) ??
        asString(row.entity_neid) ??
        asString(row.entity) ??
        asString(row.organization_neid) ??
        asString(row.seed)
    );
}

function fact(value: string | number, date?: string | null): ElementalPropertyFact {
    return {
        value,
        date: date ?? undefined,
        ref: undefined,
    };
}

function emptySlice(neid: string): PrefetchedContextSlice {
    return {
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
    };
}

function requestPrefetchStore(event: H3Event): Map<string, PrefetchedContextSlice> {
    const ctx = event.context as Record<string, unknown>;
    if (!ctx.__prismPrefetchSlices) {
        ctx.__prismPrefetchSlices = new Map<string, PrefetchedContextSlice>();
    }
    return ctx.__prismPrefetchSlices as Map<string, PrefetchedContextSlice>;
}

function ensureSlice(
    store: Map<string, PrefetchedContextSlice>,
    neid: string
): PrefetchedContextSlice {
    const existing = store.get(neid);
    if (existing) return existing;
    const created = emptySlice(neid);
    store.set(neid, created);
    return created;
}

function pushFact(slice: PrefetchedContextSlice, key: string, next: ElementalPropertyFact) {
    const arr = slice.financials[key] ?? [];
    arr.push(next);
    slice.financials[key] = arr;
    slice.seriesByPid[key] = arr;
    slice.latestByPid[key] = arr[0] ?? null;
}

function extractFundamentalsRow(slice: PrefetchedContextSlice, row: AnyRow) {
    for (const [groupKey, raw] of Object.entries(row)) {
        if (groupKey === 'neid' || !Array.isArray(raw)) continue;
        for (const item of raw) {
            if (!item || typeof item !== 'object') continue;
            const r = item as AnyRow;
            const property = asString(r.property) ?? groupKey;
            const date = asString(r.time) ?? asString(r.date) ?? asString(r.recorded_at);
            const n = asNumber(r.value);
            const s = asString(r.value);
            if (n != null) {
                pushFact(slice, property, fact(n, date));
                if (property !== groupKey) pushFact(slice, groupKey, fact(n, date));
            } else if (s) {
                pushFact(slice, property, fact(s, date));
                if (property !== groupKey) pushFact(slice, groupKey, fact(s, date));
            }
        }
    }

    const values = (row.values ?? row.fundamentals ?? row.metrics) as unknown;
    if (values && typeof values === 'object' && !Array.isArray(values)) {
        for (const [key, raw] of Object.entries(values as Record<string, unknown>)) {
            if (Array.isArray(raw)) {
                for (const item of raw) {
                    if (item && typeof item === 'object') {
                        const r = item as Record<string, unknown>;
                        const n = asNumber(r.value);
                        const s = asString(r.value);
                        const d = asString(r.date) ?? asString(r.time) ?? asString(r.recorded_at);
                        if (n != null) pushFact(slice, key, fact(n, d));
                        else if (s) pushFact(slice, key, fact(s, d));
                    }
                }
                continue;
            }
            if (raw && typeof raw === 'object') {
                const r = raw as Record<string, unknown>;
                const n = asNumber(r.value);
                const s = asString(r.value);
                const d = asString(r.date) ?? asString(r.time) ?? asString(r.recorded_at);
                if (n != null) pushFact(slice, key, fact(n, d));
                else if (s) pushFact(slice, key, fact(s, d));
                continue;
            }
            const n = asNumber(raw);
            const s = asString(raw);
            if (n != null) pushFact(slice, key, fact(n));
            else if (s) pushFact(slice, key, fact(s));
        }
    }
}

function sortFacts(slice: PrefetchedContextSlice) {
    for (const [key, arr] of Object.entries(slice.financials)) {
        arr.sort((a, b) => {
            const ad = a.date ? Date.parse(a.date) : 0;
            const bd = b.date ? Date.parse(b.date) : 0;
            return bd - ad;
        });
        slice.seriesByPid[key] = arr;
        slice.latestByPid[key] = arr[0] ?? null;
    }
}

function extractFilings(rows: AnyRow[], store: Map<string, PrefetchedContextSlice>) {
    for (const row of rows) {
        const neid = rowNeid(row);
        if (!neid) continue;
        const slice = ensureSlice(store, neid);
        const formType = asString(row.form_type) ?? asString(row.filing_type);
        const filingDate = asString(row.time) ?? asString(row.filing_date) ?? asString(row.date);
        if (formType) pushFact(slice, 'form_type', fact(formType, filingDate));
        if (filingDate) {
            pushFact(slice, 'filing_date', fact(filingDate, filingDate));
            pushFact(slice, 'report_date', fact(filingDate, filingDate));
        }
    }
}

function extractEvents(rows: AnyRow[], store: Map<string, PrefetchedContextSlice>) {
    for (const row of rows) {
        const neid = rowNeid(row);
        if (!neid) continue;
        const slice = ensureSlice(store, neid);
        const eventType =
            asString(row.event_type) ?? asString(row.category) ?? asString(row.event) ?? '';
        const date = asString(row.time) ?? asString(row.event_date) ?? asString(row.date);
        const description = asString(row.description);
        const category = asString(row.category);
        slice.events.push({
            eventType,
            date,
            description,
            snippet: null,
            category,
            ref: null,
            raw: row,
        });
    }
}

function rel(neid: string, row: AnyRow, relationshipType: string): ContextRelationship {
    return {
        neid: asString(row.related_neid) ?? asString(row.neighbor) ?? asString(row.neid) ?? '',
        name:
            asString(row.name) ??
            asString(row.related_name) ??
            asString(row.related_neid) ??
            'Unknown',
        relationshipType,
        title: asString(row.title),
        startDate: asString(row.start_date),
        endDate: asString(row.end_date),
        ownershipPercentage: asNumber(row.ownership_percent) ?? asNumber(row.ownership_percentage),
        jurisdiction: asString(row.jurisdiction),
        ref: null,
        raw: row,
    };
}

function extractGovernance(rows: AnyRow[], store: Map<string, PrefetchedContextSlice>) {
    for (const row of rows) {
        const neid = rowNeid(row);
        if (!neid) continue;
        const slice = ensureSlice(store, neid);
        const officers = Array.isArray(row.officers) ? (row.officers as AnyRow[]) : [];
        const directors = Array.isArray(row.directors) ? (row.directors as AnyRow[]) : [];
        for (const o of officers) slice.officers.push(rel(neid, o, 'officer'));
        for (const d of directors) slice.directors.push(rel(neid, d, 'director'));
    }
}

function extractGovernanceRecords(rows: AnyRow[], store: Map<string, PrefetchedContextSlice>) {
    for (const row of rows) {
        const orgNeid = rowNeid(row);
        if (!orgNeid) continue;
        const role = (asString(row.role) ?? '').toLowerCase();
        if (role !== 'officer' && role !== 'director') continue;
        const slice = ensureSlice(store, orgNeid);
        const status = (asString(row.status) ?? '').toLowerCase();
        const title = asString(row.title);
        const personNeid = asString(row.person) ?? '';
        const seenAt = asString(row.latest_seen) ?? asString(row.time) ?? asString(row.date);
        const person: ContextRelationship = {
            neid: personNeid,
            name: asString(row.person_name) ?? asString(row.person) ?? 'Unknown',
            relationshipType: role,
            title,
            startDate: asString(row.first_seen),
            endDate: status === 'departed' ? seenAt : null,
            ownershipPercentage: null,
            jurisdiction: null,
            ref: null,
            raw: row,
        };
        if (role === 'officer') slice.officers.push(person);
        else slice.directors.push(person);
    }
}

function extractNews(rows: AnyRow[], store: Map<string, PrefetchedContextSlice>) {
    for (const row of rows) {
        const neid = rowNeid(row);
        if (!neid) continue;
        const slice = ensureSlice(store, neid);
        const property = asString(row.property) ?? '';
        const destination = asString(row.destination);
        const date = asString(row.time) ?? asString(row.date);
        if (property === 'headline' || property.includes('article')) {
            slice.articles.push({
                headline: destination,
                source: asString(row.source_name),
                publishedDate: date,
                sentiment: asNumber(row.sentiment),
                url: asString(row.url),
                ref: null,
            });
        }
        if (property.includes('sentiment')) {
            const n = asNumber(row.destination) ?? asNumber(row.value);
            if (n != null) pushFact(slice, 'sentiment', fact(n, date));
        }
        if (
            property.includes('mention') ||
            property.includes('article_count') ||
            property.includes('news_count')
        ) {
            const n = asNumber(row.destination) ?? asNumber(row.value);
            if (n != null) pushFact(slice, property, fact(n, date));
        }
    }
}

function extractNewsQuads(
    relationalRows: AnyRow[],
    categoricalRows: AnyRow[],
    numericalRows: AnyRow[],
    store: Map<string, PrefetchedContextSlice>
) {
    const articleByEntity = new Map<string, Map<string, string | null>>();
    for (const row of relationalRows) {
        const entityNeid = asString(row.source);
        const articleNeid = asString(row.destination);
        if (!entityNeid || !articleNeid) continue;
        if ((asString(row.property) ?? '') !== 'appears_in') continue;
        const articles = articleByEntity.get(entityNeid) ?? new Map<string, string | null>();
        articles.set(articleNeid, asString(row.time) ?? asString(row.date));
        articleByEntity.set(entityNeid, articles);
    }

    const articleMeta = new Map<
        string,
        {
            headline: string | null;
            source: string | null;
            publishedDate: string | null;
            sentiment: number | null;
        }
    >();
    const ensureArticle = (articleNeid: string) => {
        const existing = articleMeta.get(articleNeid);
        if (existing) return existing;
        const created = { headline: null, source: null, publishedDate: null, sentiment: null };
        articleMeta.set(articleNeid, created);
        return created;
    };

    for (const row of categoricalRows) {
        const articleNeid = asString(row.source);
        if (!articleNeid) continue;
        const property = asString(row.property) ?? '';
        const value = asString(row.value);
        const meta = ensureArticle(articleNeid);
        if ((property === 'headline' || property === 'title') && value) {
            meta.headline = value;
            meta.publishedDate = meta.publishedDate ?? asString(row.time) ?? asString(row.date);
        }
        if ((property === 'source' || property === 'source_name') && value) meta.source = value;
        if ((property === 'published_date' || property === 'publication_date') && value) {
            meta.publishedDate = value;
        }
    }

    for (const row of numericalRows) {
        const articleNeid = asString(row.source);
        if (!articleNeid) continue;
        const property = asString(row.property) ?? '';
        const value = asNumber(row.value);
        if (property === 'sentiment' && value != null) ensureArticle(articleNeid).sentiment = value;
    }

    for (const [entityNeid, articles] of articleByEntity) {
        const slice = ensureSlice(store, entityNeid);
        let latestDate: string | null = null;
        for (const [articleNeid, relationDate] of articles) {
            const meta = articleMeta.get(articleNeid);
            const publishedDate = meta?.publishedDate ?? relationDate;
            if (publishedDate && (!latestDate || publishedDate > latestDate))
                latestDate = publishedDate;
            if (meta?.sentiment != null)
                pushFact(slice, 'sentiment', fact(meta.sentiment, publishedDate));
            slice.articles.push({
                headline: meta?.headline ?? null,
                source: meta?.source ?? null,
                publishedDate,
                sentiment: meta?.sentiment ?? null,
                url: null,
                ref: null,
            });
        }
        const countDate = latestDate ?? undefined;
        pushFact(slice, 'article_count', fact(articles.size, countDate));
        pushFact(slice, 'news_count', fact(articles.size, countDate));
        pushFact(slice, 'mentions_30d', fact(articles.size, countDate));
    }
}

export async function prefetchPortfolioContext(event: H3Event, neids: string[]): Promise<void> {
    const unique = Array.from(new Set(neids.filter(Boolean)));
    if (!unique.length) return;
    const store = requestPrefetchStore(event);

    const [fundamentalsRes, filingsRes, eventsRes, governanceRes, newsRes] = await Promise.all([
        scanFundamentals(unique, 540, event).catch(
            (): PrismScanFundamentalsResponse => ({ organizations: [] })
        ),
        scanFilings(unique, 730, event).catch(() => ({ records: [] })),
        scanEvents(unique, 730, event).catch(() => ({ records: [] })),
        scanGovernance(unique, event).catch(
            (): PrismScanGovernanceResponse => ({ organizations: [] })
        ),
        scanNews(unique, 90, event).catch(
            (): PrismScanNewsResponse => ({
                relational: [],
                categorical: [],
                numerical: [],
            })
        ),
    ]);

    const fundamentalsRows = [
        ...(Array.isArray(fundamentalsRes.organizations)
            ? (fundamentalsRes.organizations as AnyRow[])
            : []),
        ...(Array.isArray(fundamentalsRes.per_org) ? (fundamentalsRes.per_org as AnyRow[]) : []),
    ];
    for (const row of fundamentalsRows) {
        const neid = rowNeid(row);
        if (!neid) continue;
        const slice = ensureSlice(store, neid);
        extractFundamentalsRow(slice, row);
    }

    extractFilings(
        Array.isArray(filingsRes.records) ? (filingsRes.records as AnyRow[]) : [],
        store
    );
    extractEvents(Array.isArray(eventsRes.records) ? (eventsRes.records as AnyRow[]) : [], store);
    const governanceOrganizations = Array.isArray(governanceRes.organizations)
        ? (governanceRes.organizations as AnyRow[])
        : [];
    if (governanceOrganizations.length > 0) {
        extractGovernance(governanceOrganizations, store);
    } else {
        extractGovernanceRecords(
            Array.isArray(governanceRes.records) ? (governanceRes.records as AnyRow[]) : [],
            store
        );
    }
    const legacyNewsRows = [
        ...(Array.isArray(newsRes.relational) ? (newsRes.relational as AnyRow[]) : []),
        ...(Array.isArray(newsRes.categorical) ? (newsRes.categorical as AnyRow[]) : []),
        ...(Array.isArray(newsRes.numerical) ? (newsRes.numerical as AnyRow[]) : []),
    ];
    extractNews(legacyNewsRows, store);
    extractNewsQuads(
        Array.isArray(newsRes.relational_quads) ? (newsRes.relational_quads as AnyRow[]) : [],
        Array.isArray(newsRes.categorical_quads) ? (newsRes.categorical_quads as AnyRow[]) : [],
        Array.isArray(newsRes.numerical_quads) ? (newsRes.numerical_quads as AnyRow[]) : [],
        store
    );

    for (const neid of unique) sortFacts(ensureSlice(store, neid));
}

export function getPrefetchedContextSlice(
    event: H3Event,
    neid: string
): PrefetchedContextSlice | null {
    const store = requestPrefetchStore(event);
    return store.get(neid) ?? null;
}
