<template>
    <div>
        <!-- Score header -->
        <v-card class="pa-4 mb-3">
            <div class="d-flex align-center mb-3">
                <v-chip size="x-small" color="primary" label class="mr-2">SEC</v-chip>
                <span class="text-subtitle-2">Financial Health Score (FHS)</span>
                <v-spacer />
                <v-chip
                    v-if="scores?.solvency != null"
                    :color="scoreLabelColor(scores.solvency)"
                    label
                    class="mr-2"
                >
                    {{ tierLabel(scoreToLabel(scores.solvency)) }} risk
                </v-chip>
            </div>
            <div class="text-body-2 text-medium-emphasis">
                Financial Health Score derived from SEC XBRL filing fundamentals, leverage trends,
                and distress event signals (bankruptcy, delisting, non-reliance, triggering events).
            </div>
        </v-card>

        <!-- Metrics grid -->
        <v-card class="pa-4 mb-3" v-if="solvencyDetail">
            <div class="text-subtitle-2 mb-3">Key Metrics</div>
            <div class="metrics-grid">
                <div v-for="m in solvencyDetail.metrics" :key="m.label" class="metric-box">
                    <div class="text-caption text-medium-emphasis text-uppercase">
                        {{ m.label }}
                    </div>
                    <div class="text-h6 font-mono">{{ m.value }}</div>
                </div>
            </div>
        </v-card>

        <!-- Distress events -->
        <v-card class="pa-4 mb-3">
            <div class="text-subtitle-2 mb-3">
                Distress Events
                <v-chip
                    v-if="fhsMonitor?.totalDistressEvents"
                    size="x-small"
                    color="error"
                    label
                    class="ml-2"
                >
                    {{ fhsMonitor.totalDistressEvents }}
                </v-chip>
            </div>
            <template v-if="fhsMonitor?.totalDistressEvents">
                <div class="distress-grid mb-3">
                    <div
                        v-for="(count, type) in distressEntries"
                        :key="type"
                        class="distress-item"
                        :class="{ 'distress-item--active': (count ?? 0) > 0 }"
                    >
                        <div class="text-caption text-medium-emphasis text-uppercase">
                            {{ type }}
                        </div>
                        <div
                            class="text-h6 font-mono"
                            :class="(count ?? 0) > 0 ? 'text-error' : 'text-medium-emphasis'"
                        >
                            {{ count ?? 0 }}
                        </div>
                    </div>
                </div>
                <div v-if="fhsMonitor.latestDistressDate" class="text-caption text-medium-emphasis">
                    Most recent: {{ fhsMonitor.latestDistressDate }}
                </div>
            </template>
            <v-alert v-else density="compact" variant="tonal" type="success">
                No distress events (bankruptcy, delisting, non-reliance, triggering) detected.
            </v-alert>
        </v-card>

        <!-- Leverage trend -->
        <v-card class="pa-4 mb-3">
            <div class="text-subtitle-2 mb-3">Leverage & Filing Freshness</div>
            <v-row dense>
                <v-col cols="12" sm="4">
                    <div class="text-caption text-medium-emphasis text-uppercase">
                        Leverage (D/E)
                    </div>
                    <div class="text-h6 font-mono mt-1">
                        {{
                            fhsMonitor?.leverageLatest != null
                                ? `${fhsMonitor.leverageLatest.toFixed(2)}x`
                                : '—'
                        }}
                    </div>
                    <div
                        v-if="fhsMonitor?.leveragePrevious != null"
                        class="text-caption text-medium-emphasis"
                    >
                        prev {{ fhsMonitor.leveragePrevious.toFixed(2) }}x
                    </div>
                </v-col>
                <v-col cols="12" sm="4">
                    <div class="text-caption text-medium-emphasis text-uppercase">Trend</div>
                    <div class="mt-1">
                        <v-chip
                            v-if="fhsMonitor?.trendDirection"
                            :color="trendColor(fhsMonitor.trendDirection)"
                            size="small"
                            label
                            variant="tonal"
                        >
                            <v-icon start size="small">{{
                                trendIcon(fhsMonitor.trendDirection)
                            }}</v-icon>
                            {{ fhsMonitor.trendDirection }}
                        </v-chip>
                        <span v-else class="text-medium-emphasis">—</span>
                    </div>
                </v-col>
                <v-col cols="12" sm="4">
                    <div class="text-caption text-medium-emphasis text-uppercase">
                        Latest filing age
                    </div>
                    <div class="text-h6 font-mono mt-1">
                        {{
                            fhsMonitor?.freshestFilingDays != null
                                ? `${fhsMonitor.freshestFilingDays}d`
                                : '—'
                        }}
                    </div>
                </v-col>
            </v-row>
        </v-card>

        <!-- Evidence findings -->
        <v-card class="pa-4" v-if="solvencyDetail?.findings?.length">
            <div class="text-subtitle-2 mb-3">Evidence</div>
            <div class="finding-list">
                <v-card
                    v-for="(finding, idx) in solvencyDetail.findings"
                    :key="idx"
                    class="finding-card mb-2 pa-3"
                    variant="flat"
                >
                    <div class="text-body-2">{{ finding.text }}</div>
                    <div v-if="finding.citations?.length" class="d-flex flex-wrap ga-2 mt-2">
                        <CitationChip
                            v-for="(citation, cidx) in finding.citations"
                            :key="cidx"
                            :citation="citation"
                        />
                    </div>
                </v-card>
            </div>
        </v-card>
    </div>
