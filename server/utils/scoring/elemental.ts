import type { H3Event } from 'h3';

export interface ElementalSearchMatch {
    neid: string;
    name: string;
    score?: number;
}

export interface ElementalPropertyValue {
    eid?: string;
    pid?: string;
    value?: unknown;
    ref?: string;
    recorded_at?: string;
    attributes?: Record<string, unknown>;
    values?: Array<{ value?: unknown; [key: string]: unknown }>;
    [key: string]: unknown;
}

export interface ElementalPropertyFact {
    value: string | number;
    ref?: string;
    date?: string;
    attributes?: Record<string, unknown>;
}

export interface ElementalSchema {
    flavors: Array<{ fid?: string; findex?: string; name: string }>;
    properties: Array<{
        pid?: string;
        pindex?: string;
        name: string;
        type?: string;
        domain_flavors?: string[];
    }>;
}

const SCHEMA_TTL_MS = 5 * 60_000;
let schemaCache: { schema: ElementalSchema; expiresAt: number } | null = null;

type DiagnosticCall = {
    endpoint: string;
    method: 'GET' | 'POST';
    at: number;
    details?: Record<string, unknown>;
};

function recordElementalCall(
    event: H3Event | undefined,
    endpoint: string,
    method: 'GET' | 'POST',
    details?: Record<string, unknown>
) {
    const diagnostics = (event?.context as any)?.scanDiagnostics;
    if (!diagnostics) return;
    diagnostics.endpoints = diagnostics.endpoints || {};
    diagnostics.endpoints[endpoint] = (diagnostics.endpoints[endpoint] || 0) + 1;
    diagnostics.calls = diagnostics.calls || [];
    if (diagnostics.calls.length < 400) {
        const entry: DiagnosticCall = { endpoint, method, at: Date.now(), details };
        diagnostics.calls.push(entry);
    }
}

function getGatewayConfig() {
    const { public: config } = useRuntimeConfig();
    const gatewayUrl = (config as any).gatewayUrl as string;
    const tenantOrgId = (config as any).tenantOrgId as string;
    const qsApiKey = (config as any).qsApiKey as string;
    return { gatewayUrl, tenantOrgId, qsApiKey };
}

function buildUrl(endpoint: string) {
    const { gatewayUrl, tenantOrgId } = getGatewayConfig();
    if (!gatewayUrl || !tenantOrgId) {
        throw createError({ statusCode: 503, statusMessage: 'Elemental gateway not configured' });
    }
    return `${gatewayUrl}/api/qs/${tenantOrgId}/${endpoint.replace(/^\//, '')}`;
}

function headers() {
    const { qsApiKey } = getGatewayConfig();
    return {
        'Content-Type': 'application/json',
        ...(qsApiKey ? { 'X-Api-Key': qsApiKey } : {}),
    };
}

// Elemental returns int64 IDs (pid, eid, fid, efid) as unquoted JSON numbers.
// JavaScript Number only preserves 53 bits, so anything ~> 9e15 silently rounds
// (e.g. close_price pid 7627506139678298689 -> 7627506139678299000). The rounded
// PID will never match an existing property and the response comes back empty.
//
// Strategy: read the raw response text and rewrite any unquoted >=16-digit
// integer literal to a JSON string before parsing. We only rewrite values
// preceded by `:` (object value), `[` (array start), or `,` (array element)
// and followed by `,`, `]`, `}` or whitespace, so price floats like 77.62 are
// untouched.
const BIG_INT_LITERAL_RE = /([:\[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g;

function parseBigIntSafe<T = unknown>(text: string): T {
    const sanitised = text.replace(
        BIG_INT_LITERAL_RE,
        (_match, lead, digits) => `${lead}"${digits}"`
    );
    return JSON.parse(sanitised) as T;
}

async function fetchJsonBig<T = any>(
    url: string,
    init?: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }
): Promise<T> {
    const response = await fetch(url, {
        method: init?.method ?? 'GET',
        headers: init?.headers,
        body: init?.body,
    });
    const text = await response.text();
    if (!response.ok) {
        throw createError({
            statusCode: response.status,
            statusMessage: text || `Elemental request failed (${response.status})`,
        });
    }
    if (!text) return undefined as unknown as T;
    return parseBigIntSafe<T>(text);
}

export async function searchEntitiesByName(
    query: string,
    maxResults = 3,
    event?: H3Event
): Promise<ElementalSearchMatch[]> {
    recordElementalCall(event, 'entities/search', 'POST', { queries: 1, maxResults });
    const res = await fetchJsonBig<any>(buildUrl('entities/search'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
            queries: [{ queryId: 1, query }],
            includeNames: true,
            maxResults,
        }),
    });
    const matches: any[] = res?.results?.[0]?.matches ?? [];
    return matches.map((m) => ({ neid: m.neid, name: m.name || m.neid, score: m.score }));
}

