<template>
    <v-card variant="outlined" class="horizon-fit-card pa-4">
        <div class="d-flex align-center mb-3">
            <v-icon color="primary" class="mr-2" size="small">mdi-target</v-icon>
            <span class="text-subtitle-2 font-weight-medium">Horizon Fit</span>
            <v-spacer />
            <v-chip v-if="fit" :color="verdictColor" size="small" variant="flat" label>
                {{ verdictLabel }}
            </v-chip>
            <span v-else class="text-caption text-medium-emphasis">Set a goal to see fit</span>
        </div>

        <template v-if="fit">
            <p class="text-body-2 mb-3">{{ fit.reason }}</p>

            <div class="d-flex align-center" style="gap: 16px">
                <div class="fit-band-item">
                    <span class="text-caption text-medium-emphasis d-block mb-1">Actual risk</span>
                    <v-chip :color="bandColor(fit.actualBand)" size="small" variant="tonal" label>
                        {{ capitalize(fit.actualBand) }}
                    </v-chip>
                </div>
                <v-icon size="x-small" color="medium-emphasis">mdi-arrow-right</v-icon>
                <div class="fit-band-item">
                    <span class="text-caption text-medium-emphasis d-block mb-1">Target risk</span>
                    <v-chip :color="bandColor(fit.targetBand)" size="small" variant="tonal" label>
                        {{ capitalize(fit.targetBand) }}
                    </v-chip>
                </div>

                <v-spacer />

                <div class="text-right">
                    <span class="text-caption text-medium-emphasis d-block">
                        {{ horizon }}y horizon
                    </span>
                    <span
                        v-if="fit.volCoverage > 0"
                        class="text-caption text-medium-emphasis d-block"
                    >
                        {{ Math.round(fit.volCoverage * 100) }}% live vol
                    </span>
                    <span v-else class="text-caption text-medium-emphasis d-block">
                        Sector heuristic
                    </span>
                </div>
            </div>
        </template>

        <template v-else-if="!goal">
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

        <template v-else>
            <div class="text-body-2 text-medium-emphasis">
                Add holdings and run a scan to see risk fit.
            </div>
        </template>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { GoalMeta } from '~/composables/usePortfolio';
    import type { DemoUser } from '~/composables/useUser';
    import type { RiskBand, HorizonFit } from '~/utils/goals/riskFit';
    import type { MacroFactorBucket } from '~/utils/macro/sectorFactors';
    import { bucketRiskProfile, horizonFit, VERDICT_COLORS } from '~/utils/goals/riskFit';

    const props = defineProps<{
        goal?: GoalMeta | null;
        user?: DemoUser | null;
        /** Volatility (annualized %) per holding, null = unavailable. */
        holdingVols?: (number | null | undefined)[];
        /** Macro sector bucket per holding. */
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

    function bandColor(band: RiskBand): string {
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

    function capitalize(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
</script>

<style scoped>
    .horizon-fit-card {
        border-radius: 8px;
    }
    .fit-band-item {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
    }
</style>
