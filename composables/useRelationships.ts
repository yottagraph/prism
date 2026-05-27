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

export interface PortfolioStockTickerRow {
    neid: string;
    entityName: string;
    ticker: string | null;
    latestClose: number | null;
    latestDate: string | null;
    rsi14: number | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    trend: 'bullish' | 'bearish' | 'neutral' | null;
    anomalyScore: number | null;
    anomalyType:
        | 'price_spike_up'
        | 'price_spike_down'
        | 'volume_surge'
        | 'high_volatility'
        | 'multi_signal'
        | null;
    returnZscore: number | null;
    volumeZscore: number | null;
    volatilityZscore: number | null;
    samples: number;
}

export interface PortfolioStockAnomalyRow {
    neid: string;
    ticker: string | null;
    entityName: string;
    priceDate: string;
    closePrice: number | null;
    dailyReturn: number | null;
    anomalyScore: number;
    anomalyType:
        | 'price_spike_up'
        | 'price_spike_down'
        | 'volume_surge'
        | 'high_volatility'
        | 'multi_signal'
        | null;
    returnZscore: number | null;
    volumeZscore: number | null;
    volatilityZscore: number | null;
}

export interface PortfolioStockAnalytics {
    generatedAt: string;
    tickers: PortfolioStockTickerRow[];
    anomalies: PortfolioStockAnomalyRow[];
    totalAnomalyCount: number;
    summary: {
        tickersAnalyzed: number;
        bullishCount: number;
        bearishCount: number;
        neutralCount: number;
        anomaliesCount: number;
        oversoldCount: number;
        overboughtCount: number;
        rsiNeutralCount: number;
    };
    dataGaps: string[];
}

export function useRelationships(portfolio: import('vue').Ref<PortfolioDoc | null>) {
    const loading = ref(false);
    const remoteGraph = ref<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
    const remoteCompanies = ref<RelatedCompanyRow[]>([]);
    const remotePeople = ref<PersonRow[]>([]);
    const remoteInstruments = ref<InstrumentRow[]>([]);
    const remoteLocations = ref<LocationRow[]>([]);
    const remotePatterns = ref<PortfolioPattern[]>([]);
    const remoteStocks = ref<PortfolioStockAnalytics | null>(null);

    watch(
        portfolio,
        async (value) => {
            if (!value?.id) {
                loading.value = false;
                remoteGraph.value = { nodes: [], edges: [] };
                remoteCompanies.value = [];
                remotePeople.value = [];
                remoteInstruments.value = [];
                remoteLocations.value = [];
                remotePatterns.value = [];
                remoteStocks.value = null;
                return;
            }
            const entities = value.entities
                .filter((entity) => entity.neid)
                .map((entity) => ({ neid: entity.neid!, name: entity.resolvedName }))
                .slice(0, 20);
            if (!entities.length) {
                loading.value = false;
                remoteGraph.value = { nodes: [], edges: [] };
                remoteCompanies.value = [];
                remotePeople.value = [];
                remoteInstruments.value = [];
                remoteLocations.value = [];
                remotePatterns.value = [];
                remoteStocks.value = null;
                return;
            }

            loading.value = true;
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
                    stocksRes,
                ] = await Promise.all([
                    $fetch<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
                        `${base}/graph?entities=${encoded}`
                    ),
                    $fetch<RelatedCompanyRow[]>(`${base}/companies?entities=${encoded}`),
                    $fetch<PersonRow[]>(`${base}/people?entities=${encoded}`),
                    $fetch<InstrumentRow[]>(`${base}/instruments?entities=${encoded}`),
                    $fetch<LocationRow[]>(`${base}/locations?entities=${encoded}`),
                    $fetch<PortfolioPattern[]>(`${base}/patterns?entities=${encoded}`),
                    $fetch<PortfolioStockAnalytics>(`${base}/stocks?entities=${encoded}`),
                ]);
                remoteGraph.value = graphRes;
                remoteCompanies.value = companiesRes;
                remotePeople.value = peopleRes;
                remoteInstruments.value = instrumentsRes;
                remoteLocations.value = locationsRes;
                remotePatterns.value = patternsRes;
                remoteStocks.value = stocksRes;
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
                remoteStocks.value = null;
            } finally {
                loading.value = false;
            }
        },
        { immediate: true, deep: true }
    );

    return {
        loading: computed(() => loading.value),
        graph: computed(() => remoteGraph.value),
        companies: computed(() => remoteCompanies.value),
        people: computed(() => remotePeople.value),
        instruments: computed(() => remoteInstruments.value),
        locations: computed(() => remoteLocations.value),
        patterns: computed(() => remotePatterns.value),
        stocks: computed(() => remoteStocks.value),
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
