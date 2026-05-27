/**
 * Helper utilities for Elemental API / Query Server access.
 *
 * Centralizes gateway URL construction, API key retrieval, and NEID
 * formatting so these don't need to be re-derived in every composable.
 */
import { beginElementalLog } from './elementalLogger';

/**
 * Build a full gateway URL for a Query Server endpoint.
 *
 * @example buildGatewayUrl('entities/search')
 *          → "https://…/api/qs/org_abc123/entities/search"
 */
export function buildGatewayUrl(endpoint: string): string {
    const config = useRuntimeConfig();
    const gw = (config.public as any).gatewayUrl as string;
    const org = (config.public as any).tenantOrgId as string;
    if (!gw || !org) {
        console.warn('[elementalHelpers] gatewayUrl or tenantOrgId not configured');
    }
    const base = `${gw}/api/qs/${org}`;
    return endpoint ? `${base}/${endpoint.replace(/^\//, '')}` : base;
}

/**
 * Return the Query Server API key from runtime config.
 */
export function getApiKey(): string {
    return (useRuntimeConfig().public as any).qsApiKey as string;
}

/**
 * Standard headers for gateway requests.
 */
export function gatewayHeaders(extra?: Record<string, string>): Record<string, string> {
    return {
        'X-Api-Key': getApiKey(),
        'Content-Type': 'application/json',
        ...extra,
    };
}

/**
 * Zero-pad a numeric entity ID to a 20-character NEID string.
 *
 * Relationship properties (`data_nindex`) return raw numeric IDs that are
 * often 19 characters. They must be padded to 20 to form valid NEIDs.
 */
export function padNeid(value: string | number): string {
    return String(value).padStart(20, '0');
}

/**
 * Batch-search entities by name via `POST /entities/search`.
 *
 * This endpoint is not wrapped by the generated `useElementalClient()`,
 * so we call it directly via `$fetch`.
 */
export async function searchEntities(
    query: string,
    options?: { maxResults?: number; flavors?: string[]; includeNames?: boolean }
): Promise<{ neid: string; name: string; score?: number }[]> {
    const url = buildGatewayUrl('entities/search');
    const queryObj: Record<string, any> = { queryId: 1, query };
    if (options?.flavors?.length) queryObj.flavors = options.flavors;

    const body = {
        queries: [queryObj],
        maxResults: options?.maxResults ?? 10,
        includeNames: options?.includeNames ?? true,
    };
    const bodyText = JSON.stringify(body);
    const logCtx = beginElementalLog({
        surface: 'qs-rest',
        method: 'POST',
        endpoint: 'entities/search',
        caller: 'utils/searchEntities',
        reqBytes: bodyText.length,
        reqSummary: {
            query,
            maxResults: body.maxResults,
            flavors: options?.flavors?.length ?? 0,
        },
        reqBody: bodyText,
    });

    try {
        const res = await $fetch<any>(url, {
            method: 'POST',
            headers: gatewayHeaders(),
            body,
        });
        const matches: any[] = res?.results?.[0]?.matches ?? [];
        logCtx.finish({
            status: 200,
            ok: true,
            resSummary: {
                results: res?.results?.length ?? 0,
                matches: matches.length,
            },
            resBody: tryStringify(res),
        });
        return matches.map((m) => ({
            neid: m.neid,
            name: m.name || m.neid,
            score: m.score,
        }));
    } catch (err: any) {
        logCtx.finish({
            status: err?.statusCode ?? err?.response?.status ?? 0,
            ok: false,
            error: err,
        });
        throw err;
    }
}

/**
 * Get the display name for an entity by NEID.
 *
 * Calls `GET /entities/{neid}/name` (not on the generated client).
 */
export async function getEntityName(neid: string): Promise<string> {
    const url = buildGatewayUrl(`entities/${neid}/name`);
    const logCtx = beginElementalLog({
        surface: 'qs-rest',
        method: 'GET',
        endpoint: 'entities/{neid}/name',
        caller: 'utils/getEntityName',
        reqSummary: { neid },
    });
    try {
        const res = await $fetch<{ name: string }>(url, {
            headers: { 'X-Api-Key': getApiKey() },
        });
        logCtx.finish({
            status: 200,
            ok: true,
            resSummary: { name: res?.name ?? null },
            resBody: tryStringify(res),
        });
        return res.name || neid;
    } catch (err: any) {
        logCtx.finish({
            status: err?.statusCode ?? err?.response?.status ?? 0,
            ok: false,
            error: err,
        });
        throw err;
    }
}

function tryStringify(value: unknown): string | undefined {
    try {
        return JSON.stringify(value);
    } catch {
        return undefined;
    }
}
