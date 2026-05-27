<template>
    <div class="score-strip">
        <div v-for="lens in lenses" :key="lens.key" class="lens-row">
            <div class="d-flex justify-space-between align-center mb-1">
                <div class="d-flex align-center">
                    <v-chip
                        size="x-small"
                        variant="tonal"
                        :color="sourceColor(lens.source)"
                        label
                        class="mr-2"
                    >
                        {{ lens.source }}
                    </v-chip>
                    <span class="text-body-2">{{ lens.label }}</span>
                </div>
                <span class="font-mono text-body-1">{{ scores[lens.key] ?? '—' }}</span>
            </div>
            <v-progress-linear
                :model-value="scores[lens.key] ?? 0"
                :color="scoreColor(scores[lens.key] ?? 0)"
                height="6"
                rounded
            />
        </div>
        <div class="fused-row mt-3 pt-3">
            <div class="d-flex justify-space-between align-center mb-1">
                <span class="text-subtitle-2">Fused Risk</span>
                <span class="font-mono text-h6">{{ scores.fused }}</span>
            </div>
            <v-progress-linear
                :model-value="scores.fused"
                :color="scoreColor(scores.fused)"
                height="10"
                rounded
            />
            <div class="d-flex justify-space-between align-center mt-2">
                <span class="text-caption text-medium-emphasis">
                    Confidence: <strong class="ml-1">{{ confidenceLevel }}</strong>
                </span>
                <span v-if="conflicts.length" class="text-caption">
                    <v-icon size="x-small" color="warning">mdi-alert-circle-outline</v-icon>
                    <span class="ml-1 text-warning">Conflict: {{ conflictSummary }}</span>
                </span>
                <span v-else class="text-caption text-success">
                    <v-icon size="x-small" color="success">mdi-check-circle-outline</v-icon>
                    Sources agree
                </span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    import type { EntityRiskScore } from '~/composables/useFusedScoring';

    const props = defineProps<{
        scores: EntityRiskScore;
        conflicts: Array<{ lens: string; delta: number }>;
        confidenceLevel: 'High' | 'Medium' | 'Low';
    }>();

    const lenses = [
        { key: 'solvency', label: 'Solvency (FHS)', source: 'SEC' },
        { key: 'executive', label: 'Executive Risk (ERS)', source: 'SEC' },
        { key: 'compliance', label: 'Adversarial Capital (ACS)', source: 'CSL' },
        { key: 'eventPressure', label: 'Event Pressure', source: 'NEWS' },
        { key: 'news', label: 'News Pressure', source: 'NEWS' },
        { key: 'market', label: 'Market Signal', source: 'STOCK' },
    ] as const;

    function scoreColor(v: number) {
        if (v >= 80) return 'error';
        if (v >= 65) return 'warning';
        if (v >= 50) return 'info';
        return 'success';
    }

    function sourceColor(src: string) {
        switch (src) {
            case 'SEC':
                return 'primary';
            case 'NEWS':
                return 'info';
            case 'STOCK':
                return 'success';
            case 'POLY':
                return 'warning';
            case 'CSL':
            case 'OFAC':
                return 'error';
            default:
                return 'grey';
        }
    }

    const conflictSummary = computed(() =>
        props.conflicts
            .slice(0, 2)
            .map((c) => `${c.lens} ${c.delta > 0 ? '+' : ''}${c.delta}`)
            .join(', ')
    );
</script>

<style scoped>
    .score-strip {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .fused-row {
        border-top: 1px solid rgba(var(--dynamic-fg-rgb), 0.08);
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
