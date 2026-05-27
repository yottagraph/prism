/**
 * GET /api/diag/elemental-logs
 *
 * Paginated read of Elemental API + MCP call logs. Reads from Neon when
 * provisioned, otherwise from the local-FS NDJSON fallback used in
 * `npm run dev`.
 *
 * Query parameters:
 *   limit    (number, default 100, max 500)
 *   offset   (number, default 0)
 *   surface  'qs-rest' | 'mcp'
 *   origin   'server' | 'client'
 *   ok       'true' | 'false' (boolean filter)
 *   search   free-text substring matched against endpoint/tool/caller/server
 *   since    ISO timestamp — only return rows started at or after this point
 */
import { unsealCookie } from '../../utils/cookies';
import { elementalLogStoreBackend, queryElementalCallLogs } from '../../utils/elementalLogStore';

export default defineEventHandler(async (event) => {
    const cookieInfo = await unsealCookie(event);
    if (!cookieInfo?.user) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthenticated' });
    }

    const q = getQuery(event);
    const limit = q.limit != null ? Math.max(1, Math.min(500, Number(q.limit))) : 100;
    const offset = q.offset != null ? Math.max(0, Number(q.offset)) : 0;
    const surface = q.surface === 'qs-rest' || q.surface === 'mcp' ? q.surface : null;
    const origin = q.origin === 'server' || q.origin === 'client' ? q.origin : null;
    const ok = q.ok === 'true' ? true : q.ok === 'false' ? false : null;
    const search = typeof q.search === 'string' && q.search ? q.search : null;
    const since = typeof q.since === 'string' && q.since ? q.since : null;

    const rows = await queryElementalCallLogs({
        limit,
        offset,
        surface,
        origin,
        ok,
        search,
        since,
    });

    return {
        backend: elementalLogStoreBackend(),
        count: rows.length,
        rows,
    };
});
