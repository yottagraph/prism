import { buildPortfolioStockAnalytics } from '~/server/utils/scoring/portfolioStockAnalytics';

function parseEntities(raw: unknown): Array<{ neid: string; name: string }> {
    if (typeof raw !== 'string') return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((row) => row && typeof row.neid === 'string')
            .map((row) => ({ neid: row.neid, name: row.name || row.neid }))
            .slice(0, 20);
    } catch {
        return [];
    }
}

export default defineEventHandler(async (event) => {
    const query = getQuery(event);
    const entities = parseEntities(query.entities);
    if (!entities.length) {
        return buildPortfolioStockAnalytics(event, getRouterParam(event, 'id') || 'unknown', []);
    }
    const portfolioId = getRouterParam(event, 'id') || 'unknown';
    return buildPortfolioStockAnalytics(event, portfolioId, entities);
});
