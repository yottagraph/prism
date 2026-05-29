import { computeEventPressureScore } from '~/server/utils/scoring/eventPressure';
import { requireAuth } from '~/server/utils/requireAuth';

export default defineEventHandler(async (event) => {
    await requireAuth(event);
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
