/**
 * Relationship Explorer composable.
 *
 * Builds the graph + tabular views of the portfolio's connected universe.
 * Real implementations would call `findEntities()` with `linked` expressions
 * and `getPropertyValues()` on relationship PIDs; until those are wired
 * end-to-end we generate a deterministic synthetic graph so the UI has
 * something to render and the cross-portfolio patterns are reproducible.
 */

import { computed, ref } from 'vue';

import type { PortfolioDoc } from './usePortfolio';

export interface GraphNode {
    id: string;
    label: string;
    kind: 'portfolio' | 'company' | 'person' | 'instrument' | 'location';
    /** Connected portfolio entity IDs — used for cross-portfolio pattern detection. */
    connectsTo: string[];
}

export interface GraphEdge {
    source: string;
    target: string;
    relationship: string;
}

export interface RelatedCompanyRow {
    name: string;
    connectionType: string;
    connectedTo: string[];
    relationshipCount: number;
}

export interface PersonRow {
    name: string;
    roles: string[];
    companiesServed: string[];
    tenure: string;
    departed: boolean;
}

export interface InstrumentRow {
    name: string;
    type: string;
    issuer: string;
    amount: string;
    maturity: string;
    lender: string;
}

export interface LocationRow {
    name: string;
    entitiesPresent: string[];
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

const PEOPLE_POOL = [
    'Margaret Cole',
    'Avery Holland',
    'Jordan Reyes',
    'Sarah Liang',
    'Damian Ortiz',
    'Priya Shah',
    'Henrik Larsen',
    'Imani Brown',
    'Sebastian Moreno',
    'Renee Whitfield',
    'Felix Andersen',
    'Camille Dupont',
];
const LENDERS = [
    'Atlas Credit Partners',
    'Northwind Capital',
    'Lockstep Loan Trust',
    'Crescent Mezzanine',
];
const LOCATIONS_POOL = [
    'Dallas, TX',
    'Charlotte, NC',
    'Chicago, IL',
    'Atlanta, GA',
    'Houston, TX',
    'Boston, MA',
    'New York, NY',
];
const INSTRUMENT_TYPES = [
    'Senior Secured Term Loan',
    'Senior Notes 2029',
    'Revolver',
    'Convertible Notes 2028',
    'Mezzanine Facility',
];

function h32(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    return h;
}

function pickN<T>(arr: T[], n: number, salt: string): T[] {
    const out: T[] = [];
    const used = new Set<number>();
    for (let i = 0; i < n && used.size < arr.length; i++) {
        const idx = (h32(`${salt}|${i}`) % arr.length) | 0;
        if (used.has(idx)) continue;
        used.add(idx);
        out.push(arr[idx]);
    }
    return out;
}

export function useRelationships(portfolio: import('vue').Ref<PortfolioDoc | null>) {
    const graph = computed(() => buildGraph(portfolio.value));
    const companies = computed(() => buildCompanies(portfolio.value));
    const people = computed(() => buildPeople(portfolio.value));
    const instruments = computed(() => buildInstruments(portfolio.value));
    const locations = computed(() => buildLocations(portfolio.value));
    const patterns = computed(() => buildPatterns(portfolio.value));

    return { graph, companies, people, instruments, locations, patterns };
}

function buildGraph(portfolio: PortfolioDoc | null): {
    nodes: GraphNode[];
    edges: GraphEdge[];
} {
    if (!portfolio) return { nodes: [], edges: [] };
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    const ents = portfolio.entities.filter((e) => e.neid);
    ents.forEach((e) => {
        nodes.push({
            id: `p-${e.neid}`,
            label: e.resolvedName,
            kind: 'portfolio',
            connectsTo: [],
        });
    });

    const companyMap = new Map<string, GraphNode>();
    const personMap = new Map<string, GraphNode>();
    const lenderMap = new Map<string, GraphNode>();
    const locationMap = new Map<string, GraphNode>();

    ents.forEach((e) => {
        const seed = e.neid!;
        // 2 related companies (peers / subsidiaries)
        const cos = pickN(
            [
                'Atlas Holdings',
                'Crescent Industrials',
                'Harborline Group',
                'Northwind Partners',
                'Sierra Mfg',
                'Vertex Logistics',
            ],
            2,
            `${seed}|co`
        );
        cos.forEach((name, i) => {
            const id = `co-${name}`;
            if (!companyMap.has(id)) {
                companyMap.set(id, { id, label: name, kind: 'company', connectsTo: [] });
            }
            companyMap.get(id)!.connectsTo.push(`p-${seed}`);
            edges.push({
                source: `p-${seed}`,
                target: id,
                relationship: i === 0 ? 'compensation_peer_of' : 'subsidiary_of',
            });
        });

        // 2 people (officers/directors) — deliberately reuse a subset across
        // entities so the governance-interlock pattern emerges.
        const personCount = 2;
        for (let i = 0; i < personCount; i++) {
            // 30% chance of reusing the same person across entities to seed an interlock
            const idx = (h32(`${seed}|pp|${i}`) % PEOPLE_POOL.length) | 0;
            const overlapIdx =
                (h32(`portfolio|${portfolio.id}|interlock|${i}`) % PEOPLE_POOL.length) | 0;
            const useOverlap = h32(`${seed}|use|${i}`) % 100 < 35;
            const personName = PEOPLE_POOL[useOverlap ? overlapIdx : idx];
            const id = `pp-${personName}`;
            if (!personMap.has(id)) {
                personMap.set(id, {
                    id,
                    label: personName,
                    kind: 'person',
                    connectsTo: [],
                });
            }
            personMap.get(id)!.connectsTo.push(`p-${seed}`);
            edges.push({
                source: `p-${seed}`,
                target: id,
                relationship: i === 0 ? 'officer_of' : 'director_of',
            });
        }

        // 1-2 instruments + lender
        const lenderIdx = (h32(`${seed}|ln`) % LENDERS.length) | 0;
        const lenderName = LENDERS[lenderIdx];
        const lid = `ln-${lenderName}`;
        if (!lenderMap.has(lid)) {
            lenderMap.set(lid, { id: lid, label: lenderName, kind: 'instrument', connectsTo: [] });
        }
        lenderMap.get(lid)!.connectsTo.push(`p-${seed}`);
        edges.push({ source: `p-${seed}`, target: lid, relationship: 'lender_of' });

        // 1 location
        const locIdx = (h32(`${seed}|loc`) % LOCATIONS_POOL.length) | 0;
        const locName = LOCATIONS_POOL[locIdx];
        const lc = `lc-${locName}`;
        if (!locationMap.has(lc)) {
            locationMap.set(lc, { id: lc, label: locName, kind: 'location', connectsTo: [] });
        }
        locationMap.get(lc)!.connectsTo.push(`p-${seed}`);
        edges.push({ source: `p-${seed}`, target: lc, relationship: 'located_at' });
    });

    nodes.push(
        ...companyMap.values(),
        ...personMap.values(),
        ...lenderMap.values(),
        ...locationMap.values()
    );
    return { nodes, edges };
}

function buildCompanies(p: PortfolioDoc | null): RelatedCompanyRow[] {
    const { nodes } = buildGraph(p);
    return nodes
        .filter((n) => n.kind === 'company')
        .map((n) => ({
            name: n.label,
            connectionType:
                n.connectsTo.length > 1 ? 'subsidiary_of (multiple)' : 'compensation_peer_of',
            connectedTo: n.connectsTo
                .map((c) => labelForPortfolioNode(c, p))
                .filter(Boolean) as string[],
            relationshipCount: n.connectsTo.length,
        }))
        .sort((a, b) => b.relationshipCount - a.relationshipCount);
}

function buildPeople(p: PortfolioDoc | null): PersonRow[] {
    const { nodes } = buildGraph(p);
    return nodes
        .filter((n) => n.kind === 'person')
        .map((n) => ({
            name: n.label,
            roles: n.connectsTo.length > 1 ? ['Director', 'Officer'] : ['Officer'],
            companiesServed: n.connectsTo
                .map((c) => labelForPortfolioNode(c, p))
                .filter(Boolean) as string[],
            tenure: `${1 + (h32(n.label) % 9)} years`,
            departed: h32(n.label) % 100 < 15,
        }))
        .sort((a, b) => b.companiesServed.length - a.companiesServed.length);
}

function buildInstruments(p: PortfolioDoc | null): InstrumentRow[] {
    if (!p) return [];
    return p.entities
        .filter((e) => e.neid)
        .map((e) => {
            const seed = e.neid!;
            const typeIdx = (h32(`${seed}|itype`) % INSTRUMENT_TYPES.length) | 0;
            const lenderIdx = (h32(`${seed}|ln`) % LENDERS.length) | 0;
            const amount = 50 + (h32(`${seed}|amt`) % 950);
            const maturityYears = 1 + (h32(`${seed}|mat`) % 7);
            return {
                name: `${e.resolvedName} ${INSTRUMENT_TYPES[typeIdx]}`,
                type: INSTRUMENT_TYPES[typeIdx],
                issuer: e.resolvedName,
                amount: `$${amount}M`,
                maturity: `${new Date().getFullYear() + maturityYears}`,
                lender: LENDERS[lenderIdx],
            };
        });
}

function buildLocations(p: PortfolioDoc | null): LocationRow[] {
    if (!p) return [];
    const map = new Map<string, string[]>();
    p.entities
        .filter((e) => e.neid)
        .forEach((e) => {
            const idx = (h32(`${e.neid}|loc`) % LOCATIONS_POOL.length) | 0;
            const loc = LOCATIONS_POOL[idx];
            if (!map.has(loc)) map.set(loc, []);
            map.get(loc)!.push(e.resolvedName);
        });
    return [...map.entries()]
        .map(([name, ents]) => ({ name, entitiesPresent: ents }))
        .sort((a, b) => b.entitiesPresent.length - a.entitiesPresent.length);
}

function buildPatterns(p: PortfolioDoc | null): PortfolioPattern[] {
    if (!p) return [];
    const patterns: PortfolioPattern[] = [];

    const people = buildPeople(p);
    const interlocks = people.filter((pp) => pp.companiesServed.length >= 2);
    interlocks.slice(0, 3).forEach((pp) => {
        patterns.push({
            kind: 'governance_interlock',
            title: `${pp.name} serves ${pp.companiesServed.length} portfolio companies`,
            description:
                'Single-person governance exposure — departure or scandal impacts multiple holdings simultaneously.',
            entities: pp.companiesServed,
        });
    });

    const lenderGroups = new Map<string, string[]>();
    buildInstruments(p).forEach((row) => {
        if (!lenderGroups.has(row.lender)) lenderGroups.set(row.lender, []);
        lenderGroups.get(row.lender)!.push(row.issuer);
    });
    [...lenderGroups.entries()]
        .filter(([, issuers]) => issuers.length >= 3)
        .forEach(([lender, issuers]) => {
            patterns.push({
                kind: 'common_lender',
                title: `${lender} is the lender for ${issuers.length} portfolio companies`,
                description:
                    'Concentrated counterparty exposure — covenant tightening could trigger correlated defaults.',
                entities: issuers,
            });
        });

    const locs = buildLocations(p);
    locs.filter((l) => l.entitiesPresent.length >= 4).forEach((l) => {
        patterns.push({
            kind: 'geographic_cluster',
            title: `${l.entitiesPresent.length} portfolio companies headquartered in ${l.name}`,
            description:
                'Regional macroeconomic or regulatory shocks would impact the cluster simultaneously.',
            entities: l.entitiesPresent,
        });
    });

    return patterns;
}

function labelForPortfolioNode(nodeId: string, p: PortfolioDoc | null): string | null {
    if (!nodeId.startsWith('p-') || !p) return null;
    const neid = nodeId.slice(2);
    const e = p.entities.find((ent) => ent.neid === neid);
    return e?.resolvedName ?? null;
}

export interface MacroSignal {
    label: string;
    value: number;
    trend: 'up' | 'down' | 'flat';
    note: string;
}

/**
 * Macro overlay (Polymarket-style). Mock values; would be replaced by live
 * prediction-market data via the lovelace-polymarket MCP server.
 */
export function getMacroContext(): MacroSignal[] {
    return [
        { label: 'Recession probability', value: 18, trend: 'down', note: 'via Polymarket macro' },
        { label: 'Credit stress index', value: 42, trend: 'up', note: 'sector-weighted' },
        {
            label: 'Rate cut probability (next mtg)',
            value: 64,
            trend: 'up',
            note: 'CME / Polymarket fusion',
        },
        { label: 'Energy sector outlook', value: 51, trend: 'flat', note: 'mixed signals' },
    ];
}
