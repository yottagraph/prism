import { computeEventPressureScore } from '~/server/utils/scoring/eventPressure';

export default defineEventHandler(async (event) => {
    const portfolioId = getRouterParam(event, 'id');
    const neid = getRouterParam(event, 'neid');
    if (!portfolioId || !neid) {
        throw createError({ statusCode: 400, statusMessage: 'Missing portfolio id or neid' });
    }

    const result = await computeEventPressureScore(event, portfolioId, neid);
    return {
        neid,
        score: result.score,
        hasRealData: result.hasRealData,
        detail: result.detail,
        updatedAt: Date.now(),
    };
});
