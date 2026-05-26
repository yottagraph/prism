import { getEntityScoreBreakdown } from '~/server/utils/scoring/profile';

export default defineEventHandler(async (event) => {
    const portfolioId = getRouterParam(event, 'id');
    const neid = getRouterParam(event, 'neid');
    if (!portfolioId || !neid) {
        throw createError({ statusCode: 400, statusMessage: 'portfolio id and neid are required' });
    }
    return await getEntityScoreBreakdown(event, portfolioId, neid);
});

