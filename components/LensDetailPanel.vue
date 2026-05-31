<template>
    <v-expansion-panels variant="accordion" multiple>
        <v-expansion-panel v-for="lens in lensDefs" :key="lens.key">
            <v-expansion-panel-title>
                <div class="d-flex align-center" style="width: 100%">
                    <SourceBadge :source="lens.source" class="mr-3" />
                    <span class="text-body-1">{{ lens.label }}</span>
                    <v-spacer />
                    <v-chip
                        v-if="scores[lens.key] != null"
                        :color="scoreLabelColor(scores[lens.key]!)"
                        size="small"
                        label
                        class="mr-4"
                        >{{ tierLabel(scoreToLabel(scores[lens.key]!)) }}</v-chip
                    >
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
                    <div class="d-flex align-center mb-2">
                        <span class="type-label text-medium-emphasis mr-2">Traced to source</span>
                        <SourceBadge :source="lens.source" :show-icon="true" :clickable="true" />
                        <SourceBadge source="ELEMENTAL" class="ml-1" />
                    </div>
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

    import {
        type EntityRiskScore,
        type LensKey,
        scoreToLabel,
        scoreLabelColor,
        tierLabel,
        LENS_META,
    } from '~/composables/useFusedScoring';
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

    const LENS_ORDER: LensKey[] = [
        'solvency',
        'executive',
        'news',
        'market',
        'eventPressure',
        'compliance',
    ];

    const lensDefs = computed(() => {
        return LENS_ORDER.map((key) => {
            const meta = LENS_META[key];
            const override = props.lensDetails?.[key];
            return {
                key,
                label: meta.label,
                source: meta.source,
                color: meta.sourceColor,
                description: meta.description,
                metrics: override?.metrics?.length
                    ? override.metrics
                    : [{ label: 'Status', value: 'No data' }],
                findings: override?.findings?.length ? override.findings : [],
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
