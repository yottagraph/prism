import type { H3Event } from 'h3';

import { findEntities, getEntityName, getSchema, normalizePidMap } from './elemental';
import { getEntityQuads, getEntityInfo, isGalaxyEnabled } from './galaxy';

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

function flavorToKind(flavor: string): NodeKind | null {
    const f = flavor.toLowerCase();
    if (f.includes('organization') || f === 'org' || f.includes('company')) return 'company';
    if (f.includes('person')) return 'person';
    if (f.includes('financial_instrument') || f.includes('instrument')) return 'instrument';
    if (f.includes('location')) return 'location';
    return null;
}

/**
 * Classify a Galaxy quad property as a meaningful 1st-degree relationship kind,
 * or return null to discard the quad. This prevents stock exchanges (traded_on),
 * industries, indices, and article appearances from showing up as "related entities."
 */
function propertyToKind(property: string): NodeKind | null {
    const p = property.toLowerCase();

    // People — governance / employment
    if (
        p.includes('officer') || p.includes('director') || p.includes('board') ||
        p.includes('executive') || p.includes('president') || p.includes('ceo') ||
        p.includes('employ') || p.includes('manages') || p.includes('member_of') ||
        p.includes('trustee') || p.includes('appointed')
    ) return 'person';

    // Companies — ownership / corporate structure
    if (
        p.includes('subsidiary') || p.includes('parent_of') || p.includes('owned_by') ||
        p.includes('beneficial_owner') || p.includes('affiliated') ||
        p.includes('acqui') || p.includes('merger') || p.includes('controls') ||
        p.includes('stakeholder') || p.includes('shareholder') ||
        p.includes('investor_in') || p.includes('owns')
    ) return 'company';

    // Financial instruments — capital / debt
    if (
        p.includes('issued_by') || p.includes('lender') || p.includes('borrower') ||
        p.includes('holds_instrument') || p.includes('has_instrument') ||
        p.includes('bond') || p.includes('loan') || p.includes('credit') ||
        p.includes('debt') || p.includes('collateral') || p.includes('guarantor')
    ) return 'instrument';

    // Locations — physical presence
    if (
        p.includes('located_at') || p.includes('location') || p.includes('headquarter') ||
        p.includes('registered_in') || p.includes('office_in') || p.includes('operates_in') ||
        p.includes('address')
    ) return 'location';

    return null; // discard: exchanges, indices, industries, articles, etc.
}

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

