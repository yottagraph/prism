import { getEntityEvents } from '~/server/utils/scoring/profile';
import { requireAuth } from '~/server/utils/requireAuth';

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const portfolioId = getRouterParam(event, 'id');
    const neid = getRouterParam(event, 'neid');
    if (!portfolioId || !neid) {
        throw createError({ statusCode: 400, statusMessage: 'portfolio id and neid are required' });
    }
    return await getEntityEvents(event, portfolioId, neid);
});
