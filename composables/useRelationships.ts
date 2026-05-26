import { computed, ref, watch } from 'vue';

import type { PortfolioDoc } from './usePortfolio';

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

export function useRelationships(portfolio: import('vue').Ref<PortfolioDoc | null>) {
    const remoteGraph = ref<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
    const remoteCompanies = ref<RelatedCompanyRow[]>([]);
    const remotePeople = ref<PersonRow[]>([]);
    const remoteInstruments = ref<InstrumentRow[]>([]);
    const remoteLocations = ref<LocationRow[]>([]);
    const remotePatterns = ref<PortfolioPattern[]>([]);

    watch(
        portfolio,
        async (value) => {
            if (!value?.id) {
                remoteGraph.value = { nodes: [], edges: [] };
                remoteCompanies.value = [];
                remotePeople.value = [];
                remoteInstruments.value = [];
                remoteLocations.value = [];
                remotePatterns.value = [];
                return;
            }
            const entities = value.entities
                .filter((entity) => entity.neid)
                .map((entity) => ({ neid: entity.neid!, name: entity.resolvedName }))
                .slice(0, 20);
            if (!entities.length) {
                remoteGraph.value = { nodes: [], edges: [] };
                remoteCompanies.value = [];
                remotePeople.value = [];
                remoteInstruments.value = [];
                remoteLocations.value = [];
                remotePatterns.value = [];
                return;
            }

            const encoded = encodeURIComponent(JSON.stringify(entities));
            const base = `/api/portfolios/${value.id}/relationships`;
            try {
                const [
                    graphRes,
                    companiesRes,
                    peopleRes,
                    instrumentsRes,
                    locationsRes,
                    patternsRes,
                ] = await Promise.all([
                    $fetch<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
                        `${base}/graph?entities=${encoded}`
                    ),
                    $fetch<RelatedCompanyRow[]>(`${base}/companies?entities=${encoded}`),
                    $fetch<PersonRow[]>(`${base}/people?entities=${encoded}`),
                    $fetch<InstrumentRow[]>(`${base}/instruments?entities=${encoded}`),
                    $fetch<LocationRow[]>(`${base}/locations?entities=${encoded}`),
                    $fetch<PortfolioPattern[]>(`${base}/patterns?entities=${encoded}`),
                ]);
                remoteGraph.value = graphRes;
                remoteCompanies.value = companiesRes;
                remotePeople.value = peopleRes;
                remoteInstruments.value = instrumentsRes;
                remoteLocations.value = locationsRes;
                remotePatterns.value = patternsRes;
            } catch (error) {
                console.warn(
                    '[useRelationships] failed to load Elemental relationship data',
                    error
                );
                remoteGraph.value = { nodes: [], edges: [] };
                remoteCompanies.value = [];
                remotePeople.value = [];
                remoteInstruments.value = [];
                remoteLocations.value = [];
                remotePatterns.value = [];
            }
        },
        { immediate: true, deep: true }
    );

    return {
        graph: computed(() => remoteGraph.value),
        companies: computed(() => remoteCompanies.value),
        people: computed(() => remotePeople.value),
        instruments: computed(() => remoteInstruments.value),
        locations: computed(() => remoteLocations.value),
        patterns: computed(() => remotePatterns.value),
    };
}

export interface MacroSignal {
    label: string;
    value: number;
    trend: 'up' | 'down' | 'flat';
    note: string;
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
