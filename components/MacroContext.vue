<template>
    <div>
        <div class="d-flex align-center mb-2">
            <span class="text-subtitle-2">{{ title }}</span>
            <v-chip size="x-small" variant="tonal" :color="laneColor" class="ml-2 text-capitalize">
                {{ effectiveLaneLabel }}
            </v-chip>
            <span class="text-caption text-medium-emphasis ml-auto">via {{ source }}</span>
        </div>

        <div v-if="!signals.length" class="text-caption text-medium-emphasis">
            No live {{ source }} macro signals available.
        </div>

        <div class="macro-grid">
            <!-- Fundamental rows (FRED): actual value + delta + sparkline -->
            <template v-if="isFundamental">
                <div v-for="m in signals" :key="m.label" class="macro-row">
                    <div class="d-flex align-center mb-1">
                        <span class="text-body-2 flex-grow-1">{{ m.label }}</span>
                        <span class="d-flex align-center" style="gap: 3px">
                            <strong class="text-body-2">{{
                                m.displayValue ?? String(m.value)
                            }}</strong>
                            <v-icon size="x-small" :color="scoreColor(m.macroScore)">
                                {{ trendIcon(m.trend) }}
                            </v-icon>
                        </span>
                    </div>
                    <v-sparkline
                        v-if="m.history && m.history.length > 1"
                        :model-value="m.history"
                        :color="scoreColor(m.macroScore)"
                        height="28"
                        line-width="2"
                        smooth
                        auto-draw
                        auto-draw-duration="600"
                    />
                    <div class="text-caption text-medium-emphasis mt-1">{{ m.note }}</div>
                </div>
            </template>

            <!-- Probability rows (Polymarket): gauge with 50% midline -->
            <template v-else>
                <div v-for="m in signals" :key="m.label" class="macro-row">
                    <div class="d-flex align-center mb-1">
                        <span class="text-body-2 flex-grow-1">{{ m.label }}</span>
                        <span class="d-flex align-center" style="gap: 3px">
                            <strong class="text-body-2">{{
                                m.displayValue ?? `${m.value}%`
                            }}</strong>
                            <v-icon size="x-small" :color="scoreColor(m.macroScore)">
                                {{ trendIcon(m.trend) }}
                            </v-icon>
                        </span>
                    </div>
                    <div class="prob-gauge-wrap">
                        <div
                            class="prob-gauge-fill"
                            :style="{
                                width: `${Math.min(100, Math.max(0, m.value))}%`,
                                backgroundColor: gaugeColorVar(m.macroScore),
                            }"
                        />
                        <div class="prob-gauge-midline" />
                    </div>
                    <div class="text-caption text-medium-emphasis mt-1 prob-note">{{ m.note }}</div>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { MacroSignal } from '~/composables/useRelationships';

    const props = withDefaults(
        defineProps<{
            signals: MacroSignal[];
            title?: string;
            source?: string;
            /** Visual lane variant label: 'realized' for FRED fundamentals, 'market-implied' for Polymarket. */
            laneLabel?: string;
        }>(),
        {
            title: 'Macro Context',
            source: 'Polymarket',
            laneLabel: 'market-implied',
        }
    );

    const effectiveLaneLabel = computed(() => props.laneLabel);

    /** Detect fundamental vs probability based on first signal's kind (or prop fallback). */
    const isFundamental = computed(
        () => props.signals.length > 0 && props.signals[0].kind === 'fundamental'
    );

    const laneColor = computed(() => (isFundamental.value ? 'secondary' : 'primary'));

    function scoreColor(macroScore?: number): string {
        if (macroScore == null || macroScore === 0) return 'grey';
        return macroScore > 0 ? 'success' : 'error';
    }

    function gaugeColorVar(macroScore?: number): string {
        if (macroScore == null || macroScore === 0) return 'rgba(var(--v-border-color), 0.6)';
        return macroScore > 0 ? 'rgb(var(--v-theme-success))' : 'rgb(var(--v-theme-error))';
    }

    function trendIcon(trend: MacroSignal['trend']): string {
        if (trend === 'up') return 'mdi-arrow-up-thick';
        if (trend === 'down') return 'mdi-arrow-down-thick';
        return 'mdi-minus-thick';
    }
</script>

<style scoped>
    .macro-grid {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }

    .macro-row {
        min-width: 0;
    }

    /* Probability gauge */
    .prob-gauge-wrap {
        position: relative;
        height: 6px;
        background: rgba(var(--v-border-color), 0.12);
        border-radius: 3px;
        overflow: visible;
    }

    .prob-gauge-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.4s ease;
        min-width: 2px;
    }

    /* 50% midline marker */
    .prob-gauge-midline {
        position: absolute;
        left: 50%;
        top: -3px;
        bottom: -3px;
        width: 1.5px;
        background: rgba(var(--v-border-color), 0.45);
        border-radius: 1px;
    }

    .prob-note {
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
</style>
