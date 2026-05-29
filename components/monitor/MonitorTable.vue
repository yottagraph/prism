<template>
    <v-card>
        <v-card-text>
            <MonitorFilters
                :category="category"
                :search="search"
                :rows-per-page="rowsPerPage"
                @update:category="category = $event"
                @update:search="search = $event"
                @update:rows-per-page="rowsPerPage = $event"
            />
            <div class="d-flex flex-wrap ga-2 mb-2">
                <v-chip size="x-small" color="primary" variant="tonal" label
                    >SEC EDGAR — FHS · ERS · CIK</v-chip
                >
                <v-chip size="x-small" color="info" variant="tonal" label
                    >News — summary · activity</v-chip
                >
                <v-chip size="x-small" color="success" variant="tonal" label
                    >Stock — $ · 30d · trend</v-chip
                >
                <v-chip size="x-small" color="purple" variant="tonal" label
                    >Prediction Markets</v-chip
                >
                <v-chip size="x-small" color="error" variant="tonal" label
                    >ACS — adversarial capital</v-chip
                >
            </div>
            <div class="overflow-x-auto">
                <v-data-table
                    :headers="headers"
                    :items="filteredRows"
                    :search="search"
                    :loading="loading"
                    :items-per-page="rowsPerPage"
                    density="comfortable"
                    hover
                    style="min-width: 1200px"
                    @click:row="onRowClick"
                >
                    <template #item.rank="{ index }">
                        <span class="text-caption font-mono">#{{ index + 1 }}</span>
                    </template>

                    <template #item.name="{ item }">
                        <div class="font-weight-medium">{{ item.resolvedName }}</div>
                        <div class="text-caption text-medium-emphasis">{{ item.neid || '—' }}</div>
                    </template>

                    <template #item.solvency="{ item }"
                        ><RiskLevelChip :value="item.solvencyLevel"
                    /></template>
                    <template #item.executive="{ item }"
                        ><RiskLevelChip :value="item.executiveLevel"
                    /></template>
                    <template #item.cikVelocity="{ item }"
                        ><CikVelocityCell :value="item.edgarQoqPct"
                    /></template>
                    <template #item.newsSummary="{ item }"
                        ><NewsSummaryCell :value="item.headlineSummary"
                    /></template>
                    <template #item.newsActivity="{ item }"
                        ><NewsActivityChip :value="item.mentionRatioLabel"
                    /></template>
                    <template #item.stockTrend="{ item }"
                        ><StockTrendChip :value="item.stockTrendSignal"
                    /></template>
                    <template #item.polymarket="{ item }">
                        <PolymarketOutlookCell
                            :outlook="item.polymarketOutlook"
                            :count="item.polymarketCount"
                        />
                    </template>
                    <template #item.signalAgreement="{ item }">
                        <SignalAgreementCell
                            :value="item.signalAgreement"
                            :summary="item.signalSummary"
                        />
                    </template>
                    <template #item.acsScore="{ item }">
                        <RiskLevelChip :value="item.acsLevel" />
                    </template>
                    <template #item.analyst="{ item }">
                        <AnalystAssessmentSelect
                            :model-value="item.assessmentTier"
                            @update:model-value="emit('assess', item, $event)"
                        />
                    </template>
                    <template #item.actions="{ item }">
                        <v-btn
                            v-if="item.neid"
                            icon="mdi-arrow-right"
                            variant="text"
                            size="x-small"
                            :aria-label="`Open ${item.resolvedName}`"
                            @click.stop="emit('open', item.entity)"
                        />
                    </template>
                </v-data-table>
            </div>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
    import type { PortfolioEntity } from '~/composables/usePortfolio';
    import { scoreToLabel } from '~/composables/useFusedScoring';

    import AnalystAssessmentSelect from './cells/AnalystAssessmentSelect.vue';
    import CikVelocityCell from './cells/CikVelocityCell.vue';
    import NewsActivityChip from './cells/NewsActivityChip.vue';
    import NewsSummaryCell from './cells/NewsSummaryCell.vue';
    import PolymarketOutlookCell from './cells/PolymarketOutlookCell.vue';
    import RiskLevelChip from './cells/RiskLevelChip.vue';
    import SignalAgreementCell from './cells/SignalAgreementCell.vue';
    import StockTrendChip from './cells/StockTrendChip.vue';
    import MonitorFilters from './MonitorFilters.vue';

    const props = defineProps<{ entities: PortfolioEntity[]; loading?: boolean }>();
    const emit = defineEmits<{
        open: [entity: PortfolioEntity];
        assess: [entity: any, value: 'HIGH' | 'MEDIUM' | 'LOW' | 'IGNORE' | null];
    }>();

    const category = ref('ALL');
    const search = ref('');
    const rowsPerPage = ref(50);

    const headers = [
        { title: '#', key: 'rank', sortable: false, width: 50 },
        { title: 'Entity', key: 'name', sortable: true },
        { title: 'Signals', key: 'signalAgreement', sortable: true, width: 120 },
        // SEC lens
        { title: 'Solvency (FHS)', key: 'solvency', sortable: true, width: 120 },
        { title: 'Executive (ERS)', key: 'executive', sortable: true, width: 130 },
        { title: 'CIK Velocity', key: 'cikVelocity', sortable: true, width: 120 },
        // News lens
        { title: 'News Summary (24h)', key: 'newsSummary', sortable: false, width: 240 },
        { title: 'News Activity', key: 'newsActivity', sortable: true, width: 120 },
        // Stock lens
        { title: '$', key: 'stockChangePercent', sortable: true, width: 70 },
        { title: '30d', key: 'stockChange30dPercent', sortable: true, width: 70 },
        { title: 'Trend', key: 'stockTrend', sortable: true, width: 90 },
        // Polymarket lens
        { title: 'Markets', key: 'polymarket', sortable: true, width: 140 },
        // ACS lens
        { title: 'ACS', key: 'acsScore', sortable: true, width: 90 },
        { title: 'Analyst', key: 'analyst', sortable: false, width: 130 },
        { title: '', key: 'actions', sortable: false, width: 40 },
    ];

    const rows = computed(() =>
        props.entities.map((entity) => ({
            entity,
            neid: entity.neid,
            resolvedName: entity.resolvedName,
            fused: entity.scores?.fused ?? null,
            riskCategory: entity.monitor?.riskCategory ?? 'LOW',
            signalAgreement: entity.monitor?.signalAgreement ?? null,
            signalSummary: entity.monitor?.signalSummary ?? null,
            solvencyLevel:
                entity.scores?.solvency != null ? scoreToLabel(entity.scores.solvency) : null,
            executiveLevel:
                entity.scores?.executive != null ? scoreToLabel(entity.scores.executive) : null,
            edgarQoqPct: entity.monitor?.edgarQoqPct ?? null,
            headlineSummary: entity.monitor?.headlineSummary ?? null,
            mentionRatioLabel: entity.monitor?.mentionRatioLabel ?? null,
            stockChangePercent: entity.monitor?.stockChangePercent ?? null,
            stockChange30dPercent: entity.monitor?.stockChange30dPercent ?? null,
            stockTrendSignal: entity.monitor?.stockTrendSignal ?? null,
            polymarketOutlook: entity.monitor?.polymarketOutlook ?? null,
            polymarketCount: entity.monitor?.polymarketCount ?? null,
            acsLevel:
                entity.scores?.compliance != null ? scoreToLabel(entity.scores.compliance) : null,
            assessmentTier: entity.assessment?.tier
                ? (entity.assessment.tier.toUpperCase() as 'HIGH' | 'MEDIUM' | 'LOW' | 'IGNORE')
                : null,
        }))
    );

    const filteredRows = computed(() =>
        rows.value.filter((row) => category.value === 'ALL' || row.riskCategory === category.value)
    );

    function onRowClick(_event: Event, row: { item: any }) {
        if (row.item.entity?.neid) emit('open', row.item.entity);
    }
</script>

<style scoped>
    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