export async function searchEntitiesByNames(
    queries: string[],
    maxResults = 1,
    event?: H3Event
): Promise<Record<string, ElementalSearchMatch[]>> {
    if (!queries.length) return {};
    const payloadQueries = queries.map((query, index) => ({ queryId: index + 1, query }));
    recordElementalCall(event, 'entities/search', 'POST', {
        queries: payloadQueries.length,
        maxResults,
        mode: 'batch',
    });
    const res = await fetchJsonBig<any>(buildUrl('entities/search'), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
            queries: payloadQueries,
            includeNames: true,
            maxResults,
        }),
    });
    const out: Record<string, ElementalSearchMatch[]> = {};
    const results: any[] = Array.isArray(res?.results) ? res.results : [];
    results.forEach((row, index) => {
        const query = queries[index];
        if (!query) return;
        const matches: any[] = row?.matches ?? [];
        out[query] = matches.map((m) => ({ neid: m.neid, name: m.name || m.neid, score: m.score }));
    });
    return out;
}

export async function getEntityName(neid: string, event?: H3Event): Promise<string> {
    recordElementalCall(event, `entities/${neid}/name`, 'GET');
    const res = await fetchJsonBig<{ name?: string }>(buildUrl(`entities/${neid}/name`), {
        headers: headers(),
    });
    return res?.name || neid;
}

export async function getSchema(event?: H3Event): Promise<ElementalSchema> {
    if (schemaCache && schemaCache.expiresAt > Date.now()) {
        recordElementalCall(event, 'elemental/metadata/schema', 'GET', { cache: 'hit' });
        return schemaCache.schema;
    }

    try {
        recordElementalCall(event, 'elemental/metadata/schema', 'GET', { cache: 'miss' });
        const res = await fetchJsonBig<any>(buildUrl('elemental/metadata/schema'), {
            headers: headers(),
        });
        const schema = res?.schema ?? res ?? {};
        const normalized: ElementalSchema = {
            flavors: schema.flavors ?? [],
            properties: schema.properties ?? [],
        };
        schemaCache = { schema: normalized, expiresAt: Date.now() + SCHEMA_TTL_MS };
        return normalized;
    } catch (error) {
        // If schema briefly fails upstream, keep using the last known-good copy.
        if (schemaCache) {
            console.warn('[elemental] schema fetch failed, using cached schema', error);
            return schemaCache.schema;
        }
        throw error;
    }
}

// Build the "pids" JSON-array body parameter without going through JSON.stringify
// on JavaScript numbers (which would corrupt 64-bit integer PIDs). The values
// are inserted as raw int64 literals so the Go-side json.Unmarshal sees the
// exact bit-for-bit integer Elemental gave us in the schema.
function pidListLiteral(pids: string[]): string {
    return `[${pids.join(',')}]`;
}

