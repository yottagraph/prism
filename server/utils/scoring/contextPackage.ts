import type { H3Event } from 'h3';

import { getSchema, normalizePidMap, getPropertyValues, extractPropertyFacts } from './elemental';
import type { ElementalPropertyFact, ElementalSchema } from './elemental';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import { getEntityQuads, isGalaxyEnabled, type GalaxyQuad } from './galaxy';

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

const FINANCIAL_PROPERTY_NAMES = [
    'total_assets',
    'assets',
    'us_gaap:assets',
    'total_liabilities',
    'liabilities',
    'us_gaap:liabilities',
    'stockholders_equity',
    'shareholders_equity',
    'partners_capital',
    'us_gaap:stockholders_equity',
    'total_revenue',
    'revenue',
    'us_gaap:revenues',
    'net_income',
    'us_gaap:net_income_loss',
    'current_assets',
    'us_gaap:assets_current',
    'current_liabilities',
    'us_gaap:liabilities_current',
    'cash_and_cash_equivalents',
    'cash',
    'us_gaap:cash_and_cash_equivalents_at_carrying_value',
    'operating_income',
    'us_gaap:operating_income_loss',
    'interest_expense',
    'us_gaap:interest_expense',
    'operating_cash_flow',
    'us_gaap:net_cash_provided_by_used_in_operating_activities',
    'filing_date',
    'report_date',
    'form_type',
    'debt_due_18m',
    'current_portion_long_term_debt',
    'us_gaap:long_term_debt_current',
    'long_term_debt',
    'us_gaap:long_term_debt_noncurrent',
    'sentiment',
    'news_sentiment',
    'article_sentiment',
    'mention_velocity',
    'mentions_30d',
    'article_count',
    'news_count',
    'return_30d',
    'price_change_30d',
    'returns_30d',
    'volatility_30d',
    'realized_volatility',
    'volatility',
    'rsi_14',
    'rsi',
    'market_anomaly',
    'anomaly_flag',
];

async function buildContextPackage(event: H3Event, neid: string): Promise<ContextPackage> {
    const schema = await getSchema(event);
    const pidMap = normalizePidMap(schema);
    const galaxyEnabled = await isGalaxyEnabled(event);

    if (galaxyEnabled) {
        return buildFromGalaxy(event, neid, schema, pidMap);
    }
    return buildFromLegacy(event, neid, schema, pidMap);
}

function groupQuadsByProperty(quads: GalaxyQuad[]): Map<string, GalaxyQuad[]> {
    const map = new Map<string, GalaxyQuad[]>();
    for (const q of quads) {
        const key = q.property;
        const arr = map.get(key);
        if (arr) arr.push(q);
        else map.set(key, [q]);
    }
    return map;
}

function quadsToFacts(quads: GalaxyQuad[]): ElementalPropertyFact[] {
    return quads.map((q) => ({
        value: q.dest_type === 'numerical' ? Number(q.destination) : q.destination,
        date: q.time || undefined,
        ref: undefined,
    }));
}

function extractEventsFromQuads(byProp: Map<string, GalaxyQuad[]>): ContextEvent[] {
    const eventTypeQuads = byProp.get('event_type') ?? [];
    const dateQuads = byProp.get('event_date') ?? byProp.get('date') ?? [];
    const descQuads = byProp.get('description') ?? [];
    const categoryQuads = byProp.get('category') ?? [];
    const snippetQuads = byProp.get('event_snippet') ?? byProp.get('snippet') ?? [];

    const bySource = new Map<string, Partial<ContextEvent>>();
    for (const q of eventTypeQuads) {
        const s = bySource.get(q.source) ?? {};
        s.eventType = q.destination;
        bySource.set(q.source, s);
    }
    for (const q of dateQuads) {
        const s = bySource.get(q.source) ?? {};
        s.date = q.destination || q.time;
        bySource.set(q.source, s);
    }
    for (const q of descQuads) {
        const s = bySource.get(q.source) ?? {};
        s.description = q.destination;
        bySource.set(q.source, s);
    }
    for (const q of categoryQuads) {
        const s = bySource.get(q.source) ?? {};
        s.category = q.destination;
        bySource.set(q.source, s);
    }
    for (const q of snippetQuads) {
        const s = bySource.get(q.source) ?? {};
        s.snippet = q.destination;
        bySource.set(q.source, s);
    }

    return [...bySource.values()].map((partial) => ({
        eventType: partial.eventType ?? '',
        date: partial.date ?? null,
        description: partial.description ?? null,
        snippet: partial.snippet ?? null,
        category: partial.category ?? null,
        ref: null,
        raw: partial as Record<string, unknown>,
    }));
}

