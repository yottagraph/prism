import type { H3Event } from 'h3';

export interface ElementalSearchMatch {
    neid: string;
    name: string;
    score?: number;
}

export interface ElementalPropertyValue {
    eid?: string;
    pid?: number;
    value?: unknown;
    values?: Array<{ value?: unknown; [key: string]: unknown }>;
    [key: string]: unknown;
}

export interface ElementalSchema {
    flavors: Array<{ fid?: number; findex?: number; name: string }>;
    properties: Array<{ pid?: number; pindex?: number; name: string; type?: string }>;
}

const SCHEMA_TTL_MS = 5 * 60_000;
let schemaCache: { schema: ElementalSchema; expiresAt: number } | null = null;

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

export async function searchEntitiesByName(query: string, maxResults = 3): Promise<ElementalSearchMatch[]> {
    const res = await $fetch<any>(buildUrl('entities/search'), {
        method: 'POST',
        headers: headers(),
        body: {
            queries: [{ queryId: 1, query }],
            includeNames: true,
            maxResults,
        },
    });
    const matches: any[] = res?.results?.[0]?.matches ?? [];
    return matches.map((m) => ({ neid: m.neid, name: m.name || m.neid, score: m.score }));
}

export async function getEntityName(neid: string): Promise<string> {
    const res = await $fetch<{ name?: string }>(buildUrl(`entities/${neid}/name`), {
        headers: headers(),
    });
    return res?.name || neid;
}

export async function getSchema(): Promise<ElementalSchema> {
    if (schemaCache && schemaCache.expiresAt > Date.now()) {
        return schemaCache.schema;
    }

    try {
        const res = await $fetch<any>(buildUrl('elemental/metadata/schema'), {
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

export async function findEntities(expression: object, limit = 50): Promise<string[]> {
    const res = await $fetch<any>(buildUrl('elemental/find'), {
        method: 'POST',
        headers: headers(),
        body: {
            expression: JSON.stringify(expression),
            limit: String(limit),
        },
    });
    return (res?.eids ?? []) as string[];
}

export async function getPropertyValues(
    eids: string[],
    pids: number[],
    includeAttributes = true
): Promise<ElementalPropertyValue[]> {
    const res = await $fetch<any>(buildUrl('elemental/entities/properties'), {
        method: 'POST',
        headers: headers(),
        body: {
            eids: JSON.stringify(eids),
            pids: JSON.stringify(pids),
            include_attributes: String(includeAttributes),
        },
    });
    return (res?.values ?? []) as ElementalPropertyValue[];
}

export function normalizePidMap(schema: ElementalSchema): Record<string, number> {
    const map: Record<string, number> = {};
    for (const p of schema.properties ?? []) {
        const pid = p.pid ?? p.pindex;
        if (typeof pid === 'number' && p.name) map[p.name] = pid;
    }
    return map;
}

export function extractNumeric(values: ElementalPropertyValue[], pid: number): number[] {
    const out: number[] = [];
    for (const row of values) {
        if (row.pid !== pid) continue;
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

export function extractDates(values: ElementalPropertyValue[], pid: number): Date[] {
    const out: Date[] = [];
    for (const row of values) {
        if (row.pid !== pid) continue;
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

