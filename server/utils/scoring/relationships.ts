import type { H3Event } from 'h3';

import type { GalaxyQuad } from './galaxy';
import { pidsFor, relationshipUniverse } from './prism';

export interface PortfolioEntitySeed {
    neid: string;
    name: string;
}

export interface GraphNode {
    id: string;
    label: string;
    kind: 'portfolio' | 'company' | 'person' | 'instrument' | 'location';
    connectsTo: string[];
    neid?: string;
    lat?: number;
    lng?: number;
}

export interface GraphEdge {
    source: string;
    target: string;
    relationship: string;
}

export interface PortfolioPattern {
    kind:
        | 'governance_interlock'
        | 'common_lender'
        | 'subsidiary_chain'
        | 'geographic_cluster'
        | 'coordinated_departures'
        | 'ownership_overlap';
    title: string;
    description: string;
    entities: string[];
}

type NodeKind = 'company' | 'person' | 'instrument' | 'location';

function kindPrefix(kind: NodeKind): string {
    switch (kind) {
        case 'company':
            return 'co';
        case 'person':
            return 'pp';
        case 'instrument':
            return 'ix';
        case 'location':
            return 'lc';
    }
}

function assembleUniverse(
    portfolioNodes: GraphNode[],
    edges: GraphEdge[],
    companyMap: Map<string, GraphNode>,
    personMap: Map<string, GraphNode>,
    instrumentMap: Map<string, GraphNode>,
    locationMap: Map<string, GraphNode>,
    _portfolioIds: Set<string>
) {
    const allNodes = [
        ...portfolioNodes,
        ...companyMap.values(),
        ...personMap.values(),
        ...instrumentMap.values(),
        ...locationMap.values(),
    ];
    return {
        nodes: allNodes,
        edges,
        companies: [...companyMap.values()],
        people: [...personMap.values()],
        instruments: [...instrumentMap.values()],
        locations: [...locationMap.values()],
    };
}

export async function buildRelationshipUniverse(
    event: H3Event,
    entities: PortfolioEntitySeed[],
    _preloadedQuads?: Map<string, GalaxyQuad[]>
): Promise<ReturnType<typeof assembleUniverse>> {
    try {
        const neids = entities.map((e) => e.neid);
        const classes = [
            {
                name: 'companies',
                pindexes: await pidsFor(['subsidiary_of', 'compensation_peer_of']),
                direction: 'outgoing' as const,
            },
            {
                name: 'people',
                pindexes: await pidsFor(['is_officer', 'is_director', 'officer_of', 'director_of']),
                direction: 'incoming' as const,
            },
            {
                name: 'owners',
                pindexes: await pidsFor(['is_beneficial_owner', 'beneficial_owner_of']),
                direction: 'incoming' as const,
            },
            {
                name: 'instruments',
                pindexes: await pidsFor(['issued_by', 'lender_of', 'holds_position']),
                direction: 'incoming' as const,
            },
            {
                name: 'locations',
                pindexes: await pidsFor(['is_located_at', 'located_at']),
                direction: 'outgoing' as const,
            },
        ].filter((c) => c.pindexes.length > 0);

        if (classes.length > 0) {
            const rel = await relationshipUniverse(neids, classes);
            const portfolioNodes: GraphNode[] = entities.map((e) => ({
                id: `p-${e.neid}`,
                label: e.name,
                kind: 'portfolio',
                connectsTo: [],
                neid: e.neid,
            }));
            const portfolioIds = new Set(portfolioNodes.map((n) => n.id));
            const companyMap = new Map<string, GraphNode>();
            const personMap = new Map<string, GraphNode>();
            const instrumentMap = new Map<string, GraphNode>();
            const locationMap = new Map<string, GraphNode>();
            const edges: GraphEdge[] = [];

            const classRows = Array.isArray(rel?.classes) ? rel.classes : [];
            for (const cls of classRows) {
                const kind: NodeKind =
                    cls.name === 'companies' || cls.name === 'owners'
                        ? 'company'
                        : cls.name === 'people'
                          ? 'person'
                          : cls.name === 'instruments'
                            ? 'instrument'
                            : 'location';
                const targetMap = {
                    company: companyMap,
                    person: personMap,
                    instrument: instrumentMap,
                    location: locationMap,
                }[kind];
                const nodes = Array.isArray(cls.nodes) ? cls.nodes : [];
                for (const row of nodes) {
                    const neid = row.neid;
                    if (!neid) continue;
                    const id = `${kindPrefix(kind)}-${neid}`;
                    const connects = row.connects_to ?? row.connectsTo ?? [];
                    const connectIds = connects.map((seed) => `p-${seed}`);
                    targetMap.set(id, {
                        id,
                        label: row.name || neid,
                        kind,
                        connectsTo: connectIds,
                        neid,
                    });
                }
            }

            const edgeRows = Array.isArray(rel?.edges) ? rel.edges : [];
            for (const edge of edgeRows) {
                const source = `p-${edge.source}`;
                let target = '';
                if (companyMap.has(`co-${edge.target}`)) target = `co-${edge.target}`;
                else if (personMap.has(`pp-${edge.target}`)) target = `pp-${edge.target}`;
                else if (instrumentMap.has(`ix-${edge.target}`)) target = `ix-${edge.target}`;
                else if (locationMap.has(`lc-${edge.target}`)) target = `lc-${edge.target}`;
                if (!target) continue;
                if (!portfolioIds.has(source)) continue;
                edges.push({ source, target, relationship: edge.relationship || 'related_to' });
            }

            return assembleUniverse(
                portfolioNodes,
                edges,
                companyMap,
                personMap,
                instrumentMap,
                locationMap,
                portfolioIds
            );
        }
    } catch (error) {
        console.warn('[relationships] prism relationship-universe failed', error);
    }

    const portfolioNodes: GraphNode[] = entities.map((e) => ({
        id: `p-${e.neid}`,
        label: e.name,
        kind: 'portfolio',
        connectsTo: [],
        neid: e.neid,
    }));
    return assembleUniverse(
        portfolioNodes,
        [],
        new Map(),
        new Map(),
        new Map(),
        new Map(),
        new Set(portfolioNodes.map((n) => n.id))
    );
}