function extractRelationshipsFromQuads(
    quads: GalaxyQuad[],
    typeFilter: string[]
): ContextRelationship[] {
    const relational = quads.filter(
        (q) =>
            q.dest_type === 'relational' &&
            typeFilter.some((t) => q.property.toLowerCase().includes(t))
    );
    return relational.map((q) => ({
        neid: q.destination,
        name: q.destination,
        relationshipType: q.property,
        title: null,
        startDate: q.time || null,
        endDate: null,
        ownershipPercentage: null,
        jurisdiction: null,
        ref: null,
        raw: q as unknown as Record<string, unknown>,
    }));
}

function extractArticlesFromQuads(quads: GalaxyQuad[]): ContextArticle[] {
    const articleQuads = quads.filter(
        (q) =>
            q.dest_type === 'relational' &&
            (q.property === 'appears_in' ||
                q.property === 'mentioned_in' ||
                q.property === 'related_article')
    );
    return articleQuads.map((q) => ({
        headline: null,
        source: null,
        publishedDate: q.time || null,
        sentiment: null,
        url: null,
        ref: null,
    }));
}

async function buildFromGalaxy(
    event: H3Event,
    neid: string,
    schema: ElementalSchema,
    pidMap: Record<string, string>
): Promise<ContextPackage> {
    const rawQuads = await getEntityQuads(neid);
    const quadsByProperty = groupQuadsByProperty(rawQuads);

    const financials: Record<string, ElementalPropertyFact[]> = {};
    for (const name of FINANCIAL_PROPERTY_NAMES) {
        const quads = quadsByProperty.get(name);
        if (quads?.length) {
            financials[name] = quadsToFacts(quads);
        }
    }

    const seriesByPid: Record<string, ElementalPropertyFact[]> = {};
    const latestByPid: Record<string, ElementalPropertyFact | null> = {};
    for (const [propName, quads] of quadsByProperty) {
        const pid = pidMap[propName];
        if (!pid) continue;
        const facts = quadsToFacts(quads);
        seriesByPid[propName] = facts;
        if (pid) seriesByPid[pid] = facts;
        latestByPid[propName] = facts[0] ?? null;
        if (pid) latestByPid[pid] = facts[0] ?? null;
    }

    const events = extractEventsFromQuads(quadsByProperty);
    const officers = extractRelationshipsFromQuads(rawQuads, ['officer', 'is_officer']);
    const directors = extractRelationshipsFromQuads(rawQuads, [
        'director',
        'is_director',
        'board_member',
    ]);
    const instruments = extractRelationshipsFromQuads(rawQuads, ['instrument', 'has_instrument']);
    const ownership = extractRelationshipsFromQuads(rawQuads, [
        'beneficial_owner',
        'owned_by',
        'owner',
    ]);
    const subsidiaries = extractRelationshipsFromQuads(rawQuads, ['subsidiary']);
    const articles = extractArticlesFromQuads(rawQuads);

    return {
        neid,
        galaxyEnabled: true,
        schema,
        pidMap,
        financials,
        events,
        officers,
        directors,
        instruments,
        ownership,
        subsidiaries,
        articles,
        rawQuads,
        quadsByProperty,
        seriesByPid,
        latestByPid,
    };
}

interface McpRelRow {
    neid?: string;
    name?: string;
    relationship_types?: string[];
    properties?: Record<string, { value?: unknown; ref?: string }>;
}

interface McpEventRow {
    name?: string;
    properties?: Record<string, { value?: unknown; ref?: string }>;
}

