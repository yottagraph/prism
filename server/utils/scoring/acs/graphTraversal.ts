import type { H3Event } from 'h3';

import type { ContextPackage } from '../contextPackage';
import { ownershipTraversal } from '../prism';
import type { TraversedNode } from './types';

export async function traverseOwnershipGraph(
    event: H3Event,
    neid: string,
    maxDepth = 3,
    ctx?: ContextPackage
): Promise<TraversedNode[]> {
    try {
        const res = await ownershipTraversal([neid], maxDepth, 100);
        const seedRows = Array.isArray(res?.seeds) ? res.seeds : [];
        const seed = seedRows.find((row) => row.seed === neid) ?? seedRows[0];
        if (seed?.nodes?.length) {
            return seed.nodes.map((row) => ({
                neid: row.neid,
                name: row.neid,
                hopDistance: row.hop,
                relationshipType: 'ownership',
                ownershipPercentage: row.ownership_percent ?? null,
                jurisdiction: row.jurisdiction ?? null,
            }));
        }
    } catch (error) {
        console.warn('[acs] ownership-traversal failed', error);
    }
    if (ctx) {
        return [...ctx.ownership, ...ctx.subsidiaries].map((rel) => ({
            neid: rel.neid,
            name: rel.name,
            hopDistance: 1,
            relationshipType: rel.relationshipType,
            ownershipPercentage: rel.ownershipPercentage,
            jurisdiction: rel.jurisdiction,
        }));
    }
    return [];
}