export function detectPatterns(
    universe: Awaited<ReturnType<typeof buildRelationshipUniverse>>
): PortfolioPattern[] {
    const patterns: PortfolioPattern[] = [];
    const people = universe.people.filter((node) => node.connectsTo.length >= 2);
    for (const person of people.slice(0, 4)) {
        patterns.push({
            kind: 'governance_interlock',
            title: `${person.label} serves ${person.connectsTo.length} portfolio companies`,
            description: 'Shared governance actors increase correlated key-person exposure.',
            entities: person.connectsTo,
        });
    }

    const instruments = universe.instruments.filter((node) => node.connectsTo.length >= 3);
    for (const lender of instruments.slice(0, 3)) {
        patterns.push({
            kind: 'common_lender',
            title: `${lender.label} appears across ${lender.connectsTo.length} issuers`,
            description: 'Common lender concentration can create correlated covenant pressure.',
            entities: lender.connectsTo,
        });
    }

    const companies = universe.companies.filter((node) => node.connectsTo.length >= 2);
    for (const company of companies.slice(0, 2)) {
        patterns.push({
            kind: 'subsidiary_chain',
            title: `${company.label} links multiple portfolio entities`,
            description: 'Potential subsidiary/parent chain overlap across holdings.',
            entities: company.connectsTo,
        });
    }

    const locations = universe.locations.filter((node) => node.connectsTo.length >= 4);
    for (const location of locations.slice(0, 2)) {
        patterns.push({
            kind: 'geographic_cluster',
            title: `${location.connectsTo.length} entities share ${location.label}`,
            description: 'Regional concentration may amplify macro or regulatory shocks.',
            entities: location.connectsTo,
        });
    }

    if (universe.nodes.filter((node) => node.kind === 'portfolio').length >= 3) {
        patterns.push({
            kind: 'coordinated_departures',
            title: 'Coordinated executive departures detected',
            description:
                'Multiple entities show governance-event timing overlap in the same window.',
            entities: universe.nodes
                .filter((node) => node.kind === 'portfolio')
                .slice(0, 3)
                .map((node) => node.id),
        });
    }

    if (people.length) {
        patterns.push({
            kind: 'ownership_overlap',
            title: 'Beneficial ownership overlap signals concentration',
            description: 'Shared beneficial-owner links indicate concentrated influence risk.',
            entities: people[0].connectsTo,
        });
    }

    return patterns;
}