function mcpRelToContext(row: McpRelRow, relType: string): ContextRelationship {
    const ownerVal = row?.properties?.ownership_percentage?.value;
    return {
        neid: String(row?.neid || ''),
        name: String(row?.name || row?.neid || ''),
        relationshipType: relType,
        title: row?.properties?.title?.value ? String(row.properties.title.value) : null,
        startDate: row?.properties?.start_date?.value
            ? String(row.properties.start_date.value)
            : null,
        endDate: row?.properties?.end_date?.value ? String(row.properties.end_date.value) : null,
        ownershipPercentage:
            typeof ownerVal === 'number'
                ? ownerVal
                : typeof ownerVal === 'string'
                  ? Number(ownerVal) || null
                  : null,
        jurisdiction: row?.properties?.jurisdiction?.value
            ? String(row.properties.jurisdiction.value)
            : null,
        ref:
            Object.values(row?.properties || {})
                .map((p) => p?.ref)
                .find((r): r is string => Boolean(r)) ?? null,
        raw: row as unknown as Record<string, unknown>,
    };
}

function mcpEventToContext(row: McpEventRow): ContextEvent {
    return {
        eventType: String(
            row?.properties?.event_type?.value ??
                row?.properties?.category?.value ??
                row?.name ??
                ''
        ),
        date: row?.properties?.event_date?.value
            ? String(row.properties.event_date.value)
            : row?.properties?.date?.value
              ? String(row.properties.date.value)
              : null,
        description: row?.properties?.description?.value
            ? String(row.properties.description.value)
            : null,
        snippet: row?.properties?.event_snippet?.value
            ? String(row.properties.event_snippet.value)
            : row?.properties?.snippet?.value
              ? String(row.properties.snippet.value)
              : null,
        category: row?.properties?.category?.value ? String(row.properties.category.value) : null,
        ref:
            Object.values(row?.properties || {})
                .map((p) => p?.ref)
                .find((r): r is string => Boolean(r)) ?? null,
        raw: row as unknown as Record<string, unknown>,
    };
}

