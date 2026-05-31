<template>
    <div class="score-strip">
        <div v-for="lens in lenses" :key="lens.key" class="lens-row">
            <div class="d-flex justify-space-between align-center mb-1">
                <div class="d-flex align-center">
                    <SourceBadge :source="lens.source" class="mr-2" />
                    <span class="text-body-2">{{ lens.label }}</span>
                    <HelpTooltip :text="lens.description" :size="13" />
                </div>
                <v-chip
                    v-if="scores[lens.key] != null"
                    :color="scoreLabelColor(scores[lens.key]!)"
                    size="x-small"
                    label
                    >{{ tierLabel(scoreToLabel(scores[lens.key]!)) }}</v-chip
                >
                <span v-else>—</span>
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
                <span class="text-subtitle-2">{{ FUSED_LABEL }}</span>
                <v-chip :color="scoreLabelColor(scores.fused)" size="small" label>{{
                    tierLabel(scoreToLabel(scores.fused))
                }}</v-chip>
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

    import {
        type EntityRiskScore,
        type LensKey,
        scoreToLabel,
        scoreLabelColor,
        tierLabel,
        LENS_META,
        FUSED_LABEL,
    } from '~/composables/useFusedScoring';

    const props = defineProps<{
        scores: EntityRiskScore;
        conflicts: Array<{ lens: string; delta: number }>;
        confidenceLevel: 'High' | 'Medium' | 'Low';
    }>();

    const LENS_ORDER: LensKey[] = [
        'solvency',
        'executive',
        'compliance',
        'eventPressure',
        'news',
        'market',
    ];

    const lenses = LENS_ORDER.map((key) => ({
        key,
        label: LENS_META[key].label,
        description: LENS_META[key].description,
        source: LENS_META[key].source,
    }));

    function scoreColor(v: number) {
        if (v >= 80) return 'error';
        if (v >= 65) return 'warning';
        if (v >= 50) return 'info';
        return 'success';
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
