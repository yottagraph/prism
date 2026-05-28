<template>
    <v-card class="pa-4">
        <div class="d-flex align-center mb-3">
            <v-icon size="small" class="mr-2">mdi-layers-triple-outline</v-icon>
            <span class="text-subtitle-2">Source Fusion Coverage</span>
        </div>
        <v-row dense>
            <v-col v-for="src in sources" :key="src.key" cols="6" sm="3">
                <v-tooltip location="top" :disabled="!src.tooltip" :text="src.tooltip ?? ''">
                    <template #activator="{ props: tooltipProps }">
                        <div
                            v-bind="tooltipProps"
                            class="source-row"
                            :class="{ 'source-row--empty': src.tooltip }"
                        >
                            <div class="d-flex justify-space-between align-center mb-1">
                                <span class="text-caption text-uppercase letter-spaced">{{
                                    src.label
                                }}</span>
                                <span class="text-caption text-medium-emphasis">
                                    {{ src.coverage }}/{{ total }}
                                </span>
                            </div>
                            <v-progress-linear
                                :model-value="(src.coverage / Math.max(1, total)) * 100"
                                :color="src.color"
                                height="6"
                                rounded
                            />
                        </div>
                    </template>
                </v-tooltip>
            </v-col>
        </v-row>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    const props = defineProps<{
        total: number;
        coverage: { sec: number; news: number; stock: number; poly: number };
    }>();

    // Surfaced as a tooltip when the source has zero coverage across a portfolio
    // that has at least one entity. Helps disambiguate "scan hasn't run yet" from
    // "scan ran and found nothing here".
    const EMPTY_EXPLANATIONS: Record<'sec' | 'news' | 'stock' | 'poly', string> = {
        sec: 'No portfolio entities resolved with SEC filings. Check that entity names match SEC-registered issuers.',
        news: 'No news articles found for any portfolio entity in the last 90 days.',
        stock: 'No stock instruments linked to any portfolio entity in the knowledge graph.',
        poly: 'No active prediction markets found for any portfolio entity on Polymarket. Polymarket markets cluster on politics, geopolitics, and crypto — credit / FHS portfolios rarely overlap.',
    };

    type SourceKey = 'sec' | 'news' | 'stock' | 'poly';

    const sources = computed(() => {
        const rows: Array<{ key: SourceKey; label: string; coverage: number; color: string }> = [
            { key: 'sec', label: 'SEC', coverage: props.coverage.sec, color: 'primary' },
            { key: 'news', label: 'News', coverage: props.coverage.news, color: 'info' },
            { key: 'stock', label: 'Stock', coverage: props.coverage.stock, color: 'success' },
            {
                key: 'poly',
                label: 'Polymarket',
                coverage: props.coverage.poly,
                color: 'warning',
            },
        ];
        return rows.map((src) => ({
            ...src,
            tooltip:
                src.coverage === 0 && props.total > 0 ? EMPTY_EXPLANATIONS[src.key] : undefined,
        }));
    });
</script>

<style scoped>
    .letter-spaced {
        letter-spacing: 0.08em;
    }
    .source-row--empty {
        cursor: help;
    }
</style>
