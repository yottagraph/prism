import { getStockEntityProfile } from '~/server/utils/scoring/stockProfile';
import { requireAuth } from '~/server/utils/requireAuth';

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const portfolioId = getRouterParam(event, 'id');
    const neid = getRouterParam(event, 'neid');
    if (!portfolioId || !neid) {
        throw createError({ statusCode: 400, statusMessage: 'portfolio id and neid are required' });
    }
    const query = getQuery(event);
    const hint = typeof query.name === 'string' ? query.name : undefined;
    return await getStockEntityProfile(event, portfolioId, neid, hint);
});
