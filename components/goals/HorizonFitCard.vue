<template>
    <v-card variant="outlined" class="horizon-fit-card pa-4">
        <!-- Header -->
        <div class="d-flex align-center mb-3">
            <v-icon color="primary" class="mr-2" size="small">mdi-target</v-icon>
            <span class="text-subtitle-2 font-weight-medium">Horizon fit</span>
            <v-spacer />
            <v-chip v-if="fit" :color="verdictColor" size="small" variant="flat" label>
                {{ verdictLabel }}
            </v-chip>
            <span v-else class="text-caption text-medium-emphasis">Set a goal to see fit</span>
        </div>

        <!-- No goal set -->
        <template v-if="!goal">
            <div class="d-flex align-center">
                <span class="text-body-2 text-medium-emphasis">
                    Add a purpose and horizon to see if this bucket's risk matches its timeline.
                </span>
                <v-spacer />
                <v-btn
                    size="small"
                    variant="tonal"
                    color="primary"
                    prepend-icon="mdi-plus"
                    @click="$emit('edit-goal')"
                >
                    Set goal
                </v-btn>
            </div>
        </template>

        <!-- Goal set but no scan yet -->
        <template v-else-if="!fit">
            <div class="text-body-2 text-medium-emphasis">
                Add holdings and run a scan to see risk fit.
            </div>
        </template>

        <!-- Full fit display -->
        <template v-else>
            <!-- Timeline visual -->
            <div class="timeline-container mb-3">
                <!-- Left: "need it in N years" -->
                <div class="timeline-end timeline-end--left">
                    <div class="timeline-marker" :class="`timeline-marker--${verdictColorRaw}`" />
                    <div class="timeline-label">
                        <span class="text-caption text-medium-emphasis">Need money in</span>
                        <span class="text-h6 font-weight-bold">{{ horizon }}y</span>
                    </div>
                </div>

                <!-- Center: track -->
                <div class="timeline-track">
                    <div class="timeline-bar">
                        <!-- Target zone indicator -->
                        <div
                            class="timeline-target-zone"
                            :class="`timeline-target-zone--${targetBandClass}`"
                            :style="targetZoneStyle"
                        />
                        <!-- Actual band needle -->
                        <div
                            class="timeline-needle"
                            :class="`timeline-needle--${actualBandClass}`"
                            :style="needleStyle"
                        >
                            <div class="timeline-needle-line" />
                            <div class="timeline-needle-tip" />
                        </div>
                    </div>
                    <!-- Band labels below bar -->
                    <div class="timeline-band-labels">
                        <span class="text-caption text-medium-emphasis">Conservative</span>
                        <span class="text-caption text-medium-emphasis">Moderate</span>
                        <span class="text-caption text-medium-emphasis">Aggressive</span>
                    </div>
                </div>

                <!-- Right: actual holdings band -->
                <div class="timeline-end timeline-end--right">
                    <div
                        class="timeline-marker timeline-marker--actual"
                        :class="`timeline-marker--${actualBandClass}`"
                    />
                    <div class="timeline-label timeline-label--right">
                        <span class="text-caption text-medium-emphasis">Holdings behave like</span>
                        <span
                            class="text-subtitle-2 font-weight-bold"
                            :class="`text-${actualBandClass}`"
                        >
                            {{ capitalize(fit.actualBand) }}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Reason sentence -->
            <p class="text-body-2 mb-0" :class="verdictTextClass">{{ fit.reason }}</p>

            <!-- Drawdown warning for too-aggressive -->
            <v-alert
                v-if="fit.verdict === 'too_aggressive'"
                type="error"
                variant="tonal"
                density="compact"
                icon="mdi-alert-circle-outline"
                class="mt-3"
            >
                <span class="text-body-2">{{ drawdownWarning }}</span>
            </v-alert>

            <!-- Vol coverage note -->
            <p
                v-if="fit.volCoverage > 0"
                class="text-caption text-medium-emphasis mt-2 mb-0"
                style="opacity: 0.7"
            >
                {{ Math.round(fit.volCoverage * 100) }}% of holdings scored with live volatility
                data · rest estimated from sector
            </p>
            <p v-else class="text-caption text-medium-emphasis mt-2 mb-0" style="opacity: 0.7">
                Risk band estimated from sector — run a scan for live volatility data
            </p>
        </template>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { GoalMeta } from '~/composables/usePortfolio';
    import type { DemoUser } from '~/composables/useUser';
    import type { RiskBand, HorizonFit } from '~/utils/goals/riskFit';
    import type { MacroFactorBucket } from '~/utils/macro/sectorFactors';
    import {
        bucketRiskProfile,
        horizonFit,
        drawdownStatement,
        VERDICT_COLORS,
    } from '~/utils/goals/riskFit';

    const props = defineProps<{
        goal?: GoalMeta | null;
        user?: DemoUser | null;
        holdingVols?: (number | null | undefined)[];
        holdingSectors?: (MacroFactorBucket | null | undefined)[];
    }>();

    defineEmits<{
        (e: 'edit-goal'): void;
    }>();

    const fit = computed((): HorizonFit | null => {
        if (!props.goal || !props.user) return null;
        const vols = props.holdingVols ?? [];
        const sectors = props.holdingSectors ?? [];
        const maxLen = Math.max(vols.length, sectors.length);
        const inputs = Array.from({ length: maxLen }, (_, i) => ({
            annualizedVolPct: vols[i] ?? null,
            sectorBucket: sectors[i] ?? null,
        }));
        const profile = bucketRiskProfile(inputs);
        return horizonFit(
            profile,
            props.goal.horizonYears,
            props.user.riskTolerance,
            props.goal.purpose
        );
    });

    const horizon = computed(() => props.goal?.horizonYears ?? 0);

    const verdictLabel = computed(() => {
        switch (fit.value?.verdict) {
            case 'appropriate':
                return 'On track';
            case 'too_aggressive':
                return 'Too aggressive';
            case 'too_conservative':
                return 'Too conservative';
            default:
                return '';
        }
    });

    const verdictColor = computed(() =>
        fit.value ? VERDICT_COLORS[fit.value.verdict] : 'default'
    );

    /** Raw color name without Vuetify mapping, for CSS class names. */
    const verdictColorRaw = computed(() => {
        switch (fit.value?.verdict) {
            case 'appropriate':
                return 'success';
            case 'too_aggressive':
                return 'error';
            case 'too_conservative':
                return 'warning';
            default:
                return 'default';
        }
    });

    const verdictTextClass = computed(() => {
        if (!fit.value || fit.value.verdict === 'appropriate') return 'text-medium-emphasis';
        return fit.value.verdict === 'too_aggressive' ? 'text-error' : 'text-warning';
    });

    function bandClass(band: RiskBand): string {
        switch (band) {
            case 'aggressive':
                return 'error';
            case 'moderate':
                return 'warning';
            case 'conservative':
                return 'success';
            default:
                return 'default';
        }
    }

    const actualBandClass = computed(() => bandClass(fit.value?.actualBand ?? 'unknown'));
    const targetBandClass = computed(() => bandClass(fit.value?.targetBand ?? 'unknown'));

    /** 0–1 position on the risk axis for a band. */
    function bandPosition(band: RiskBand): number {
        switch (band) {
            case 'conservative':
                return 0.17;
            case 'moderate':
                return 0.5;
            case 'aggressive':
                return 0.83;
            default:
                return 0.5;
        }
    }

    const needleStyle = computed(() => ({
        left: `${bandPosition(fit.value?.actualBand ?? 'unknown') * 100}%`,
    }));

    const targetZoneStyle = computed(() => {
        const pos = bandPosition(fit.value?.targetBand ?? 'moderate');
        // Highlight ±12% around the target band center
        const half = 0.12;
        const start = Math.max(0, pos - half);
        const width = Math.min(1 - start, half * 2);
        return {
            left: `${start * 100}%`,
            width: `${width * 100}%`,
        };
    });

    const drawdownWarning = computed(() => {
        if (!fit.value || fit.value.verdict !== 'too_aggressive') return '';
        return drawdownStatement(
            fit.value.actualBand,
            // aggressiveFraction not in HorizonFit; use actualBand as proxy
            fit.value.actualBand === 'aggressive' ? 0.8 : 0.5
        );
    });

    function capitalize(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
</script>

<style scoped>
    .horizon-fit-card {
        border-radius: 8px;
    }

    /* Timeline layout */
    .timeline-container {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .timeline-end {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        min-width: 72px;
    }

    .timeline-end--right {
        align-items: flex-end;
    }

    .timeline-label {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    }

    .timeline-label--right {
        align-items: flex-end;
        text-align: right;
    }

    .timeline-marker {
        width: 10px;
        height: 10px;
        border-radius: 50%;
    }

    .timeline-marker--success {
        background: rgb(var(--v-theme-success));
    }
    .timeline-marker--warning {
        background: rgb(var(--v-theme-warning));
    }
    .timeline-marker--error {
        background: rgb(var(--v-theme-error));
    }
    .timeline-marker--default {
        background: rgba(var(--v-theme-on-surface), 0.3);
    }

    /* Track */
    .timeline-track {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .timeline-bar {
        position: relative;
        height: 10px;
        border-radius: 5px;
        background: rgba(var(--v-theme-on-surface), 0.08);
        overflow: visible;
    }

    /* Target zone highlight */
    .timeline-target-zone {
        position: absolute;
        top: 0;
        height: 100%;
        border-radius: 5px;
        opacity: 0.25;
    }

    .timeline-target-zone--success {
        background: rgb(var(--v-theme-success));
    }
    .timeline-target-zone--warning {
        background: rgb(var(--v-theme-warning));
    }
    .timeline-target-zone--error {
        background: rgb(var(--v-theme-error));
    }
    .timeline-target-zone--default {
        background: rgba(var(--v-theme-on-surface), 0.3);
    }

    /* Needle */
    .timeline-needle {
        position: absolute;
        top: -4px;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        z-index: 2;
    }

    .timeline-needle-line {
        width: 2px;
        height: 18px;
        border-radius: 1px;
    }

    .timeline-needle-tip {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-top: -2px;
    }

    .timeline-needle--success .timeline-needle-line,
    .timeline-needle--success .timeline-needle-tip {
        background: rgb(var(--v-theme-success));
    }

    .timeline-needle--warning .timeline-needle-line,
    .timeline-needle--warning .timeline-needle-tip {
        background: rgb(var(--v-theme-warning));
    }

    .timeline-needle--error .timeline-needle-line,
    .timeline-needle--error .timeline-needle-tip {
        background: rgb(var(--v-theme-error));
    }

    .timeline-needle--default .timeline-needle-line,
    .timeline-needle--default .timeline-needle-tip {
        background: rgba(var(--v-theme-on-surface), 0.5);
    }

    /* Band labels */
    .timeline-band-labels {
        display: flex;
        justify-content: space-between;
        padding: 0 2px;
    }
</style>
