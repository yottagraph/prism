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
                        <span class="text-body-2 flex-grow-1 macro-metric-label">{{
                            m.label
                        }}</span>
                        <span class="d-flex align-center" style="gap: 3px">
                            <strong class="text-body-2">{{
                                m.displayValue ?? String(m.value)
                            }}</strong>
                            <v-icon size="x-small" :color="scoreColor(m.macroScore)">
                                {{ trendIcon(m.trend) }}
                            </v-icon>
                        </span>
                    </div>
                    <div class="macro-viz">
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
                    </div>
                    <div class="macro-axis d-flex justify-space-between">
                        <span>{{ formatAxisDate(m.historyStart) }}</span>
                        <span>{{ formatAxisDate(m.historyEnd) }}</span>
                    </div>
                    <div class="macro-note text-center text-caption text-medium-emphasis">
                        {{ m.note }}
                    </div>
                </div>
            </template>

            <!-- Probability rows (Polymarket): gauge with 50% midline -->
            <template v-else>
                <div v-for="m in signals" :key="m.label" class="macro-row">
                    <div class="d-flex align-center mb-1">
                        <span
                            class="text-body-2 flex-grow-1 macro-metric-label"
                            :title="m.note || m.label"
                        >
                            {{ m.note || m.label }}
                        </span>
                        <span class="d-flex align-center" style="gap: 3px">
                            <strong class="text-body-2">{{
                                m.displayValue ?? `${m.value}%`
                            }}</strong>
                            <v-icon size="x-small" :color="scoreColor(m.macroScore)">
                                {{ trendIcon(m.trend) }}
                            </v-icon>
                        </span>
                    </div>
                    <div class="macro-viz">
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
                    </div>
                    <div class="macro-axis d-flex justify-space-between">
                        <span>0%</span>
                        <span>100%</span>
                    </div>
                    <div class="macro-note text-caption text-medium-emphasis">{{ m.label }}</div>
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

    const MONTHS = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ];

    /** Compact "Mon YYYY" axis label for a sparkline endpoint date. */
    function formatAxisDate(iso?: string | null): string {
        if (!iso) return '';
        const match = iso.match(/^(\d{4})-(\d{2})/);
        if (!match) return iso.slice(0, 7);
        const month = MONTHS[parseInt(match[2], 10) - 1] ?? match[2];
        return `${month} ${match[1]}`;
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

    .macro-metric-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* Shared viz slot — keeps the sparkline lane and the gauge lane the same
       row height so metric headings line up across Fundamentals and Outlook. */
    .macro-viz {
        height: 28px;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    /* Time / scale axis under each viz (start ↔ end dates, or 0% ↔ 100%). */
    .macro-axis {
        margin-top: 2px;
        font-size: 0.65rem;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        color: rgba(var(--v-theme-on-surface), 0.55);
    }

    .macro-note {
        margin-top: 4px;
        line-height: 1.3;
        min-height: 16px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* Probability gauge */
    .prob-gauge-wrap {
        position: relative;
        width: 100%;
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
</style>
