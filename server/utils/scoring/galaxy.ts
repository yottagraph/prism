import type { H3Event } from 'h3';
import { beginElementalLog } from '../elementalLogger';
import { elementalSemaphore } from './semaphore';

export interface GalaxyQuad {
    source: string;
    property: string;
    pid: string;
    destination: string;
    dest_type: 'relational' | 'numerical' | 'categorical' | 'unknown';
    time: string;
}

export interface GalaxyEntityInfo {
    neid: string;
    name: string;
    flavor: string;
    findex: string;
    num_quads: number;
}

export interface GalaxyStats {
    num_entities: number;
    num_flavors: number;
    total_num_quads: number;
    flavor_counts?: Record<string, number>;
}

const BIG_INT_LITERAL_RE = /([:\[,]\s*)(-?\d{16,})(?=\s*[,\]}])/g;

function parseBigIntSafe<T = unknown>(text: string): T {
    const sanitised = text.replace(
        BIG_INT_LITERAL_RE,
        (_match, lead, digits) => `${lead}"${digits}"`
    );
    return JSON.parse(sanitised) as T;
}

function getGatewayConfig() {
    const { public: config } = useRuntimeConfig();
    return {
        gatewayUrl: (config as any).gatewayUrl as string,
        tenantOrgId: (config as any).tenantOrgId as string,
        qsApiKey: (config as any).qsApiKey as string,
    };
}

function buildGalaxyUrl(path: string) {
    const { gatewayUrl, tenantOrgId } = getGatewayConfig();
    if (!gatewayUrl || !tenantOrgId) {
        throw createError({ statusCode: 503, statusMessage: 'Galaxy gateway not configured' });
    }
    return `${gatewayUrl}/api/qs/${tenantOrgId}/${path.replace(/^\//, '')}`;
}

function authHeaders(): Record<string, string> {
    const { qsApiKey } = getGatewayConfig();
    return {
        'Content-Type': 'application/json',
        ...(qsApiKey ? { 'X-Api-Key': qsApiKey } : {}),
    };
}

async function galaxyFetch<T = any>(
    url: string,
    log: { endpoint: string; caller: string; reqSummary?: Record<string, unknown> }
): Promise<T> {
    return elementalSemaphore.run(async () => {
        const logCtx = beginElementalLog({
            surface: 'qs-rest',
            method: 'GET',
            endpoint: log.endpoint,
            caller: log.caller,
            reqSummary: log.reqSummary,
        });
        try {
            const response = await fetch(url, { headers: authHeaders() });
            const text = await response.text();
            if (!response.ok) {
                logCtx.finish({
                    status: response.status,
                    ok: false,
                    resBytes: text.length,
                    error: text,
                });
                throw createError({
                    statusCode: response.status,
                    statusMessage: text || `Galaxy request failed (${response.status})`,
                });
            }
            if (!text) {
                logCtx.finish({ status: response.status, ok: true, resBytes: 0 });
                return undefined as unknown as T;
            }
            const data = parseBigIntSafe<T>(text);
            logCtx.finish({ status: response.status, ok: true, resBytes: text.length });
            return data;
        } catch (error) {
            logCtx.finish({ status: (error as any)?.statusCode ?? 0, ok: false, error });
            throw error;
        }
    });
}

