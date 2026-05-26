import type { H3Event } from 'h3';

import { findEntities, getEntityName, getSchema, normalizePidMap } from './elemental';

export interface PortfolioEntitySeed {
    neid: string;
    name: string;
}

export interface GraphNode {
    id: string;
    label: string;
    kind: 'portfolio' | 'company' | 'person' | 'instrument' | 'location';
    connectsTo: string[];
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

async function resolveNames(eids: string[], limit = 20) {
    const trimmed = eids.slice(0, limit);
    return await Promise.all(
        trimmed.map(async (eid) => {
            try {
                return { eid, name: await getEntityName(eid) };
            } catch {
                return { eid, name: eid };
            }
        })
    );
}

async function linked(expression: object, pid?: number, direction: 'incoming' | 'outgoing' = 'outgoing') {
    if (!pid) return [] as string[];
    try {
        return await findEntities(
            {
                type: 'linked',
                linked: {
                    expression,
                    pid,
                    direction,
                },
            },
            20
        );
    } catch {
        return [];
    }
}

export async function buildRelationshipUniverse(event: H3Event, entities: PortfolioEntitySeed[]) {
    const nodes: GraphNode[] = entities.map((entity) => ({
        id: `p-${entity.neid}`,
        label: entity.name,
        kind: 'portfolio',
        connectsTo: [],
    }));
    const edges: GraphEdge[] = [];

    const companyMap = new Map<string, GraphNode>();
    const personMap = new Map<string, GraphNode>();
    const instrumentMap = new Map<string, GraphNode>();
    const locationMap = new Map<string, GraphNode>();

    const schema = await getSchema().catch(() => ({ flavors: [], properties: [] }));
    const pid = normalizePidMap(schema);
    const pids = {
        company: pid.subsidiary_of ?? pid.compensation_peer_of,
        people: pid.officer_of ?? pid.director_of,
        owner: pid.beneficial_owner_of,
        instrument: pid.issued_by ?? pid.lender_of ?? pid.holds_position,
        location: pid.located_at,
    };

    for (const entity of entities) {
        const expression = { type: 'is_entity', is_entity: { eid: entity.neid } };

        const [companyIds, personIds, ownerIds, instrumentIds, locationIds] = await Promise.all([
            linked(expression, pids.company, 'outgoing'),
            linked(expression, pids.people, 'incoming'),
            linked(expression, pids.owner, 'incoming'),
            linked(expression, pids.instrument, 'incoming'),
            linked(expression, pids.location, 'outgoing'),
        ]);

        const companies = await resolveNames(companyIds);
        const people = await resolveNames([...personIds, ...ownerIds]);
        const instruments = await resolveNames(instrumentIds);
        const locations = await resolveNames(locationIds);

        for (const row of companies) {
            const id = `co-${row.eid}`;
            if (!companyMap.has(id)) companyMap.set(id, { id, label: row.name, kind: 'company', connectsTo: [] });
            companyMap.get(id)!.connectsTo.push(`p-${entity.neid}`);
            edges.push({ source: `p-${entity.neid}`, target: id, relationship: 'subsidiary_of' });
        }
        for (const row of people) {
            const id = `pp-${row.eid}`;
            if (!personMap.has(id)) personMap.set(id, { id, label: row.name, kind: 'person', connectsTo: [] });
            personMap.get(id)!.connectsTo.push(`p-${entity.neid}`);
            edges.push({ source: `p-${entity.neid}`, target: id, relationship: 'officer_of' });
        }
        for (const row of instruments) {
            const id = `ix-${row.eid}`;
            if (!instrumentMap.has(id)) {
                instrumentMap.set(id, { id, label: row.name, kind: 'instrument', connectsTo: [] });
            }
            instrumentMap.get(id)!.connectsTo.push(`p-${entity.neid}`);
            edges.push({ source: `p-${entity.neid}`, target: id, relationship: 'lender_of' });
        }
        for (const row of locations) {
            const id = `lc-${row.eid}`;
            if (!locationMap.has(id)) {
                locationMap.set(id, { id, label: row.name, kind: 'location', connectsTo: [] });
            }
            locationMap.get(id)!.connectsTo.push(`p-${entity.neid}`);
            edges.push({ source: `p-${entity.neid}`, target: id, relationship: 'located_at' });
        }
    }

    const allNodes = [
        ...nodes,
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

export function detectPatterns(universe: Awaited<ReturnType<typeof buildRelationshipUniverse>>): PortfolioPattern[] {
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
            description: 'Multiple entities show governance-event timing overlap in the same window.',
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

