<template>
    <v-card class="pa-3 fill-height">
        <div class="d-flex align-center justify-space-between mb-3">
            <div class="d-flex align-center ga-2">
                <v-icon size="small" color="success">mdi-chart-bubble</v-icon>
                <span class="text-subtitle-2">Momentum Heatmap</span>
            </div>
            <v-btn-toggle v-model="displayMode" density="compact" mandatory>
                <v-btn value="rsi" size="small">RSI</v-btn>
                <v-btn value="trend" size="small">TREND</v-btn>
            </v-btn-toggle>
        </div>

        <div v-if="!items.length" class="text-caption text-medium-emphasis py-8 text-center">
            No stock analytics available.
        </div>

        <div v-else class="heatmap-grid">
            <button
                v-for="item in items"
                :key="item.neid"
                class="heatmap-cell"
                :class="getCellClass(item)"
                type="button"
                @click="$emit('select', item)"
            >
                <div class="text-caption font-weight-bold">
                    {{ item.ticker || item.entityName }}
                </div>
                <div class="text-caption cell-detail">
                    {{ getCellLabel(item) }}
                </div>
            </button>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { ref } from 'vue';

    import type { PortfolioStockTickerRow } from '~/composables/useRelationships';

    const props = defineProps<{
        items: PortfolioStockTickerRow[];
    }>();

    defineEmits<{
        select: [item: PortfolioStockTickerRow];
    }>();

    const displayMode = ref<'rsi' | 'trend'>('rsi');

    function getCellLabel(item: PortfolioStockTickerRow) {
        if (displayMode.value === 'rsi') {
            return item.rsi14 == null ? 'RSI: n/a' : `RSI ${item.rsi14.toFixed(1)}`;
        }
        return `Trend: ${item.trend || 'n/a'}`;
    }

    function getCellClass(item: PortfolioStockTickerRow): Record<string, boolean> {
        if (displayMode.value === 'rsi') {
            if (item.rsi14 == null) return { neutral: true };
            return {
                oversold: item.rsi14 < 30,
                overbought: item.rsi14 > 70,
                neutral: item.rsi14 >= 30 && item.rsi14 <= 70,
            };
        }
        return {
            bullish: item.trend === 'bullish',
            bearish: item.trend === 'bearish',
            neutral: item.trend !== 'bullish' && item.trend !== 'bearish',
        };
    }
</script>

<style scoped>
    .heatmap-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 8px;
    }

    .heatmap-cell {
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.1);
        border-radius: 8px;
        padding: 8px;
        text-align: left;
        cursor: pointer;
        background: rgba(var(--dynamic-fg-rgb), 0.03);
        color: inherit;
        transition:
            transform 0.12s ease,
            border-color 0.12s ease;
    }

    .heatmap-cell:hover {
        transform: translateY(-1px);
        border-color: rgba(var(--dynamic-fg-rgb), 0.25);
    }

    .cell-detail {
        opacity: 0.8;
    }

    .oversold {
        background: rgba(45, 202, 112, 0.2);
        border-color: rgba(45, 202, 112, 0.45);
    }

    .overbought {
        background: rgba(244, 67, 54, 0.2);
        border-color: rgba(244, 67, 54, 0.45);
    }

    .bullish {
        background: rgba(45, 202, 112, 0.2);
        border-color: rgba(45, 202, 112, 0.45);
    }

    .bearish {
        background: rgba(244, 67, 54, 0.2);
        border-color: rgba(244, 67, 54, 0.45);
    }

    .neutral {
        background: rgba(var(--dynamic-fg-rgb), 0.04);
        border-color: rgba(var(--dynamic-fg-rgb), 0.12);
    }
</style>
