import { computed, ref, watch } from 'vue';

import type { PortfolioDoc } from './usePortfolio';

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

export interface RelatedCompanyRow {
    neid?: string;
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
    neid?: string;
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
    lat?: number;
    lng?: number;
    neid?: string;
}

export interface RelationshipUniverse {
    nodes: GraphNode[];
    edges: GraphEdge[];
    companies: RelatedCompanyRow[];
    people: PersonRow[];
    instruments: InstrumentRow[];
    locations: LocationRow[];
    galaxyEnabled: boolean;
}

const EMPTY_UNIVERSE: RelationshipUniverse = {
    nodes: [],
    edges: [],
    companies: [],
    people: [],
    instruments: [],
    locations: [],
    galaxyEnabled: false,
};

// Global cache keyed by portfolio ID so the data persists across navigations.
// The server has its own TTL cache; this client-side cache prevents redundant
// fetches when the user navigates away and back.
const clientCache = new Map<string, RelationshipUniverse>();
// Track in-flight fetches to avoid duplicate requests for the same portfolio.
const inflight = new Map<string, Promise<RelationshipUniverse>>();

async function fetchUniverse(
    portfolioId: string,
    entities: Array<{ neid: string; name: string }>
): Promise<RelationshipUniverse> {
    const existing = inflight.get(portfolioId);
    if (existing) return existing;

    const encoded = encodeURIComponent(JSON.stringify(entities));
    const url = `/api/portfolios/${portfolioId}/relationships/universe?entities=${encoded}`;

    const promise = $fetch<RelationshipUniverse>(url)
        .then((res) => {
            clientCache.set(portfolioId, res);
            inflight.delete(portfolioId);
            return res;
        })
        .catch((err) => {
            console.warn('[useRelationships] failed to load relationship universe', err);
            inflight.delete(portfolioId);
            return { ...EMPTY_UNIVERSE };
        });

    inflight.set(portfolioId, promise);
    return promise;
}

export function useRelationships(
    portfolio: import('vue').Ref<PortfolioDoc | null>,
    scanning: import('vue').Ref<boolean>
) {
    const loading = ref(false);
    const universe = ref<RelationshipUniverse>({ ...EMPTY_UNIVERSE });

    function getResolvedEntities(value: PortfolioDoc) {
        return value.entities
            .filter((e) => e.neid)
            .map((e) => ({ neid: e.neid!, name: e.resolvedName }))
            .slice(0, 20);
    }

    // Watch scanning: fire when scanning transitions false→false with resolved entities,
    // or immediately if we already have entities and are not scanning.
    watch(
        [portfolio, scanning],
        async ([value, isScanning]) => {
            if (!value?.id) {
                universe.value = { ...EMPTY_UNIVERSE };
                return;
            }

            // If a scan is in progress, wait — it will fire again when scanning stops.
            if (isScanning) return;

            const entities = getResolvedEntities(value);
            if (!entities.length) {
                universe.value = { ...EMPTY_UNIVERSE };
                return;
            }

            // Return cached result immediately if available.
            const cached = clientCache.get(value.id);
            if (cached) {
                universe.value = cached;
                return;
            }

            loading.value = true;
            universe.value = await fetchUniverse(value.id, entities);
            loading.value = false;
        },
        { immediate: true }
    );

    return {
        loading: computed(() => loading.value),
        graph: computed(() => ({ nodes: universe.value.nodes, edges: universe.value.edges })),
        companies: computed(() => universe.value.companies),
        people: computed(() => universe.value.people),
        instruments: computed(() => universe.value.instruments),
        locations: computed(() => universe.value.locations),
        galaxyEnabled: computed(() => universe.value.galaxyEnabled),
    };
}

// ─── Macro signals (unchanged) ────────────────────────────────────────────────

export interface MacroSignal {
    label: string;
    value: number;
    trend: 'up' | 'down' | 'flat';
    note: string;
    macroScore?: number; // -1..+1; positive = improving macro
}

export interface MacroContextOptions {
    /**
     * Fetch macro signals as soon as the composable is instantiated. Defaults
     * to `false` — macro context is scan-gated, so callers (e.g. the macro
     * Panel) trigger `refresh()` explicitly once a scan starts. Auto-fetching
     * on mount would defeat the "blank until scanned" dashboard behavior.
     */
    autoRefresh?: boolean;
}

function useMacroSignals(stateKey: string, endpoint: string, options: MacroContextOptions = {}) {
    const signals = useState<MacroSignal[]>(stateKey, () => []);
    const loading = ref(false);

    async function refresh() {
        loading.value = true;
        try {
            const res = await $fetch<MacroSignal[]>(endpoint);
            signals.value = Array.isArray(res) ? res : [];
        } catch {
            signals.value = [];
        } finally {
            loading.value = false;
        }
    }

    if (options.autoRefresh && !signals.value.length && !loading.value) {
        void refresh();
    }

    return {
        signals: computed(() => signals.value),
        loading: computed(() => loading.value),
        refresh,
    };
}

export function useMacroContext(options: MacroContextOptions = {}) {
    return useMacroSignals('macro-context-signals-polymarket', '/api/macro/polymarket', options);
}

export function useFredMacroContext(options: MacroContextOptions = {}) {
    return useMacroSignals('macro-context-signals-fred', '/api/macro/fred', options);
}

export function getMacroContext(): MacroSignal[] {
    const { signals } = useMacroContext();
    return signals.value;
}