</template>

<script setup lang="ts">
    import { scoreToLabel, scoreLabelColor, tierLabel } from '~/composables/useFusedScoring';
    import type { EntityRiskScore } from '~/composables/useFusedScoring';
    import CitationChip from '~/components/CitationChip.vue';

    const props = defineProps<{
        scores?: EntityRiskScore | null;
        lensDetails?: Record<
            string,
            {
                metrics: Array<{ label: string; value: string }>;
                findings: Array<{ text: string; date?: string; citations: any[] }>;
            }
        >;
        fhsMonitor?: {
            leverageLatest: number | null;
            leveragePrevious: number | null;
            trendDirection: 'worsening' | 'stable' | 'improving' | null;
            distressEventCounts: {
                bankruptcy: number;
                delisting: number;
                nonReliance: number;
                triggering: number;
                impairment: number;
                termination: number;
            };
            totalDistressEvents: number;
            latestDistressDate: string | null;
            freshestFilingDays: number | null;
        } | null;
    }>();

    const solvencyDetail = computed(() => props.lensDetails?.solvency);

    const distressEntries = computed(() => {
        if (!props.fhsMonitor?.distressEventCounts) return {};
        const c = props.fhsMonitor.distressEventCounts;
        return {
            Bankruptcy: c.bankruptcy,
            Delisting: c.delisting,
            'Non-reliance': c.nonReliance,
            Triggering: c.triggering,
            Impairment: c.impairment,
            Termination: c.termination,
        };
    });

    function trendColor(trend: 'worsening' | 'stable' | 'improving') {
        if (trend === 'worsening') return 'error';
        if (trend === 'improving') return 'success';
        return 'default';
    }

    function trendIcon(trend: 'worsening' | 'stable' | 'improving') {
        if (trend === 'worsening') return 'mdi-trending-up';
        if (trend === 'improving') return 'mdi-trending-down';
        return 'mdi-trending-neutral';
    }
</script>

<style scoped>
    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 10px;
    }
    .metric-box {
        background: rgba(var(--dynamic-fg-rgb), 0.03);
        border-radius: 8px;
        padding: 10px 12px;
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
    }
    .distress-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: 10px;
    }
    .distress-item {
        background: rgba(var(--dynamic-fg-rgb), 0.02);
        border-radius: 8px;
        padding: 8px 12px;
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.04);
    }
    .distress-item--active {
        border-color: rgba(var(--v-theme-error), 0.3);
        background: rgba(var(--v-theme-error), 0.04);
    }
    .finding-card {
        background: rgba(var(--dynamic-fg-rgb), 0.02);
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
    }
    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
