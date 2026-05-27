import { defineNuxtPlugin } from '#app';
import { configureElementalClient } from '@yottagraph-app/elemental-api/config';
import { useUserState } from '~/composables/useUserState';
import { formatUrl } from '~/utils/formatUrl';
import { beginElementalLog } from '~/utils/elementalLogger';

export default defineNuxtPlugin(() => {
    const config = useRuntimeConfig();
    const serverAddress = config.public.queryServerAddress as string;
    const gatewayUrl = (config.public as any).gatewayUrl as string;
    const tenantOrgId = (config.public as any).tenantOrgId as string;
    const qsApiKey = (config.public as any).qsApiKey as string;
    const { accessToken } = useUserState();

    const useProxy = !!(gatewayUrl && tenantOrgId && qsApiKey);
    const baseUrl = useProxy
        ? `${gatewayUrl}/api/qs/${tenantOrgId}`
        : serverAddress
          ? formatUrl(serverAddress)
          : '';

    const endpointFromUrl = (url: string): string => {
        if (baseUrl && url.startsWith(baseUrl)) {
            return url.slice(baseUrl.length).replace(/^\/+/, '') || '/';
        }
        try {
            const u = new URL(url);
            return u.pathname.replace(/^\/+/, '') || '/';
        } catch {
            return url;
        }
    };

    const inferReqSummary = (
        endpoint: string,
        method: string,
        body: string | undefined
    ): Record<string, unknown> => {
        const summary: Record<string, unknown> = {};
        if (!body) return summary;
        if (endpoint === 'entities/search' && method === 'POST') {
            try {
                const parsed = JSON.parse(body);
                summary.queries = Array.isArray(parsed?.queries) ? parsed.queries.length : 0;
                if (parsed?.maxResults != null) summary.maxResults = parsed.maxResults;
            } catch {
                /* ignore */
            }
        } else if (endpoint === 'elemental/find') {
            // body is form-urlencoded; cheap detection only
            const params = new URLSearchParams(body);
            const expr = params.get('expression');
            const limit = params.get('limit');
            if (limit) summary.limit = Number(limit);
            if (expr) {
                try {
                    const parsed = JSON.parse(expr);
                    summary.exprType = parsed?.type ?? 'unknown';
                } catch {
                    /* ignore */
                }
            }
        } else if (endpoint === 'elemental/entities/properties') {
            const params = new URLSearchParams(body);
            const eids = params.get('eids');
            const pids = params.get('pids');
            try {
                if (eids) summary.eids = JSON.parse(eids).length;
            } catch {
                /* ignore */
            }
            try {
                if (pids) summary.pids = JSON.parse(pids).length;
            } catch {
                /* ignore */
            }
        }
        return summary;
    };

    const summarizeResponse = (endpoint: string, data: unknown): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        if (!data || typeof data !== 'object') return out;
        const d = data as any;
        if (endpoint === 'entities/search') {
            const results = Array.isArray(d?.results) ? d.results : [];
            out.results = results.length;
            out.totalMatches = results.reduce(
                (sum: number, row: any) => sum + (row?.matches?.length ?? 0),
                0
            );
        } else if (endpoint === 'elemental/find') {
            out.eids = d?.eids?.length ?? 0;
        } else if (endpoint === 'elemental/entities/properties') {
            out.values = d?.values?.length ?? 0;
        } else if (
            endpoint === 'elemental/metadata/schema' ||
            endpoint === 'schema' ||
            endpoint.endsWith('/schema')
        ) {
            const schema = d?.schema ?? d;
            out.flavors = schema?.flavors?.length ?? 0;
            out.properties = schema?.properties?.length ?? 0;
        } else if (endpoint.startsWith('entities/') && endpoint.endsWith('/name')) {
            out.name = d?.name ?? null;
        }
        return out;
    };

    configureElementalClient({
        baseUrl,
        fetch: async (url: string, options?: RequestInit) => {
            const headers: Record<string, string> = {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...((options?.headers as Record<string, string>) || {}),
            };

            if (useProxy) {
                headers['X-Api-Key'] = qsApiKey;
            } else if (accessToken.value) {
                headers['Authorization'] = `Bearer ${accessToken.value}`;
            }

            const method = (options?.method || 'GET').toUpperCase();
            const endpoint = endpointFromUrl(url);
            const bodyText =
                typeof options?.body === 'string'
                    ? options.body
                    : options?.body instanceof URLSearchParams
                      ? options.body.toString()
                      : undefined;

            const logCtx = beginElementalLog({
                surface: 'qs-rest',
                method,
                endpoint,
                caller: 'useElementalClient',
                reqBytes: bodyText?.length,
                reqSummary: inferReqSummary(endpoint, method, bodyText),
                reqBody: bodyText,
            });

            let response: Response;
            try {
                response = await fetch(url, {
                    ...options,
                    headers,
                    cache: options?.method === 'GET' ? 'default' : 'no-store',
                });
            } catch (err) {
                logCtx.finish({ status: 0, ok: false, error: err });
                throw err;
            }

            let data: unknown;
            let rawText: string | undefined;
            const contentLength = response.headers.get('content-length');
            if (contentLength === '0' || response.status === 204) {
                data = {};
            } else {
                const contentType = response.headers.get('content-type');
                rawText = await response.text();
                if (contentType?.includes('application/json')) {
                    try {
                        data = rawText ? JSON.parse(rawText) : {};
                    } catch (err) {
                        logCtx.finish({
                            status: response.status,
                            ok: false,
                            resBytes: rawText.length,
                            resBody: rawText,
                            error: err,
                        });
                        throw err;
                    }
                } else {
                    data = rawText;
                }
            }

            logCtx.finish({
                status: response.status,
                ok: response.ok,
                resBytes: rawText?.length ?? 0,
                resSummary: summarizeResponse(endpoint, data),
                resBody: rawText,
                error: response.ok ? undefined : `HTTP ${response.status}`,
            });

            return { data, status: response.status, headers: response.headers };
        },
    });
});
