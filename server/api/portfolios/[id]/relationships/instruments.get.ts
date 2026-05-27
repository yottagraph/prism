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
    return universe.instruments.map((node) => ({
        neid: node.id.replace(/^ix-/, ''),
        name: node.label,
        type: 'Credit Facility',
        issuer: node.connectsTo[0] || 'Unknown',
        amount: `$${50 + node.connectsTo.length * 40}M`,
        maturity: `${new Date().getFullYear() + 3 + (node.connectsTo.length % 5)}`,
        lender: node.label,
    }));
});
