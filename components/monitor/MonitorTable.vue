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
            <div class="d-flex flex-wrap ga-2 mb-2 align-center">
                <span class="text-caption text-medium-emphasis mr-1">Sources:</span>
                <SourceBadge
                    source="SEC"
                    :show-icon="true"
                    :clickable="true"
                    :show-learn-more="true"
                />
                <SourceBadge
                    source="NEWS"
                    :show-icon="true"
                    :clickable="true"
                    :show-learn-more="true"
                />
                <SourceBadge
                    source="STOCK"
                    :show-icon="true"
                    :clickable="true"
                    :show-learn-more="true"
                />
                <SourceBadge
                    source="POLY"
                    :show-icon="true"
                    :clickable="true"
                    :show-learn-more="true"
                />
                <SourceBadge
                    source="CSL"
                    :show-icon="true"
                    :clickable="true"
                    :show-learn-more="true"
                />
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
                    style="min-width: 1360px"
                    @click:row="onRowClick"
                >
                    <!-- Custom header tooltips for key columns -->
                    <template #header.solvency="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="Assesses balance-sheet health from SEC filings — leverage, equity, distress events."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.executive="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="Tracks officer and director departures and governance concentration from SEC filings."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.newsActivity="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="Measures negative news sentiment and mention velocity from Elemental's news graph."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.polymarket="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="Active Polymarket prediction contracts related to this entity — real-money market-implied probabilities."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.acsScore="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="Ownership screening: checks the entity's beneficial ownership path against OFAC, OpenSanctions, and CSL."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.signalAgreement="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="Whether SEC, News, and Market signals point in the same direction. Conflict means the sources disagree."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.name="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="The issuer under review, with its resolved Elemental entity ID."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.currentValue="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="Current market value of the position (cost basis shown beneath when available)."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.holdingReturn="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="Total return on the position since entry, as a percentage."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.cikVelocity="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="Quarter-over-quarter change in this entity's SEC filing mentions — a proxy for regulatory and disclosure activity."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.newsSummary="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="AI-generated summary of the most material headlines from the last 24 hours."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.stockChangePercent="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                title="10-day price change"
                                text="Rate of change in the share price over the last 10 trading days, as a percentage."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.stockChange30dPercent="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                title="30-day price change"
                                text="Total return on the share price over the trailing ~30 days, as a percentage."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.stockTrend="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="Overall price-trend signal (bullish / neutral / bearish) derived from moving averages, RSI, and MACD."
                                :size="11"
                            />
                        </span>
                    </template>
                    <template #header.analyst="{ column }">
                        <span class="d-inline-flex align-center">
                            {{ column.title }}
                            <HelpTooltip
                                text="Your manual assessment tier for this issuer — overrides nothing, captured for the diligence record."
                                :size="11"
                            />
                        </span>
                    </template>

                    <template #item.rank="{ index }">
                        <span class="text-caption font-mono">#{{ index + 1 }}</span>
                    </template>

                    <template #item.name="{ item }">
                        <div class="font-weight-medium">{{ item.resolvedName }}</div>
                        <div class="text-caption text-medium-emphasis">{{ item.neid || '—' }}</div>
                    </template>

                    <template #item.currentValue="{ item }">
                        <div v-if="item.currentValue != null">
                            <div class="font-weight-medium">{{ formatUsd(item.currentValue) }}</div>
                            <div
                                v-if="item.amountInvested != null"
                                class="text-caption text-medium-emphasis"
                            >
                                cost {{ formatUsd(item.amountInvested) }}
                            </div>
                        </div>
                        <span v-else class="text-medium-emphasis">—</span>
                    </template>

                    <template #item.holdingReturn="{ item }">
                        <span
                            v-if="item.holdingReturn != null"
                            class="font-weight-medium"
                            :class="item.holdingReturn >= 0 ? 'text-success' : 'text-error'"
                        >
                            {{ item.holdingReturn >= 0 ? '+' : ''
                            }}{{ item.holdingReturn.toFixed(1) }}%
                        </span>
                        <span v-else class="text-medium-emphasis">—</span>
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
                    <template #item.stockChangePercent="{ item }">
                        <span
                            v-if="item.stockChangePercent != null"
                            class="font-weight-medium font-mono"
                            :class="item.stockChangePercent >= 0 ? 'text-success' : 'text-error'"
                        >
                            {{ formatSignedPct(item.stockChangePercent * 100) }}
                        </span>
                        <span v-else class="text-medium-emphasis">—</span>
                    </template>
                    <template #item.stockChange30dPercent="{ item }">
                        <span
                            v-if="item.stockChange30dPercent != null"
                            class="font-weight-medium font-mono"
                            :class="item.stockChange30dPercent >= 0 ? 'text-success' : 'text-error'"
                        >
                            {{ formatSignedPct(item.stockChange30dPercent) }}
                        </span>
                        <span v-else class="text-medium-emphasis">—</span>
                    </template>
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
                        <div class="d-flex align-center justify-end">
                            <v-btn
                                v-if="item.neid"
                                icon="mdi-arrow-right"
                                variant="text"
                                size="x-small"
                                :aria-label="`Open ${item.resolvedName}`"
                                @click.stop="emit('open', item.entity)"
                            />
                            <v-btn
                                icon="mdi-close"
                                variant="text"
                                size="x-small"
                                color="medium-emphasis"
                                :aria-label="`Remove ${item.resolvedName}`"
                                @click.stop="emit('remove', item.entity)"
                            />
                        </div>
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
        remove: [entity: PortfolioEntity];
    }>();

    const category = ref('ALL');
    const search = ref('');
    const rowsPerPage = ref(50);

    function formatUsd(value: number): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
        }).format(Math.round(value));
    }

    function formatSignedPct(value: number): string {
        return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
    }

    const headers = [
        { title: '#', key: 'rank', sortable: false, width: 50 },
        { title: 'Holding', key: 'name', sortable: true },
        { title: 'Value', key: 'currentValue', sortable: true, width: 120 },
        { title: 'Return', key: 'holdingReturn', sortable: true, width: 90 },
        { title: 'Signals', key: 'signalAgreement', sortable: true, width: 120 },
        // SEC lens
        { title: 'Fin. strength', key: 'solvency', sortable: true, width: 120 },
        { title: 'Leadership', key: 'executive', sortable: true, width: 120 },
        { title: 'Filing activity', key: 'cikVelocity', sortable: true, width: 120 },
        // News lens
        { title: 'News (24h)', key: 'newsSummary', sortable: false, width: 240 },
        { title: 'Headline risk', key: 'newsActivity', sortable: true, width: 120 },
        // Stock lens
        { title: '10d', key: 'stockChangePercent', sortable: true, width: 80 },
        { title: '30d', key: 'stockChange30dPercent', sortable: true, width: 80 },
        { title: 'Trend', key: 'stockTrend', sortable: true, width: 90 },
        // Polymarket lens
        { title: 'Markets', key: 'polymarket', sortable: true, width: 140 },
        { title: 'Ownership', key: 'acsScore', sortable: true, width: 90 },
        { title: 'Analyst', key: 'analyst', sortable: false, width: 130 },
        { title: '', key: 'actions', sortable: false, width: 80 },
    ];

    const rows = computed(() =>
        props.entities.map((entity) => ({
            entity,
            neid: entity.neid,
            resolvedName: entity.resolvedName,
            currentValue: entity.valuation?.currentValue ?? entity.amountInvested ?? null,
            amountInvested: entity.amountInvested ?? null,
            holdingReturn: entity.valuation?.returnPct ?? null,
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
