import { computed, ref } from 'vue';

export interface StockEntityProfileData {
    neid: string;
    entityName: string;
    instrumentName: string | null;
    ticker: string | null;
    exchange: string | null;
    currency: string | null;
    latestClose: number | null;
    latestDate: string | null;
    returnPct45d: number | null;
    annualizedVolPct: number | null;
    periodHigh: number | null;
    periodLow: number | null;
    samples: number;
    prices: Array<{ date: string; close: number }>;
    technical: Array<{ label: string; value: string }>;
    keyMetrics: Array<{ label: string; value: string }>;
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

    function currentKey(portfolioId: string, neid: string) {
        return `${portfolioId}|${neid}`;
    }

    async function load(portfolioId: string, neid: string, force = false) {
        const key = currentKey(portfolioId, neid);
        if (!force && cache.has(key)) {
            data.value = cache.get(key)!;
            error.value = null;
            return data.value;
        }

        loading.value = true;
        error.value = null;
        try {
            const profile = await $fetch<StockEntityProfileData>(
                `/api/portfolios/${portfolioId}/entity/${neid}/stock`
            );
            cache.set(key, profile);
            data.value = profile;
            return profile;
        } catch (e: any) {
            error.value = e?.message || 'Failed to load stock entity profile';
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
        load,
        clear,
    };
}
