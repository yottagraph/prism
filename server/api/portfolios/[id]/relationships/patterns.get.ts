import { detectPortfolioPatterns } from '~/server/utils/scoring/patternDetection';
import { buildRelationshipUniverse } from '~/server/utils/scoring/relationships';

function parseEntities(raw: unknown): Array<{ neid: string; name: string }> {
    if (typeof raw !== 'string') return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((row) => row && typeof row.neid === 'string')
            .map((row) => ({ neid: row.neid, name: row.name || row.neid }));
    } catch {
        return [];
    }
}

export default defineEventHandler(async (event) => {
    const query = getQuery(event);
    const entities = parseEntities(query.entities);
    if (!entities.length) return [];
    const universe = await buildRelationshipUniverse(event, entities);
    return detectPortfolioPatterns(universe);
});