export async function prismFetch<T = any>(options: {
    path: string;
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
    caller: string;
    reqSummary?: Record<string, unknown>;
}): Promise<T> {
    const method = options.method ?? 'POST';
    const endpoint = options.path.replace(/^\//, '');
    const bodyText = options.body ? JSON.stringify(options.body) : undefined;
    const headers = authHeaders();

    return elementalSemaphore.run(async () => {
        const logCtx = beginElementalLog({
            surface: 'qs-rest',
            method,
            endpoint,
            caller: options.caller,
            reqBytes: bodyText?.length ?? 0,
            reqSummary: options.reqSummary,
            reqBody: bodyText,
        });
        try {
            const response = await fetch(buildGalaxyUrl(endpoint), {
                method,
                headers,
                body: bodyText,
            });
            const text = await response.text();
            if (!response.ok) {
                logCtx.finish({
                    status: response.status,
                    ok: false,
                    resBytes: text.length,
                    error: text,
                    resBody: text,
                });
                throw createError({
                    statusCode: response.status,
                    statusMessage: text || `Prism request failed (${response.status})`,
                });
            }
            if (!text) {
                logCtx.finish({ status: response.status, ok: true, resBytes: 0 });
                return undefined as unknown as T;
            }
            const data = parseBigIntSafe<T>(text);
            logCtx.finish({ status: response.status, ok: true, resBytes: text.length });
            return data;
        } catch (error) {
            logCtx.finish({ status: (error as any)?.statusCode ?? 0, ok: false, error });
            throw error;
        }
    });
}

let galaxyEnabledCache: { value: boolean; expiresAt: number } | null = null;
const GALAXY_PROBE_TTL_MS = 5 * 60_000;

/**
 * Immediately expire the enabled-cache so the next `isGalaxyEnabled` call
 * re-probes instead of returning a stale "true". Call this when a Galaxy
 * request fails at runtime to speed up the switch to the Elemental fallback.
 */
export function invalidateGalaxyEnabledCache(): void {
    if (galaxyEnabledCache) galaxyEnabledCache.expiresAt = 0;
}

export async function isGalaxyEnabled(event?: H3Event): Promise<boolean> {
    if (galaxyEnabledCache && galaxyEnabledCache.expiresAt > Date.now()) {
        return galaxyEnabledCache.value;
    }
    try {
        await galaxyFetch<GalaxyStats>(buildGalaxyUrl('galaxy/stats'), {
            endpoint: 'galaxy/stats',
            caller: 'isGalaxyEnabled',
        });
        galaxyEnabledCache = { value: true, expiresAt: Date.now() + GALAXY_PROBE_TTL_MS };
        console.log('[galaxy] capability=enabled');
        return true;
    } catch {
        galaxyEnabledCache = { value: false, expiresAt: Date.now() + GALAXY_PROBE_TTL_MS };
        console.log('[galaxy] capability=disabled (stats probe failed, using fallback path)');
        return false;
    }
}

export async function getGalaxyStats(): Promise<GalaxyStats | null> {
    try {
        return await galaxyFetch<GalaxyStats>(buildGalaxyUrl('galaxy/stats'), {
            endpoint: 'galaxy/stats',
            caller: 'getGalaxyStats',
        });
    } catch {
        return null;
    }
}

export async function getEntityQuads(neid: string): Promise<GalaxyQuad[]> {
    const res = await galaxyFetch<{ quads?: GalaxyQuad[] }>(
        buildGalaxyUrl(`galaxy/${neid}/quads`),
        {
            endpoint: `galaxy/{neid}/quads`,
            caller: 'getEntityQuads',
            reqSummary: { neid },
        }
    );
    return res?.quads ?? [];
}

export async function getEntityInfo(neid: string): Promise<GalaxyEntityInfo | null> {
    try {
        return await galaxyFetch<GalaxyEntityInfo>(buildGalaxyUrl(`galaxy/${neid}/info`), {
            endpoint: `galaxy/{neid}/info`,
            caller: 'getEntityInfo',
            reqSummary: { neid },
        });
    } catch {
        return null;
    }
}

export async function getNeighbors(
    neid: string,
    size = 50
): Promise<{ neighbors: string[]; weights: number[] }> {
    const res = await galaxyFetch<{ neighbors?: string[]; weights?: number[] }>(
        buildGalaxyUrl(`galaxy/${neid}/neighbors?size=${size}`),
        {
            endpoint: `galaxy/{neid}/neighbors`,
            caller: 'getNeighbors',
            reqSummary: { neid, size },
        }
    );
    return {
        neighbors: res?.neighbors ?? [],
        weights: res?.weights ?? [],
    };
}

export async function getPropertyQuadsForEntities(
    pid: string,
    neids: string[]
): Promise<GalaxyQuad[]> {
    const params = new URLSearchParams();
    for (const neid of neids) params.append('neid', neid);
    const url = buildGalaxyUrl(`galaxy/properties/${pid}/quads?${params.toString()}`);
    const res = await galaxyFetch<{ quads?: GalaxyQuad[] }>(url, {
        endpoint: `galaxy/properties/{pid}/quads`,
        caller: 'getPropertyQuadsForEntities',
        reqSummary: { pid, neids: neids.length },
    });
    return res?.quads ?? [];
}

export async function getFlavorEntities(flavor: string): Promise<string[]> {
    try {
        const res = await galaxyFetch<{ entities?: string[] }>(
            buildGalaxyUrl(`galaxy/flavors/${encodeURIComponent(flavor)}/entities`),
            {
                endpoint: `galaxy/flavors/{flavor}/entities`,
                caller: 'getFlavorEntities',
                reqSummary: { flavor },
            }
        );
        return res?.entities ?? [];
    } catch {
        return [];
    }
}
