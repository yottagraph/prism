import { getStockEntityProfile } from '~/server/utils/scoring/stockProfile';

export default defineEventHandler(async (event) => {
    const portfolioId = getRouterParam(event, 'id');
    const neid = getRouterParam(event, 'neid');
    if (!portfolioId || !neid) {
        throw createError({ statusCode: 400, statusMessage: 'portfolio id and neid are required' });
    }
    return await getStockEntityProfile(event, portfolioId, neid);
});
