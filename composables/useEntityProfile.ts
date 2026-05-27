/**
 * Entity Deep Dive composable.
 *
 * Loads a single entity from Elemental, hydrates relationships, events, and
 * derives multi-source risk drivers from the server profile route. The caller
 * passes the NEID (resolved from the portfolio table).
 */

import { computed, ref, watch } from 'vue';

import {
    type EntityRiskScore,
    type RiskDriver,
    type SourceFusionWeights,
} from './useFusedScoring';

export interface EntityProperty {
    pid: number;
    name: string;
    value: string | number | null;
}

export interface RelatedEntityRef {
    neid: string;
    name: string;
    relationship: string;
}

export interface EntityProfileData {
    neid: string;
    name: string;
    ticker?: string | null;
    cik?: string | null;
    sector?: string | null;
    entityType?: string | null;
    properties: EntityProperty[];
    relationships: {
        companies: RelatedEntityRef[];
        people: RelatedEntityRef[];
        instruments: RelatedEntityRef[];
        locations: RelatedEntityRef[];
    };
    events: Array<{
        date: string;
        category: string;
        title: string;
        severity: 'low' | 'medium' | 'high';
        citations?: Array<{
            ref?: string;
            url?: string;
            title?: string;
            source?: string;
            date?: string;
            snippet?: string;
        }>;
    }>;
    scores: EntityRiskScore;
    drivers: RiskDriver[];
    conflicts: Array<{ lens: keyof EntityRiskScore | string; delta: number }>;
    confidenceLevel: 'High' | 'Medium' | 'Low';
    lensDetails?: Record<
        string,
        {
            metrics: Array<{ label: string; value: string; ref?: string }>;
            findings: Array<{
                text: string;
                date?: string;
                citations: Array<{
                    ref?: string;
                    url?: string;
                    title?: string;
                    source?: string;
                    date?: string;
                    snippet?: string;
                }>;
            }>;
        }
    >;
}

const cache = new Map<string, EntityProfileData>();

export function useEntityProfile(neid: import('vue').Ref<string | null>) {
    const data = ref<EntityProfileData | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function load(forNeid: string, weights: SourceFusionWeights) {
        const cacheKey = `${forNeid}|${JSON.stringify(weights)}`;
        if (cache.has(cacheKey)) {
            data.value = cache.get(cacheKey)!;
            return;
        }
        loading.value = true;
        error.value = null;
        try {
            const { activePortfolio } = usePortfolio();
            const activePortfolioId = activePortfolio.value?.id || 'default';
            const profile = await $fetch<EntityProfileData>(
                `/api/portfolios/${activePortfolioId}/entity/${forNeid}/profile`
            );
            cache.set(cacheKey, profile);
            data.value = profile;
        } catch (e: any) {
            error.value = e?.message || 'Failed to load entity profile';
        } finally {
            loading.value = false;
        }
    }

    watch(
        neid,
        async (val) => {
            if (!val) {
                data.value = null;
                return;
            }
            const { weights } = usePortfolio();
            await load(val, weights.value);
        },
        { immediate: true }
    );

    function refresh(weights: SourceFusionWeights) {
        if (!neid.value) return;
        cache.delete(`${neid.value}|${JSON.stringify(weights)}`);
        return load(neid.value, weights);
    }

    return {
        data: computed(() => data.value),
        loading: computed(() => loading.value),
        error: computed(() => error.value),
        refresh,
    };
}
