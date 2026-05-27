<template>
    <div>
        <div class="d-flex align-center mb-3">
            <div class="text-subtitle-1">Stock Entity</div>
            <v-spacer />
            <v-btn
                size="small"
                variant="text"
                prepend-icon="mdi-refresh"
                :loading="loading"
                @click="$emit('refresh')"
            >
                Refresh stock data
            </v-btn>
        </div>

        <v-progress-linear v-if="loading" indeterminate class="mb-3" />
        <v-alert v-if="error" type="warning" variant="tonal" class="mb-3">
            {{ error }}
        </v-alert>
        <v-alert v-if="!stock && !loading && !error" type="info" variant="tonal" class="mb-3">
            Select this tab to load stock entity data.
        </v-alert>

        <template v-if="stock">
            <v-alert
                v-if="stock.canonicalNeid"
                type="info"
                variant="tonal"
                density="compact"
                class="mb-3"
            >
                Stored portfolio NEID was orphaned in Elemental. Re-resolved to canonical
                <span class="font-mono">{{ stock.canonicalNeid }}</span> via name search. Re-scan
                the portfolio to update stored NEIDs.
            </v-alert>
            <v-card class="pa-4 mb-3">
                <div class="d-flex align-center flex-wrap ga-2">
                    <div class="text-h6">{{ stock.entityName }}</div>
                    <v-chip v-if="stock.ticker" size="small" variant="tonal" color="primary">
                        {{ stock.ticker }}
                    </v-chip>
                    <v-chip v-if="stock.exchange" size="small" variant="tonal">
                        {{ stock.exchange }}
                    </v-chip>
                    <v-chip v-if="stock.currency" size="small" variant="tonal">
                        {{ stock.currency }}
                    </v-chip>
                    <v-spacer />
                    <div class="text-body-2 text-medium-emphasis">
                        {{ latestPriceText }}
                    </div>
                </div>
                <div v-if="stock.instrumentName" class="text-caption text-medium-emphasis mt-2">
                    Instrument: {{ stock.instrumentName }}
                </div>
                <div v-if="stock.relatedInstruments.length" class="d-flex flex-wrap ga-1 mt-2">
                    <v-chip
                        v-for="rel in stock.relatedInstruments"
                        :key="rel.neid"
                        size="x-small"
                        variant="outlined"
                        density="comfortable"
                    >
                        {{ rel.name }}
                    </v-chip>
                </div>
            </v-card>

            <v-row dense class="mb-3">
                <v-col cols="12" md="6">
                    <v-card class="pa-4 stock-card">
                        <div class="text-subtitle-2 mb-3">Key Metrics</div>
                        <div class="metrics-grid">
                            <div v-for="m in stock.keyMetrics" :key="m.label" class="metric-box">
                                <div class="text-caption text-medium-emphasis">{{ m.label }}</div>
                                <div class="text-body-1 font-mono">{{ m.value }}</div>
                            </div>
                        </div>
                    </v-card>
                </v-col>
                <v-col cols="12" md="6">
                    <v-card class="pa-4 stock-card">
                        <div class="text-subtitle-2 mb-3">Technical Snapshot</div>
                        <div v-if="stock.technical.length" class="metrics-grid">
                            <div v-for="m in stock.technical" :key="m.label" class="metric-box">
                                <div class="text-caption text-medium-emphasis">{{ m.label }}</div>
                                <div class="text-body-1 font-mono">{{ m.value }}</div>
                            </div>
                        </div>
                        <v-alert v-else type="info" variant="tonal" density="compact">
                            No technical indicators returned.
                        </v-alert>
                    </v-card>
                </v-col>
            </v-row>

            <v-card class="pa-4 stock-card mb-3">
                <PriceHistoryChart :ticker="stock.ticker" :prices="stock.prices" />
                <div class="text-caption text-medium-emphasis mt-2">
                    {{ stock.samples }} samples loaded{{
                        stock.latestDate ? ` · latest ${stock.latestDate}` : ''
                    }}
                </div>
            </v-card>

            <v-card class="pa-4 stock-card mb-3">
                <div class="text-subtitle-2 mb-3">Data Gaps</div>
                <ul v-if="stock.dataGaps.length" class="data-gap-list">
                    <li v-for="gap in stock.dataGaps" :key="gap">{{ gap }}</li>
                </ul>
                <div v-else class="text-body-2 text-success">No known stock data gaps.</div>
            </v-card>

            <v-card class="pa-4 stock-card">
                <div class="text-subtitle-2 mb-3">Provenance</div>
                <div v-if="stock.citations.length" class="d-flex flex-wrap ga-2">
                    <CitationChip
                        v-for="(citation, idx) in stock.citations"
                        :key="`stock-citation-${idx}`"
                        :citation="citation"
                    />
                </div>
                <v-alert v-else type="info" variant="tonal" density="compact">
                    No citation links were returned for stock data.
                </v-alert>
            </v-card>
        </template>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    import CitationChip from '~/components/CitationChip.vue';
    import PriceHistoryChart from '~/components/entity/PriceHistoryChart.vue';
    import type { StockEntityProfileData } from '~/composables/useEntityStockProfile';

    const props = defineProps<{
        stock: StockEntityProfileData | null;
        loading: boolean;
        error: string | null;
    }>();

    defineEmits<{ (e: 'refresh'): void }>();

    const latestPriceText = computed(() => {
        if (!props.stock) return '';
        if (typeof props.stock.latestClose !== 'number') return 'No latest close available';
        const ret =
            typeof props.stock.returnPct === 'number'
                ? ` · ${props.stock.returnPct >= 0 ? '+' : ''}${props.stock.returnPct.toFixed(1)}%`
                : '';
        const date = props.stock.latestDate ? ` (${props.stock.latestDate.slice(0, 10)})` : '';
        return `$${props.stock.latestClose.toFixed(2)}${ret}${date}`;
    });
</script>

<style scoped>
    .stock-card {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
    }

    .metric-box {
        border: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(255, 255, 255, 0.02);
        border-radius: 8px;
        padding: 8px 10px;
    }

    .data-gap-list {
        margin: 0;
        padding-left: 18px;
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
