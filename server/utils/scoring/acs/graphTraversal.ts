import type { H3Event } from 'h3';

import type { ContextPackage } from '../contextPackage';
import { callMcpTool, extractMcpStructuredContent } from '../mcpGateway';
import type { TraversedNode } from './types';

interface RelationshipRow {
    neid?: string;
    name?: string;
    relationship_types?: string[];
    properties?: Record<string, { value?: unknown }>;
}

function rowToNode(row: RelationshipRow, hopDistance: number): TraversedNode {
    const relationshipType = (row.relationship_types || [])[0] || 'related_to';
    const ownershipValue = row?.properties?.ownership_percentage?.value;
    const jurisdictionValue =
        row?.properties?.jurisdiction?.value || row?.properties?.country_of_incorporation?.value;
    return {
        neid: String(row?.neid || ''),
        name: String(row?.name || row?.neid || 'Unknown entity'),
        hopDistance,
        relationshipType,
        ownershipPercentage:
            typeof ownershipValue === 'number'
                ? ownershipValue
                : typeof ownershipValue === 'string'
                  ? Number(ownershipValue)
                  : null,
        jurisdiction: typeof jurisdictionValue === 'string' ? jurisdictionValue : null,
    };
}

export async function traverseOwnershipGraph(
    event: H3Event,
    neid: string,
    maxDepth = 3,
    ctx?: ContextPackage
): Promise<TraversedNode[]> {
    const visited = new Set<string>([neid]);
    const out: TraversedNode[] = [];
    let frontier = [neid];

    for (let depth = 1; depth <= maxDepth; depth += 1) {
        const nextFrontier: string[] = [];
        for (const current of frontier) {
            try {
                if (depth === 1 && current === neid && ctx) {
                    const combined = [...ctx.ownership, ...ctx.subsidiaries];
                    for (const rel of combined) {
                        if (!rel.neid || visited.has(rel.neid)) continue;
                        visited.add(rel.neid);
                        out.push({
                            neid: rel.neid,
                            name: rel.name,
                            hopDistance: depth,
                            relationshipType: rel.relationshipType,
                            ownershipPercentage: rel.ownershipPercentage,
                            jurisdiction: rel.jurisdiction,
                        });
                        nextFrontier.push(rel.neid);
                    }
                } else {
                    const result = await callMcpTool(
                        'elemental',
                        'elemental_get_related',
                        {
                            entity_id: { id_type: 'neid', id: current },
                            relationship_types: ['beneficial_owner_of', 'subsidiary_of'],
                            direction: 'both',
                            limit: 40,
                        },
                        event
                    );
                    const structured = extractMcpStructuredContent<{
                        relationships?: RelationshipRow[];
                    }>(result);
                    const rows = Array.isArray(structured?.relationships)
                        ? structured.relationships
                        : [];
                    for (const row of rows) {
                        const rowNeid = String(row?.neid || '');
                        if (!rowNeid || visited.has(rowNeid)) continue;
                        visited.add(rowNeid);
                        out.push(rowToNode(row, depth));
                        nextFrontier.push(rowNeid);
                    }
                }
            } catch (error) {
                console.warn('[acs] graph traversal step failed', { neid: current, depth, error });
            }
        }
        if (!nextFrontier.length) break;
        frontier = nextFrontier;
    }

    return out;
}
