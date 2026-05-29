import type { H3Event, EventHandlerRequest } from 'h3';
import { unsealCookie } from './cookies';

/**
 * Asserts that the request carries a valid auth cookie.
 * Returns the unsealed session payload on success, throws 401 otherwise.
 * When Auth0 is not configured the session is a synthetic stub and this
 * function still succeeds (dev/local mode).
 */
export async function requireAuth(event: H3Event<EventHandlerRequest>) {
    const session = await unsealCookie(event);
    if (!session?.user) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    }
    return session;
}