export async function findEntities(
    expression: object,
    limit = 50,
    event?: H3Event
): Promise<string[]> {
    recordElementalCall(event, 'elemental/find', 'POST', { limit });
    const form = new URLSearchParams();
    // expression may itself contain PIDs that need to survive serialization. We
    // do a final pass to swap any string PID literals back to bare integers.
    form.set('expression', encodeExpressionPreservingBigInts(expression));
    form.set('limit', String(limit));
    const { qsApiKey } = getGatewayConfig();
    const res = await fetchJsonBig<any>(buildUrl('elemental/find'), {
        method: 'POST',
        headers: {
            ...(qsApiKey ? { 'X-Api-Key': qsApiKey } : {}),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
    });
    return (res?.eids ?? []) as string[];
}

// Encode a `linked.pids` style expression where PIDs may be string-form int64
// values. We JSON.stringify, then unquote any "<digits>" that sits inside a
// numeric context so the backend parses them as int64.
function encodeExpressionPreservingBigInts(expression: object): string {
    const text = JSON.stringify(expression);
    return text.replace(/"(-?\d{16,})"/g, (_m, digits) => digits);
}

export async function getPropertyValues(
    eids: string[],
    pids: string[],
    includeAttributes = true,
    event?: H3Event
): Promise<ElementalPropertyValue[]> {
    recordElementalCall(event, 'elemental/entities/properties', 'POST', {
        eids: eids.length,
        pids: pids.length,
        includeAttributes,
    });
    const form = new URLSearchParams();
    form.set('eids', JSON.stringify(eids));
    form.set('pids', pidListLiteral(pids));
    form.set('include_attributes', String(includeAttributes));
    const { qsApiKey } = getGatewayConfig();
    const res = await fetchJsonBig<any>(buildUrl('elemental/entities/properties'), {
        method: 'POST',
        headers: {
            ...(qsApiKey ? { 'X-Api-Key': qsApiKey } : {}),
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
    });
    return (res?.values ?? []) as ElementalPropertyValue[];
}

export function normalizePidMap(schema: ElementalSchema): Record<string, string> {
    const map: Record<string, string> = {};
    for (const p of schema.properties ?? []) {
        const pid = p.pid ?? p.pindex;
        if (pid !== undefined && pid !== null && p.name) map[p.name] = String(pid);
    }
    return map;
}

function pidMatches(row: ElementalPropertyValue, pid: string): boolean {
    return row.pid !== undefined && String(row.pid) === pid;
}

export function extractNumeric(values: ElementalPropertyValue[], pid: string): number[] {
    if (!pid) return [];
    const out: number[] = [];
    for (const row of values) {
        if (!pidMatches(row, pid)) continue;
        const direct = row.value;
        if (typeof direct === 'number' && Number.isFinite(direct)) out.push(direct);
        const nested = Array.isArray(row.values) ? row.values : [];
        for (const valueRow of nested) {
            if (typeof valueRow?.value === 'number' && Number.isFinite(valueRow.value)) {
                out.push(valueRow.value);
            }
        }
    }
    return out;
}

export function extractDates(values: ElementalPropertyValue[], pid: string): Date[] {
    if (!pid) return [];
    const out: Date[] = [];
    for (const row of values) {
        if (!pidMatches(row, pid)) continue;
        const direct = row.value;
        if (typeof direct === 'string') {
            const d = new Date(direct);
            if (!Number.isNaN(d.getTime())) out.push(d);
        }
        const nested = Array.isArray(row.values) ? row.values : [];
        for (const valueRow of nested) {
            if (typeof valueRow?.value === 'string') {
                const d = new Date(valueRow.value);
                if (!Number.isNaN(d.getTime())) out.push(d);
            }
        }
    }
    return out;
}

function coerceFactDate(row: Record<string, unknown> | undefined): string | undefined {
    if (!row) return undefined;
    const direct = row.date ?? row.recorded_at;
    if (typeof direct === 'string' && direct.trim()) return direct;
    const attributes =
        row.attributes && typeof row.attributes === 'object'
            ? (row.attributes as Record<string, unknown>)
            : undefined;
    if (!attributes) return undefined;
    const candidate =
        attributes.date ??
        attributes.filing_date ??
        attributes.report_date ??
        attributes.published_date ??
        attributes.timestamp ??
        attributes.recorded_at;
    return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}

export function extractPropertyFacts(
    values: ElementalPropertyValue[],
    pid: string
): ElementalPropertyFact[] {
    if (!pid) return [];
    const out: ElementalPropertyFact[] = [];
    for (const row of values) {
        if (!pidMatches(row, pid)) continue;
        const rowRef = typeof row.ref === 'string' ? row.ref : undefined;
        const rowDate = coerceFactDate(row as Record<string, unknown>);
        const rowAttributes =
            row.attributes && typeof row.attributes === 'object'
                ? (row.attributes as Record<string, unknown>)
                : undefined;

        if (typeof row.value === 'number' || typeof row.value === 'string') {
            out.push({
                value: row.value,
                ref: rowRef,
                date: rowDate,
                attributes: rowAttributes,
            });
        }

        const nested = Array.isArray(row.values) ? row.values : [];
        for (const nestedRow of nested) {
            const value = nestedRow?.value;
            if (typeof value !== 'number' && typeof value !== 'string') continue;
            const nestedRef = typeof nestedRow?.ref === 'string' ? nestedRow.ref : rowRef;
            const nestedDate = coerceFactDate(nestedRow as Record<string, unknown>) ?? rowDate;
            const nestedAttributes =
                nestedRow?.attributes && typeof nestedRow.attributes === 'object'
                    ? (nestedRow.attributes as Record<string, unknown>)
                    : rowAttributes;
            out.push({
                value,
                ref: nestedRef,
                date: nestedDate,
                attributes: nestedAttributes,
            });
        }
    }
    return out;
}