async function buildFromGalaxy(
    event: H3Event,
    entities: PortfolioEntitySeed[]
): Promise<ReturnType<typeof assembleUniverse>> {
    const portfolioNodes: GraphNode[] = entities.map((e) => ({
        id: `p-${e.neid}`,
        label: e.name,
        kind: 'portfolio',
        connectsTo: [],
        neid: e.neid,
    }));
    const portfolioIds = new Set(portfolioNodes.map((n) => n.id));

    const edges: GraphEdge[] = [];

    // neighbour NEID → { sourcePortfolioNodeIds, relationships }
    const neighbourPortfolios = new Map<
        string,
        { portfolioIds: string[]; relationships: string[] }
    >();

    const portfolioNeidSet = new Set(entities.map((e) => e.neid));

    // Fetch all entity quads in parallel — no per-entity cap; Galaxy returns all quads
    const quadsPerEntity = await Promise.all(
        entities.map(async (entity) => {
            const quads = await getEntityQuads(entity.neid).catch(() => []);
            return { entity, quads };
        })
    );

    for (const { entity, quads } of quadsPerEntity) {
        const portfolioNodeId = `p-${entity.neid}`;

        for (const quad of quads) {
            if (quad.dest_type !== 'relational') continue;
            // Only keep quads whose property name indicates a meaningful 1st-degree relationship.
            // This excludes stock exchanges (traded_on), indices, industries, articles, etc.
            if (!propertyToKind(quad.property)) continue;

            const destNeid = quad.destination;
            if (destNeid === entity.neid || portfolioNeidSet.has(destNeid)) continue;

            const existing = neighbourPortfolios.get(destNeid);
            if (existing) {
                if (!existing.portfolioIds.includes(portfolioNodeId)) {
                    existing.portfolioIds.push(portfolioNodeId);
                }
                if (!existing.relationships.includes(quad.property)) {
                    existing.relationships.push(quad.property);
                }
            } else {
                neighbourPortfolios.set(destNeid, {
                    portfolioIds: [portfolioNodeId],
                    relationships: [quad.property],
                });
            }
        }
    }

    // Sort neighbours so those shared across more portfolio entities come first,
    // then cap at 1000 to keep getEntityInfo calls bounded.
    const neighbourNeids = [...neighbourPortfolios.entries()]
        .sort((a, b) => b[1].portfolioIds.length - a[1].portfolioIds.length)
        .slice(0, 1000)
        .map(([neid]) => neid);

    // Resolve all unique neighbour NEIDs in parallel (getEntityInfo is already semaphore-gated)
    const infoResults = await Promise.all(
        neighbourNeids.map((neid) => getEntityInfo(neid).catch(() => null))
    );

    const companyMap = new Map<string, GraphNode>();
    const personMap = new Map<string, GraphNode>();
    const instrumentMap = new Map<string, GraphNode>();
    const locationMap = new Map<string, GraphNode>();

    for (let i = 0; i < neighbourNeids.length; i++) {
        const neid = neighbourNeids[i];
        const info = infoResults[i];
        if (!info) continue;

        // Use flavor as primary classifier; fall back to property-name hint when
        // the flavor is unknown (e.g. a person entity whose flavor isn't recognised).
        const rels = neighbourPortfolios.get(neid)!.relationships;
        const propertyHint = propertyToKind(rels[0] ?? '');
        const kind = flavorToKind(info.flavor) ?? propertyHint;
        if (!kind) continue;

        const id = `${kindPrefix(kind)}-${neid}`;
        const portIds = neighbourPortfolios.get(neid)!.portfolioIds;
        const relLabel = rels[0] ?? kind;

        const targetMap = {
            company: companyMap,
            person: personMap,
            instrument: instrumentMap,
            location: locationMap,
        }[kind];

        if (!targetMap.has(id)) {
            targetMap.set(id, { id, label: info.name, kind, connectsTo: [...portIds], neid });
        } else {
            const node = targetMap.get(id)!;
            for (const pid of portIds) {
                if (!node.connectsTo.includes(pid)) node.connectsTo.push(pid);
            }
        }

        for (const portId of portIds) {
            edges.push({ source: portId, target: id, relationship: relLabel });
        }
    }

    // For location nodes, attempt to resolve lat/lng from their quads
    for (const [, node] of locationMap) {
        if (!node.neid) continue;
        const locQuads = await getEntityQuads(node.neid).catch(() => []);
        for (const q of locQuads) {
            if (q.dest_type === 'numerical') {
                const prop = q.property.toLowerCase();
                const val = parseFloat(q.destination);
                if (!isNaN(val)) {
                    if (prop === 'latitude' || prop === 'lat') node.lat = val;
                    if (prop === 'longitude' || prop === 'lng' || prop === 'lon') node.lng = val;
                }
            }
        }
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

function assembleUniverse(
    portfolioNodes: GraphNode[],
    edges: GraphEdge[],
    companyMap: Map<string, GraphNode>,
    personMap: Map<string, GraphNode>,
    instrumentMap: Map<string, GraphNode>,
    locationMap: Map<string, GraphNode>,
    portfolioIds: Set<string>
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

// ─── Elemental fallback ────────────────────────────────────────────────────────

async function resolveNames(event: H3Event, eids: string[], limit = 20) {
    const trimmed = eids.slice(0, limit);
    return await Promise.all(
        trimmed.map(async (eid) => {
            try {
                return { eid, name: await getEntityName(eid, event) };
            } catch {
                return { eid, name: eid };
            }
        })
    );
}

async function linked(
    event: H3Event,
    centerEid: string,
    pid?: string,
    direction: 'incoming' | 'outgoing' = 'outgoing'
) {
    if (!pid) return [] as string[];
    try {
        return await findEntities(
            {
                type: 'linked',
                linked: {
                    to_entity: centerEid,
                    distance: 1,
                    pids: [pid],
                    direction,
                },
            },
            20,
            event
        );
    } catch {
        return [];
    }
}

async function buildFromElemental(event: H3Event, entities: PortfolioEntitySeed[]) {
    const portfolioNodes: GraphNode[] = entities.map((entity) => ({
        id: `p-${entity.neid}`,
        label: entity.name,
        kind: 'portfolio',
        connectsTo: [],
        neid: entity.neid,
    }));
    const portfolioIds = new Set(portfolioNodes.map((n) => n.id));
    const edges: GraphEdge[] = [];

    const companyMap = new Map<string, GraphNode>();
    const personMap = new Map<string, GraphNode>();
    const instrumentMap = new Map<string, GraphNode>();
    const locationMap = new Map<string, GraphNode>();

    const schema = await getSchema(event).catch(() => ({ flavors: [], properties: [] }));
    const pid = normalizePidMap(schema);
    const pids = {
        company: pid.subsidiary_of ?? pid.compensation_peer_of,
        people: pid.is_officer ?? pid.is_director ?? pid.officer_of ?? pid.director_of,
        owner: pid.is_beneficial_owner ?? pid.beneficial_owner_of,
        instrument: pid.issued_by ?? pid.lender_of ?? pid.holds_position,
        location: pid.is_located_at ?? pid.located_at,
    };

    for (const entity of entities) {
        const [companyIds, personIds, ownerIds, instrumentIds, locationIds] = await Promise.all([
            linked(event, entity.neid, pids.company, 'outgoing'),
            linked(event, entity.neid, pids.people, 'incoming'),
            linked(event, entity.neid, pids.owner, 'incoming'),
            linked(event, entity.neid, pids.instrument, 'incoming'),
            linked(event, entity.neid, pids.location, 'outgoing'),
        ]);

        const companies = await resolveNames(event, companyIds);
        const people = await resolveNames(event, [...personIds, ...ownerIds]);
        const instruments = await resolveNames(event, instrumentIds);
        const locations = await resolveNames(event, locationIds);

        for (const row of companies) {
            const id = `co-${row.eid}`;
            if (!companyMap.has(id))
                companyMap.set(id, {
                    id,
                    label: row.name,
                    kind: 'company',
                    connectsTo: [],
                    neid: row.eid,
                });
            companyMap.get(id)!.connectsTo.push(`p-${entity.neid}`);
            edges.push({ source: `p-${entity.neid}`, target: id, relationship: 'subsidiary_of' });
        }
        for (const row of people) {
            const id = `pp-${row.eid}`;
            if (!personMap.has(id))
                personMap.set(id, {
                    id,
                    label: row.name,
                    kind: 'person',
                    connectsTo: [],
                    neid: row.eid,
                });
            personMap.get(id)!.connectsTo.push(`p-${entity.neid}`);
            edges.push({ source: `p-${entity.neid}`, target: id, relationship: 'officer_of' });
        }
        for (const row of instruments) {
            const id = `ix-${row.eid}`;
            if (!instrumentMap.has(id)) {
                instrumentMap.set(id, {
                    id,
                    label: row.name,
                    kind: 'instrument',
                    connectsTo: [],
                    neid: row.eid,
                });
            }
            instrumentMap.get(id)!.connectsTo.push(`p-${entity.neid}`);
            edges.push({ source: `p-${entity.neid}`, target: id, relationship: 'lender_of' });
        }
        for (const row of locations) {
            const id = `lc-${row.eid}`;
            if (!locationMap.has(id)) {
                locationMap.set(id, {
                    id,
                    label: row.name,
                    kind: 'location',
                    connectsTo: [],
                    neid: row.eid,
                });
            }
            locationMap.get(id)!.connectsTo.push(`p-${entity.neid}`);
            edges.push({ source: `p-${entity.neid}`, target: id, relationship: 'located_at' });
        }
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

// ─── Public API ───────────────────────────────────────────────────────────────

export async function buildRelationshipUniverse(
    event: H3Event,
    entities: PortfolioEntitySeed[]
): Promise<ReturnType<typeof assembleUniverse>> {
    const galaxyEnabled = await isGalaxyEnabled(event).catch(() => false);
    if (galaxyEnabled) {
        return buildFromGalaxy(event, entities);
    }
    return buildFromElemental(event, entities);
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
