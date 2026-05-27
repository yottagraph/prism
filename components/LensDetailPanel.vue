<template>
    <v-expansion-panels variant="accordion" multiple>
        <v-expansion-panel v-for="lens in lensDefs" :key="lens.key">
            <v-expansion-panel-title>
                <div class="d-flex align-center" style="width: 100%">
                    <v-chip size="x-small" variant="tonal" :color="lens.color" label class="mr-3">
                        {{ lens.source }}
                    </v-chip>
                    <span class="text-body-1">{{ lens.label }}</span>
                    <v-spacer />
                    <span
                        class="font-mono text-body-1 mr-4"
                        :style="`color: var(--v-theme-${scoreColor(scores[lens.key] ?? 0)})`"
                    >
                        {{ scores[lens.key] }}
                    </span>
                </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
                <div class="lens-body">
                    <div class="text-body-2 text-medium-emphasis mb-3">
                        {{ lens.description }}
                    </div>
                    <div class="metrics-grid mb-3">
                        <div v-for="m in lens.metrics" :key="m.label" class="metric-box">
                            <div class="text-caption text-medium-emphasis text-uppercase">
                                {{ m.label }}
                            </div>
                            <div class="text-h6 font-mono">{{ m.value }}</div>
                        </div>
                    </div>
                    <v-divider class="my-3" />
                    <div class="text-caption text-medium-emphasis mb-2">EVIDENCE</div>
                    <div v-if="lens.findings.length" class="finding-list">
                        <v-card
                            v-for="(finding, idx) in lens.findings"
                            :key="`${lens.key}-${idx}`"
                            class="finding-card mb-2 pa-3"
                            variant="flat"
                        >
                            <div class="text-body-2">{{ finding.text }}</div>
                            <div
                                v-if="finding.citations?.length"
                                class="d-flex flex-wrap ga-2 mt-2"
                            >
                                <CitationChip
                                    v-for="(citation, citationIdx) in finding.citations"
                                    :key="`${lens.key}-${idx}-${citationIdx}`"
                                    :citation="citation"
                                />
                            </div>
                        </v-card>
                    </div>
                    <v-alert v-else density="compact" variant="tonal" type="info">
                        No Elemental evidence available for this lens yet.
                    </v-alert>
                </div>
            </v-expansion-panel-text>
        </v-expansion-panel>
    </v-expansion-panels>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    import type { EntityRiskScore } from '~/composables/useFusedScoring';
    import CitationChip from '~/components/CitationChip.vue';

    const props = defineProps<{
        scores: EntityRiskScore;
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
    }>();

    function scoreColor(v: number) {
        if (v >= 80) return 'error';
        if (v >= 65) return 'warning';
        if (v >= 50) return 'info';
        return 'success';
    }

    const lensDefs = computed(() => {
        const generated = [
            {
                key: 'solvency' as const,
                label: 'Solvency (SEC)',
                source: 'SEC',
                color: 'primary',
                description:
                    'Financial Health Score derived from filing fundamentals and solvency metrics.',
            },
            {
                key: 'executive' as const,
                label: 'Executive Risk (SEC)',
                source: 'SEC',
                color: 'primary',
                description:
                    'Governance and key-person stability from officer, director, and departure signals.',
            },
            {
                key: 'news' as const,
                label: 'News Pressure',
                source: 'NEWS',
                color: 'info',
                description:
                    'Sentiment, mention velocity, and adverse cluster detection from the platform news layer.',
            },
            {
                key: 'market' as const,
                label: 'Market Signal',
                source: 'STOCK',
                color: 'success',
                description: 'Price, volatility, and anomaly detection from the market data layer.',
            },
            {
                key: 'eventPressure' as const,
                label: 'Event Pressure',
                source: 'NEWS',
                color: 'warning',
                description:
                    'Recency-weighted pressure score from adverse event clusters in the last 14 days.',
            },
            {
                key: 'compliance' as const,
                label: 'Adversarial Capital (ACS)',
                source: 'CSL',
                color: 'error',
                description:
                    'Ownership-path and screening-list exposure with FOCI-oriented jurisdiction breakdown.',
            },
        ];
        return generated.map((lens) => {
            const override = props.lensDetails?.[lens.key];
            if (!override) {
                return {
                    ...lens,
                    metrics: [{ label: 'Status', value: 'No data' }],
                    findings: [],
                };
            }
            return {
                ...lens,
                metrics: override.metrics?.length
                    ? override.metrics
                    : [{ label: 'Status', value: 'No data' }],
                findings: override.findings?.length ? override.findings : [],
            };
        });
    });
</script>

<style scoped>
    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
    }

    .metric-box {
        background: rgba(var(--dynamic-fg-rgb), 0.03);
        border-radius: 8px;
        padding: 10px 12px;
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
    }

    .finding-list {
        display: flex;
        flex-direction: column;
    }

    .finding-card {
        background: rgba(var(--dynamic-fg-rgb), 0.02);
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
