/**
 * DELETE /api/diag/elemental-logs?olderThan=<iso>&all=true
 *
 * Purge log rows. Pass `all=true` to truncate the entire store, or
 * `olderThan=<iso>` to drop rows older than the given timestamp. Without
 * either parameter, returns `{ removed: 0 }`.
 *
 * Returns:
 *   { removed: number } — count of rows deleted. `-1` means "all rows
 *   removed" when the FS backend can't count cheaply.
 */
import { unsealCookie } from '../../utils/cookies';
import { purgeElementalCallLogs } from '../../utils/elementalLogStore';

export default defineEventHandler(async (event) => {
    const cookieInfo = await unsealCookie(event);
    if (!cookieInfo?.user) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthenticated' });
    }

    const q = getQuery(event);
    const all = q.all === 'true';
    const olderThan = typeof q.olderThan === 'string' && q.olderThan ? q.olderThan : undefined;

    const removed = await purgeElementalCallLogs({ all, olderThan });
    return { removed };
});
