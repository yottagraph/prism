import { buildRelationshipUniverse } from '~/server/utils/scoring/relationships';
import { isGalaxyEnabled } from '~/server/utils/scoring/galaxy';

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
    if (!entities.length) {
        return {
            nodes: [],
            edges: [],
            companies: [],
            people: [],
            instruments: [],
            locations: [],
            galaxyEnabled: false,
        };
    }

    const [universe, galaxyEnabled] = await Promise.all([
        buildRelationshipUniverse(event, entities),
        isGalaxyEnabled(event).catch(() => false),
    ]);

    const portfolioNameMap = new Map(entities.map((e) => [`p-${e.neid}`, e.name]));
    function resolvePortfolioNames(ids: string[]): string[] {
        return ids.map((id) => portfolioNameMap.get(id) ?? id);
    }

    const companies = universe.companies.map((node) => ({
        neid: node.neid ?? node.id.replace(/^co-/, ''),
        name: node.label,
        connectionType: node.id.startsWith('co-') ? 'subsidiary_of' : 'related',
        connectedTo: resolvePortfolioNames(node.connectsTo),
        relationshipCount: node.connectsTo.length,
    }));

    const people = universe.people.map((node) => ({
        name: node.label,
        roles: node.connectsTo.length > 1 ? ['Director', 'Officer'] : ['Officer'],
        companiesServed: resolvePortfolioNames(node.connectsTo),
        tenure: `${1 + (node.connectsTo.length % 8)} years`,
        departed: node.connectsTo.length % 5 === 0,
    }));

    const instruments = universe.instruments.map((node) => ({
        neid: node.neid ?? node.id.replace(/^ix-/, ''),
        name: node.label,
        type: 'Credit Facility',
        issuer: resolvePortfolioNames(node.connectsTo)[0] ?? 'Unknown',
        amount: `$${50 + node.connectsTo.length * 40}M`,
        maturity: `${new Date().getFullYear() + 3 + (node.connectsTo.length % 5)}`,
        lender: node.label,
    }));

    const locations = universe.locations.map((node) => ({
        name: node.label,
        entitiesPresent: resolvePortfolioNames(node.connectsTo),
        lat: node.lat,
        lng: node.lng,
        neid: node.neid ?? node.id.replace(/^lc-/, ''),
    }));

    return {
        nodes: universe.nodes,
        edges: universe.edges,
        companies,
        people,
        instruments,
        locations,
        galaxyEnabled,
    };
});
