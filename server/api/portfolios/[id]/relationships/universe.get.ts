import { buildRelationshipUniverse } from '~/server/utils/scoring/relationships';
import { isGalaxyEnabled } from '~/server/utils/scoring/galaxy';
import { requireAuth } from '~/server/utils/requireAuth';

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

// In-process cache: key = sorted NEID list hash, value = { result, expiresAt }
// Increment CACHE_VER when the response shape or filtering logic changes.
const CACHE_TTL_MS = 10 * 60_000; // 10 minutes
const CACHE_VER = 4;
const universeCache = new Map<string, { result: unknown; expiresAt: number }>();

function cacheKey(entities: Array<{ neid: string }>): string {
    return (
        `v${CACHE_VER}:` +
        entities
            .map((e) => e.neid)
            .sort()
            .join(',')
    );
}

export default defineEventHandler(async (event) => {
    await requireAuth(event);
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

    const key = cacheKey(entities);
    const cached = universeCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
    }

    const [universe, galaxyEnabled] = await Promise.all([
        buildRelationshipUniverse(event, entities),
        isGalaxyEnabled(event).catch(() => false),
    ]);

    const portfolioNameMap = new Map(entities.map((e) => [`p-${e.neid}`, e.name]));
    function resolvePortfolioNames(ids: string[]): string[] {
        return ids.map((id) => portfolioNameMap.get(id) ?? id);
    }

    // Build a lookup: node id → all relationship labels on edges pointing to it
    const edgeRelsByTarget = new Map<string, Set<string>>();
    for (const edge of universe.edges) {
        const set = edgeRelsByTarget.get(edge.target) ?? new Set<string>();
        set.add(edge.relationship);
        edgeRelsByTarget.set(edge.target, set);
    }

    const companies = universe.companies.map((node) => ({
        neid: node.neid ?? node.id.replace(/^co-/, ''),
        name: node.label,
        connectionType: [...(edgeRelsByTarget.get(node.id) ?? [])][0] ?? 'related',
        connectedTo: resolvePortfolioNames(node.connectsTo),
        relationshipCount: node.connectsTo.length,
    }));

    function rolesFromRelationships(nodeId: string): string[] {
        const rels = [...(edgeRelsByTarget.get(nodeId) ?? [])];
        if (!rels.length) return ['Officer'];
        return rels.map((r) => {
            const p = r.toLowerCase();
            if (p.includes('director') || p.includes('board')) return 'Director';
            if (p.includes('officer') || p.includes('executive')) return 'Officer';
            if (p.includes('president') || p.includes('ceo')) return 'President/CEO';
            if (p.includes('trustee')) return 'Trustee';
            if (p.includes('employ')) return 'Employee';
            // Capitalise unknown labels as-is
            return r
                .split('_')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');
        });
    }

    function instrumentTypeFromRelationships(nodeId: string): string {
        const rels = [...(edgeRelsByTarget.get(nodeId) ?? [])];
        if (!rels.length) return 'Instrument';
        const p = rels[0].toLowerCase();
        if (p.includes('bond')) return 'Bond';
        if (p.includes('loan') || p.includes('credit')) return 'Loan / Credit';
        if (p.includes('lender')) return 'Credit Facility';
        if (p.includes('issued')) return 'Issued Security';
        if (p.includes('trust')) return 'Trust';
        return rels[0]
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    }

    const people = universe.people.map((node) => ({
        name: node.label,
        roles: rolesFromRelationships(node.id),
        companiesServed: resolvePortfolioNames(node.connectsTo),
        tenure: '—',
        departed: false,
    }));

    const instruments = universe.instruments.map((node) => ({
        neid: node.neid ?? node.id.replace(/^ix-/, ''),
        name: node.label,
        type: instrumentTypeFromRelationships(node.id),
        issuer: resolvePortfolioNames(node.connectsTo)[0] ?? '—',
        amount: '—',
        maturity: '—',
        lender: '—',
    }));

    const locations = universe.locations.map((node) => ({
        name: node.label,
        entitiesPresent: resolvePortfolioNames(node.connectsTo),
        lat: node.lat,
        lng: node.lng,
        neid: node.neid ?? node.id.replace(/^lc-/, ''),
    }));

    const result = {
        nodes: universe.nodes,
        edges: universe.edges,
        companies,
        people,
        instruments,
        locations,
        galaxyEnabled,
    };

    universeCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });

    return result;
});
