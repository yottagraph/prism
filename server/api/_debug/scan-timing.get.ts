import { scoreEntity } from '~/server/utils/scoring/scoreEntity';
import { getContextPackage } from '~/server/utils/scoring/contextPackage';
import { isGalaxyEnabled } from '~/server/utils/scoring/galaxy';

export default defineEventHandler(async (event) => {
    const query = getQuery(event);
    const neid = String(query.neid || '');
    const portfolioId = String(query.portfolioId || '_debug');

    if (!neid) {
        throw createError({ statusCode: 400, statusMessage: 'neid query param required' });
    }

    const t0 = performance.now();
    const galaxyEnabled = await isGalaxyEnabled(event);
    const t1 = performance.now();

    const ctx = await getContextPackage(event, neid);
    const t2 = performance.now();

    const result = await scoreEntity(event, portfolioId, neid);
    const t3 = performance.now();

    return {
        neid,
        galaxyEnabled,
        totalMs: Math.round(t3 - t0),
        probeMs: Math.round(t1 - t0),
        fetchMs: Math.round(t2 - t1),
        modulesMs: Math.round(t3 - t2),
        quadCount: ctx.rawQuads.length,
        eventCount: ctx.events.length,
        officerCount: ctx.officers.length,
        directorCount: ctx.directors.length,
        articleCount: ctx.articles.length,
        fusedScore: result.scores.fused,
    };
});
