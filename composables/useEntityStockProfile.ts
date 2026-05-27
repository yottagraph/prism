import { computed, ref } from 'vue';

export interface StockEntityProfileData {
    neid: string;
    entityName: string;
    instrumentNeid: string | null;
    instrumentName: string | null;
    ticker: string | null;
    exchange: string | null;
    currency: string | null;
    sector: string | null;
    industry: string | null;
    latestClose: number | null;
    latestDate: string | null;
    returnPct: number | null;
    annualizedVolPct: number | null;
    periodHigh: number | null;
    periodLow: number | null;
    samples: number;
    prices: Array<{
        date: string;
        close: number;
        open?: number;
        high?: number;
        low?: number;
        volume?: number;
    }>;
    technical: Array<{ label: string; value: string }>;
    keyMetrics: Array<{ label: string; value: string }>;
    relatedInstruments: Array<{ neid: string; name: string }>;
    dataGaps: string[];
    citations: Array<{
        ref?: string;
        url?: string;
        title?: string;
        source?: string;
        date?: string;
        snippet?: string;
    }>;
}

const cache = new Map<string, StockEntityProfileData>();

export function useEntityStockProfile() {
    const data = ref<StockEntityProfileData | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const statusMessage = ref('Idle');
    let statusTimer: ReturnType<typeof setInterval> | null = null;

    function currentKey(portfolioId: string, neid: string) {
        return `${portfolioId}|${neid}`;
    }

    function startStatusTicker(messages: string[]) {
        let idx = 0;
        statusMessage.value = messages[idx];
        if (statusTimer) clearInterval(statusTimer);
        statusTimer = setInterval(() => {
            idx = (idx + 1) % messages.length;
            statusMessage.value = messages[idx];
        }, 1200);
    }

    function stopStatusTicker(finalMessage?: string) {
        if (statusTimer) clearInterval(statusTimer);
        statusTimer = null;
        if (finalMessage) statusMessage.value = finalMessage;
    }

    async function load(portfolioId: string, neid: string, force = false) {
        const key = currentKey(portfolioId, neid);
        if (!force && cache.has(key)) {
            data.value = cache.get(key)!;
            error.value = null;
            statusMessage.value = 'Stock entity loaded from cache';
            return data.value;
        }

        loading.value = true;
        error.value = null;
        startStatusTicker([
            'Resolving stock instrument…',
            'Loading Elemental stock properties…',
            'Fetching price history…',
            'Finalizing stock entity data…',
        ]);
        try {
            const profile = await $fetch<StockEntityProfileData>(
                `/api/portfolios/${portfolioId}/entity/${neid}/stock`
            );
            cache.set(key, profile);
            data.value = profile;
            stopStatusTicker('Stock entity ready');
            return profile;
        } catch (e: any) {
            error.value = e?.message || 'Failed to load stock entity profile';
            stopStatusTicker('Stock entity load failed');
            throw e;
        } finally {
            loading.value = false;
        }
    }

    function clear(portfolioId?: string, neid?: string) {
        if (portfolioId && neid) {
            cache.delete(currentKey(portfolioId, neid));
            return;
        }
        cache.clear();
    }

    return {
        data: computed(() => data.value),
        loading: computed(() => loading.value),
        error: computed(() => error.value),
        statusMessage: computed(() => statusMessage.value),
        load,
        clear,
    };
}