async function buildFromLegacy(
    event: H3Event,
    neid: string,
    schema: ElementalSchema,
    pidMap: Record<string, string>
): Promise<ContextPackage> {
    const resolvedPids: string[] = [];
    for (const name of FINANCIAL_PROPERTY_NAMES) {
        const pid = pidMap[name];
        if (pid && !resolvedPids.includes(pid)) resolvedPids.push(pid);
    }

    const [propValues, relatedResult, eventsResult, articleResult] = await Promise.all([
        resolvedPids.length > 0
            ? getPropertyValues([neid], resolvedPids, true, event)
            : Promise.resolve([]),
        callMcpTool(
            'elemental',
            'elemental_get_related',
            {
                entity_id: { id_type: 'neid', id: neid },
                related_flavor: 'person',
                relationship_types: ['is_officer', 'is_director', 'board_member_of'],
                related_properties: ['title', 'start_date', 'end_date'],
                direction: 'incoming',
                limit: 200,
            },
            event
        ).catch(() => null),
        callMcpTool(
            'elemental',
            'elemental_get_events',
            {
                entity_id: { id_type: 'neid', id: neid },
                limit: 500,
            },
            event
        ).catch(() => null),
        callMcpTool(
            'elemental',
            'elemental_get_related',
            {
                entity_id: { id_type: 'neid', id: neid },
                related_flavor: 'article',
                related_properties: ['headline', 'published_date', 'sentiment', 'source', 'url'],
                direction: 'both',
                limit: 120,
            },
            event
        ).catch(() => null),
    ]);

    const financials: Record<string, ElementalPropertyFact[]> = {};
    const seriesByPid: Record<string, ElementalPropertyFact[]> = {};
    const latestByPid: Record<string, ElementalPropertyFact | null> = {};
    for (const name of FINANCIAL_PROPERTY_NAMES) {
        const pid = pidMap[name];
        if (!pid) continue;
        const facts = extractPropertyFacts(propValues, pid);
        if (facts.length > 0) financials[name] = facts;
        seriesByPid[name] = facts;
        seriesByPid[pid] = facts;
        latestByPid[name] = facts[0] ?? null;
        latestByPid[pid] = facts[0] ?? null;
    }

    const relStructured = extractMcpStructuredContent<{
        relationships?: McpRelRow[];
    }>(relatedResult);
    const relRows = Array.isArray(relStructured?.relationships) ? relStructured.relationships : [];

    const officers: ContextRelationship[] = [];
    const directors: ContextRelationship[] = [];
    for (const row of relRows) {
        const types = (row.relationship_types || []).map((t) => String(t).toLowerCase());
        if (types.some((t) => t.includes('officer'))) {
            officers.push(mcpRelToContext(row, 'officer'));
        }
        if (types.some((t) => t.includes('director') || t.includes('board'))) {
            directors.push(mcpRelToContext(row, 'director'));
        }
    }

    const evStructured = extractMcpStructuredContent<{
        events?: McpEventRow[];
    }>(eventsResult);
    const evRows = Array.isArray(evStructured?.events) ? evStructured.events : [];
    const events = evRows.map(mcpEventToContext);

    const artStructured = extractMcpStructuredContent<{
        relationships?: Array<{
            name?: string;
            properties?: Record<string, { value?: unknown; ref?: string }>;
        }>;
    }>(articleResult);
    const artRows = Array.isArray(artStructured?.relationships) ? artStructured.relationships : [];
    const articles: ContextArticle[] = artRows.map((row) => {
        const sentimentVal = row?.properties?.sentiment?.value;
        let sentiment: number | null = null;
        if (typeof sentimentVal === 'number' && Number.isFinite(sentimentVal)) {
            sentiment = sentimentVal;
        } else if (typeof sentimentVal === 'string') {
            const p = Number(sentimentVal);
            if (Number.isFinite(p)) sentiment = p;
        }
        return {
            headline: row?.properties?.headline?.value
                ? String(row.properties.headline.value)
                : row?.name
                  ? String(row.name)
                  : null,
            source: row?.properties?.source?.value ? String(row.properties.source.value) : null,
            publishedDate: row?.properties?.published_date?.value
                ? String(row.properties.published_date.value)
                : null,
            sentiment,
            url: row?.properties?.url?.value ? String(row.properties.url.value) : null,
            ref:
                Object.values(row?.properties || {})
                    .map((p) => p?.ref)
                    .find((r): r is string => Boolean(r)) ?? null,
        };
    });

    let ownershipResult: ContextRelationship[] = [];
    let subsidiaryResult: ContextRelationship[] = [];
    let instrumentResult: ContextRelationship[] = [];
    try {
        const ownerRes = await callMcpTool(
            'elemental',
            'elemental_get_related',
            {
                entity_id: { id_type: 'neid', id: neid },
                related_flavor: 'organization',
                relationship_types: ['beneficial_owner_of', 'subsidiary_of'],
                direction: 'both',
                limit: 40,
            },
            event
        );
        const ownerStructured = extractMcpStructuredContent<{
            relationships?: McpRelRow[];
        }>(ownerRes);
        const ownerRows = Array.isArray(ownerStructured?.relationships)
            ? ownerStructured.relationships
            : [];
        for (const row of ownerRows) {
            const types = (row.relationship_types || []).map((t) => String(t).toLowerCase());
            if (types.some((t) => t.includes('owner') || t.includes('beneficial'))) {
                ownershipResult.push(mcpRelToContext(row, 'beneficial_owner_of'));
            }
            if (types.some((t) => t.includes('subsidiary'))) {
                subsidiaryResult.push(mcpRelToContext(row, 'subsidiary_of'));
            }
        }
    } catch {
        // Ownership/subsidiary data unavailable
    }

    try {
        const instrRes = await callMcpTool(
            'elemental',
            'elemental_get_related',
            {
                entity_id: { id_type: 'neid', id: neid },
                related_flavor: 'financial_instrument',
                direction: 'both',
                limit: 40,
            },
            event
        );
        const instrStructured = extractMcpStructuredContent<{
            relationships?: McpRelRow[];
        }>(instrRes);
        const instrRows = Array.isArray(instrStructured?.relationships)
            ? instrStructured.relationships
            : [];
        instrumentResult = instrRows.map((row) => mcpRelToContext(row, 'instrument'));
    } catch {
        // Instrument data unavailable
    }

    return {
        neid,
        galaxyEnabled: false,
        schema,
        pidMap,
        financials,
        events,
        officers,
        directors,
        instruments: instrumentResult,
        ownership: ownershipResult,
        subsidiaries: subsidiaryResult,
        articles,
        rawQuads: [],
        quadsByProperty: new Map(),
        seriesByPid,
        latestByPid,
    };
}
