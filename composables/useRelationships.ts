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

export function useRelationships(portfolio: import('vue').Ref<PortfolioDoc | null>) {
    const loading = ref(false);
    const universe = ref<RelationshipUniverse>({
        nodes: [],
        edges: [],
        companies: [],
        people: [],
        instruments: [],
        locations: [],
        galaxyEnabled: false,
    });

    watch(
        portfolio,
        async (value) => {
            if (!value?.id) {
                loading.value = false;
                universe.value = {
                    nodes: [],
                    edges: [],
                    companies: [],
                    people: [],
                    instruments: [],
                    locations: [],
                    galaxyEnabled: false,
                };
                return;
            }
            const entities = value.entities
                .filter((entity) => entity.neid)
                .map((entity) => ({ neid: entity.neid!, name: entity.resolvedName }))
                .slice(0, 20);
            if (!entities.length) {
                loading.value = false;
                universe.value = {
                    nodes: [],
                    edges: [],
                    companies: [],
                    people: [],
                    instruments: [],
                    locations: [],
                    galaxyEnabled: false,
                };
                return;
            }

            loading.value = true;
            const encoded = encodeURIComponent(JSON.stringify(entities));
            const url = `/api/portfolios/${value.id}/relationships/universe?entities=${encoded}`;
            try {
                const res = await $fetch<RelationshipUniverse>(url);
                universe.value = res;
            } catch (error) {
                console.warn('[useRelationships] failed to load relationship universe', error);
                universe.value = {
                    nodes: [],
                    edges: [],
                    companies: [],
                    people: [],
                    instruments: [],
                    locations: [],
                    galaxyEnabled: false,
                };
            } finally {
                loading.value = false;
            }
        },
        { immediate: true, deep: true }
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

export interface MacroSignal {
    label: string;
    value: number;
    trend: 'up' | 'down' | 'flat';
    note: string;
    macroScore?: number; // -1..+1; positive = improving macro
}

function useMacroSignals(stateKey: string, endpoint: string) {
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

    if (!signals.value.length && !loading.value) {
        void refresh();
    }

    return {
        signals: computed(() => signals.value),
        loading: computed(() => loading.value),
        refresh,
    };
}

export function useMacroContext() {
    return useMacroSignals('macro-context-signals-polymarket', '/api/macro/polymarket');
}

export function useFredMacroContext() {
    return useMacroSignals('macro-context-signals-fred', '/api/macro/fred');
}

export function getMacroContext(): MacroSignal[] {
    const { signals } = useMacroContext();
    return signals.value;
}
