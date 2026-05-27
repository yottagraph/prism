/**
 * GET /api/diag/elemental-logs/stats
 *
 * Aggregate summary for the Settings → Logs tab header: total calls,
 * error rate, average and p95 duration, top endpoints, top MCP tools,
 * call counts per surface. Honours the same filter query params as
 * the list endpoint where applicable.
 */
import { unsealCookie } from '../../../utils/cookies';
import {
    elementalLogStoreBackend,
    getElementalCallLogStats,
} from '../../../utils/elementalLogStore';

export default defineEventHandler(async (event) => {
    const cookieInfo = await unsealCookie(event);
    if (!cookieInfo?.user) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthenticated' });
    }

    const q = getQuery(event);
    const surface = q.surface === 'qs-rest' || q.surface === 'mcp' ? q.surface : null;
    const origin = q.origin === 'server' || q.origin === 'client' ? q.origin : null;
    const since = typeof q.since === 'string' && q.since ? q.since : null;

    const stats = await getElementalCallLogStats({ surface, origin, since });
    return {
        backend: elementalLogStoreBackend(),
        ...stats,
    };
});
