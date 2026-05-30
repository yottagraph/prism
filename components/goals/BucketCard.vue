<template>
    <v-card variant="outlined" class="bucket-card pa-4 fill-height d-flex flex-column">
        <!-- Header -->
        <div class="d-flex align-center mb-2">
            <v-icon :color="priorityColor" class="mr-2" size="small">mdi-target</v-icon>
            <span class="text-subtitle-2 font-weight-medium">{{ card.name }}</span>
            <v-spacer />
            <v-chip v-if="card.fitLabel" :color="card.fitColor" size="x-small" variant="flat" label>
                {{ card.fitLabel }}
            </v-chip>
            <span v-else class="text-caption text-medium-emphasis">No goal set</span>
        </div>

        <!-- ── Dimension A: Goal alignment ──────────────────────────── -->
        <div class="dimension-row mb-3">
            <span class="dimension-label text-caption text-medium-emphasis">
                <v-icon size="10" class="mr-1">mdi-bullseye-arrow</v-icon>
                Built for
            </span>

            <div v-if="card.goal" class="d-flex align-center flex-wrap mt-1" style="gap: 6px">
                <v-chip size="x-small" variant="tonal" color="default">
                    {{ card.goal.horizonYears }}y horizon
                </v-chip>
                <v-chip
                    v-if="card.goal.priority"
                    size="x-small"
                    variant="tonal"
                    :color="priorityColor"
                >
                    {{ card.goal.priority }}
                </v-chip>
            </div>

            <div v-if="card.fit" class="d-flex align-center mt-2" style="gap: 6px">
                <span class="text-caption text-medium-emphasis">Actual:</span>
                <v-chip :color="bandColor(card.fit.actualBand)" size="x-small" variant="tonal">
                    {{ capitalize(card.fit.actualBand) }}
                </v-chip>
                <v-icon size="x-small" color="medium-emphasis">mdi-arrow-right</v-icon>
                <span class="text-caption text-medium-emphasis">Target:</span>
                <v-chip :color="bandColor(card.fit.targetBand)" size="x-small" variant="tonal">
                    {{ capitalize(card.fit.targetBand) }}
                </v-chip>
            </div>

            <p
                v-if="card.fit"
                class="text-caption text-medium-emphasis mt-2 mb-0"
                style="line-height: 1.4"
            >
                {{ card.fit.reason }}
            </p>

            <p v-else-if="!card.goal" class="text-caption text-medium-emphasis mt-1 mb-0">
                No goal set for this bucket.
            </p>
        </div>

        <v-divider class="mb-3" />

        <!-- ── Dimension B: Holdings health ─────────────────────────── -->
        <div class="dimension-row mb-3">
            <span class="dimension-label text-caption text-medium-emphasis">
                <v-icon size="10" class="mr-1">mdi-shield-search</v-icon>
                Holdings health
                <span class="ml-1 text-caption" style="opacity: 0.6"
                    >SEC · news · market · ownership</span
                >
            </span>

            <!-- Not yet scanned -->
            <div
                v-if="health.scanned === 0"
                class="text-caption text-medium-emphasis mt-2 d-flex align-center"
                style="gap: 6px"
            >
                <v-icon size="14" color="medium-emphasis">mdi-radar</v-icon>
                Analyze to assess holdings
            </div>

            <!-- Scanned -->
            <template v-else>
                <div class="d-flex align-center flex-wrap mt-2" style="gap: 6px">
                    <!-- Worst tier badge -->
                    <v-chip
                        v-if="health.worstTier"
                        :color="tierColor(health.worstTier)"
                        size="x-small"
                        variant="flat"
                        label
                    >
                        {{ tierLabel(health.worstTier) }} risk
                    </v-chip>

                    <!-- Attention callout -->
                    <v-chip
                        v-if="health.needsAttention > 0"
                        color="warning"
                        size="x-small"
                        variant="tonal"
                        prepend-icon="mdi-alert-outline"
                    >
                        {{ health.needsAttention }} need attention
                    </v-chip>
                    <v-chip v-else color="success" size="x-small" variant="tonal">
                        All clear
                    </v-chip>
                </div>

                <!-- Tier breakdown -->
                <div class="d-flex align-center mt-2" style="gap: 4px; flex-wrap: wrap">
                    <template v-for="tier in TIERS" :key="tier">
                        <span
                            v-if="health.tierCounts[tier] > 0"
                            class="text-caption"
                            :style="{ color: tierChipColor(tier) }"
                        >
                            {{ health.tierCounts[tier] }} {{ tier }}
                        </span>
                        <span
                            v-if="health.tierCounts[tier] > 0 && !isLastTier(tier)"
                            class="text-caption text-medium-emphasis"
                        >
                            ·
                        </span>
                    </template>
                </div>

                <!-- Lens worst scores -->
                <div class="d-flex align-center mt-2" style="gap: 8px">
                    <LensScore label="Fin. strength" :score="health.lensWorst.fhs" />
                    <LensScore label="Leadership" :score="health.lensWorst.ers" />
                    <LensScore
                        v-if="health.lensWorst.acs !== null"
                        label="Ownership"
                        :score="health.lensWorst.acs"
                    />
                </div>
            </template>
        </div>

        <!-- ── Overlap warning ───────────────────────────────────────── -->
        <div v-if="card.overlappingNames.length > 0" class="overlap-warning pa-2 rounded mb-3">
            <span class="text-caption">
                <v-icon size="12" color="warning" class="mr-1">mdi-alert-outline</v-icon>
                Also in other buckets:
                {{ card.overlappingNames.slice(0, 3).join(', ')
                }}{{
                    card.overlappingNames.length > 3 ? ` +${card.overlappingNames.length - 3}` : ''
                }}
            </span>
        </div>

        <!-- ── Footer ────────────────────────────────────────────────── -->
        <div class="d-flex align-center mt-auto pt-2">
            <span class="text-caption text-medium-emphasis">
                {{ card.entityCount }} holding{{ card.entityCount !== 1 ? 's' : '' }}
                <template v-if="health.scanned > 0 && health.scanned < health.total">
                    · {{ health.scanned }} scored
                </template>
            </span>
            <v-spacer />
            <v-btn
                size="x-small"
                variant="text"
                color="primary"
                :to="'/'"
                @click="$emit('open', card.id)"
            >
                Open bucket
                <v-icon size="x-small" end>mdi-arrow-right</v-icon>
            </v-btn>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { RiskTier } from '~/composables/useFusedScoring';
    import { tierColor, tierLabel } from '~/composables/useFusedScoring';
    import type { HorizonFit, RiskBand } from '~/utils/goals/riskFit';
    import type { BucketHoldingsHealth } from '~/utils/goals/holdingsHealth';
    import type { GoalMeta } from '~/composables/usePortfolio';

    /** View-model produced by pages/household.vue's computed, passed as a prop. */
    export interface BucketCardViewModel {
        id: string;
        name: string;
        goal: GoalMeta | null;
        entityCount: number;
        priority: string | null;
        fit: HorizonFit | null;
        fitLabel: string | null;
        fitColor: string;
        overlappingNames: string[];
        /** Average risk score (0-100) for positioning on the construction spectrum. */
        avgRiskScore: number;
    }

    const props = defineProps<{
        card: BucketCardViewModel;
        health: BucketHoldingsHealth;
    }>();

    defineEmits<{
        open: [bucketId: string];
    }>();

    const TIERS: RiskTier[] = ['critical', 'high', 'medium', 'low'];

    const priorityColor = computed(() => {
        switch (props.card.priority) {
            case 'essential':
                return 'error';
            case 'important':
                return 'primary';
            case 'aspirational':
                return 'secondary';
            default:
                return 'default';
        }
    });

    const anyLensData = computed(
        () =>
            props.health.lensWorst.fhs !== null ||
            props.health.lensWorst.ers !== null ||
            props.health.lensWorst.acs !== null
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

    function tierChipColor(tier: RiskTier): string {
        switch (tier) {
            case 'critical':
                return 'rgb(var(--v-theme-error))';
            case 'high':
                return 'rgb(var(--v-theme-warning))';
            case 'medium':
                return 'rgb(var(--v-theme-info))';
            default:
                return 'rgb(var(--v-theme-success))';
        }
    }

    function isLastTier(tier: RiskTier): boolean {
        const tiersWithCount = TIERS.filter((t) => props.health.tierCounts[t] > 0);
        return tiersWithCount[tiersWithCount.length - 1] === tier;
    }

    function capitalize(s: string): string {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }
</script>

<!-- Inline sub-component for a single lens score -->
<script lang="ts">
    import { defineComponent, h, computed as vComputed, type PropType } from 'vue';
    import { scoreLabelColor } from '~/composables/useFusedScoring';

    export const LensScore = defineComponent({
        props: {
            label: { type: String, required: true },
            score: { type: Number as PropType<number | null>, default: null },
        },
        setup(props) {
            const color = vComputed(() =>
                props.score != null ? scoreLabelColor(props.score) : 'default'
            );
            return () =>
                h(
                    'span',
                    {
                        class: 'text-caption',
                        style: 'display:inline-flex;align-items:center;gap:3px',
                    },
                    [
                        h('span', { class: 'text-medium-emphasis' }, props.label),
                        props.score != null
                            ? h(
                                  'span',
                                  {
                                      style: {
                                          color: `rgb(var(--v-theme-${color.value}))`,
                                          fontWeight: 600,
                                      },
                                  },
                                  String(props.score)
                              )
                            : h('span', { class: 'text-medium-emphasis' }, '—'),
                    ]
                );
        },
    });
</script>

<style scoped>
    .bucket-card {
        border-radius: 8px;
    }

    .dimension-label {
        display: flex;
        align-items: center;
    }

    .dimension-row {
        display: flex;
        flex-direction: column;
    }

    .overlap-warning {
        background: rgba(var(--v-theme-warning), 0.08);
        border: 1px solid rgba(var(--v-theme-warning), 0.3);
    }
</style>
