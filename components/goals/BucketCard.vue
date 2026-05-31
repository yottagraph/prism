<template>
    <v-card variant="outlined" class="bucket-card pa-4 fill-height d-flex flex-column">
        <!-- Header -->
        <div class="d-flex align-center mb-2">
            <v-icon :color="priorityColor" class="mr-2" size="small">mdi-target</v-icon>
            <span class="text-subtitle-2 font-weight-medium">{{ card.name }}</span>
            <v-spacer />
            <!-- Progress ring while this bucket is being scanned -->
            <template v-if="scanning && health.total > 0 && health.scanned < health.total">
                <GoalsScanProgressRing :value="(health.scanned / health.total) * 100" :size="26" />
                <span
                    class="text-caption text-medium-emphasis ml-2"
                    style="font-variant-numeric: tabular-nums"
                >
                    {{ health.scanned }}/{{ health.total }}
                </span>
            </template>
            <v-chip
                v-else-if="card.fitLabel"
                :color="card.fitColor"
                size="small"
                variant="flat"
                label
            >
                {{ card.fitLabel }}
            </v-chip>
            <span v-else class="text-caption text-medium-emphasis">No goal set</span>
        </div>

        <!-- ── Dimension A: Goal alignment ──────────────────────────── -->
        <div class="dimension-row mb-3">
            <span class="dimension-label text-body-2 text-medium-emphasis">
                <v-icon size="14" class="mr-1">mdi-bullseye-arrow</v-icon>
                Built for
            </span>

            <div v-if="card.goal" class="d-flex align-center flex-wrap mt-1" style="gap: 6px">
                <v-chip size="small" variant="tonal" color="default">
                    {{ card.goal.horizonYears }}y horizon
                </v-chip>
                <v-chip
                    v-if="card.goal.priority"
                    size="small"
                    variant="tonal"
                    :color="priorityColor"
                >
                    {{ card.goal.priority }}
                </v-chip>
            </div>

            <div v-if="card.fit" class="d-flex align-center mt-2" style="gap: 6px">
                <span class="text-body-2 text-medium-emphasis">Actual:</span>
                <v-chip :color="bandColor(card.fit.actualBand)" size="small" variant="tonal">
                    {{ capitalize(card.fit.actualBand) }}
                </v-chip>
                <v-icon size="small" color="medium-emphasis">mdi-arrow-right</v-icon>
                <span class="text-body-2 text-medium-emphasis">Target:</span>
                <v-chip :color="bandColor(card.fit.targetBand)" size="small" variant="tonal">
                    {{ capitalize(card.fit.targetBand) }}
                </v-chip>
            </div>

            <p
                v-if="card.fit"
                class="text-body-2 text-medium-emphasis mt-2 mb-0"
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
            <span class="dimension-label text-body-2 text-medium-emphasis">
                <v-icon size="14" class="mr-1">mdi-shield-search</v-icon>
                Holdings health
                <HelpTooltip
                    text="Fused from SEC filings, news events, 30-day market signals, and ownership screening. Click 'Data sources' in the sidebar for details on each source."
                    title="Holdings health"
                    :size="14"
                />
            </span>

            <!-- Not yet scanned -->
            <div
                v-if="health.scanned === 0"
                class="text-body-2 text-medium-emphasis mt-2 d-flex align-center"
                style="gap: 6px"
            >
                <v-icon size="16" color="medium-emphasis">mdi-radar</v-icon>
                Analyze to assess holdings
            </div>

            <!-- Scanned -->
            <template v-else>
                <div class="d-flex align-center flex-wrap mt-2" style="gap: 6px">
                    <!-- Worst tier badge -->
                    <v-chip
                        v-if="health.worstTier"
                        :color="tierColor(health.worstTier)"
                        size="small"
                        variant="flat"
                        label
                    >
                        {{ tierLabel(health.worstTier) }} risk
                    </v-chip>

                    <!-- Attention callout -->
                    <v-chip
                        v-if="health.needsAttention > 0"
                        color="warning"
                        size="small"
                        variant="tonal"
                        prepend-icon="mdi-alert-outline"
                    >
                        {{ health.needsAttention }} need attention
                    </v-chip>
                    <v-chip v-else color="success" size="small" variant="tonal"> All clear </v-chip>
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

                <!-- Lens worst scores with source attribution -->
                <div class="d-flex align-center flex-wrap mt-2" style="gap: 8px">
                    <v-tooltip location="top" :text="LENS_META.solvency.description">
                        <template #activator="{ props: ttProps }">
                            <span
                                v-bind="ttProps"
                                class="d-inline-flex align-center"
                                style="gap: 3px"
                            >
                                <LensScore label="Fin. strength" :score="health.lensWorst.fhs" />
                                <SourceBadge :source="LENS_META.solvency.source" />
                            </span>
                        </template>
                    </v-tooltip>
                    <v-tooltip location="top" :text="LENS_META.executive.description">
                        <template #activator="{ props: ttProps }">
                            <span
                                v-bind="ttProps"
                                class="d-inline-flex align-center"
                                style="gap: 3px"
                            >
                                <LensScore label="Leadership" :score="health.lensWorst.ers" />
                                <SourceBadge :source="LENS_META.executive.source" />
                            </span>
                        </template>
                    </v-tooltip>
                    <v-tooltip
                        v-if="health.lensWorst.acs !== null"
                        location="top"
                        :text="LENS_META.compliance.description"
                    >
                        <template #activator="{ props: ttProps }">
                            <span
                                v-bind="ttProps"
                                class="d-inline-flex align-center"
                                style="gap: 3px"
                            >
                                <LensScore label="Ownership" :score="health.lensWorst.acs" />
                                <SourceBadge :source="LENS_META.compliance.source" />
                            </span>
                        </template>
                    </v-tooltip>
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
            <span class="text-caption">
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
    import { tierColor, tierLabel, LENS_META } from '~/composables/useFusedScoring';
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

    const props = withDefaults(
        defineProps<{
            card: BucketCardViewModel;
            health: BucketHoldingsHealth;
            /** Pass true while a global scan is running to show progress rings. */
            scanning?: boolean;
        }>(),
        { scanning: false }
    );

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
