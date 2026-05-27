<template>
    <div>
        <div class="d-flex align-center mb-3">
            <div class="text-subtitle-1">Stock Entity</div>
            <v-spacer />
            <v-btn
                size="small"
                variant="text"
                prepend-icon="mdi-refresh"
                :loading="loading"
                @click="$emit('refresh')"
            >
                Refresh stock data
            </v-btn>
        </div>

        <v-progress-linear v-if="loading" indeterminate class="mb-3" />
        <v-alert v-if="error" type="warning" variant="tonal" class="mb-3">{{ error }}</v-alert>
        <v-alert v-if="!stock && !loading && !error" type="info" variant="tonal" class="mb-3">
            Select this tab to load stock entity data.
        </v-alert>

        <template v-if="stock">
            <v-alert
                v-if="stock.canonicalNeid"
                type="info"
                variant="tonal"
                density="compact"
                class="mb-3"
            >
                Stored portfolio NEID was orphaned in Elemental. Re-resolved to canonical
                <span class="font-mono">{{ stock.canonicalNeid }}</span> via name search. Re-scan
                the portfolio to update stored NEIDs.
            </v-alert>

            <v-card class="pa-4 mb-3">
                <div class="d-flex align-center flex-wrap ga-2">
                    <div class="text-h6">{{ stock.entityName }}</div>
                    <v-chip v-if="stock.ticker" size="small" variant="tonal" color="primary">
                        {{ stock.ticker }}
                    </v-chip>
                    <v-chip v-if="stock.exchange" size="small" variant="tonal">{{
                        stock.exchange
                    }}</v-chip>
                    <v-chip v-if="stock.currency" size="small" variant="tonal">{{
                        stock.currency
                    }}</v-chip>
                    <v-spacer />
                    <div class="text-body-2 text-medium-emphasis">{{ latestPriceText }}</div>
                </div>
                <div class="d-flex align-center flex-wrap ga-2 mt-2">
                    <v-chip v-if="stock.sector" size="x-small" variant="outlined">{{
                        stock.sector
                    }}</v-chip>
                    <v-chip v-if="stock.industry" size="x-small" variant="outlined">{{
                        stock.industry
                    }}</v-chip>
                </div>
                <div v-if="stock.instrumentName" class="text-caption text-medium-emphasis mt-2">
                    Instrument: {{ stock.instrumentName }}
                </div>
            </v-card>

            <v-row dense class="mb-3">
                <v-col cols="6" md="3">
                    <v-sheet class="stat-strip pa-3 rounded">
                        <div class="text-caption text-medium-emphasis">Last Price</div>
                        <div class="text-body-1 font-mono">
                            {{ formatPrice(stock.latestClose) }}
                        </div>
                    </v-sheet>
                </v-col>
                <v-col cols="6" md="3">
                    <v-sheet class="stat-strip pa-3 rounded">
                        <div class="text-caption text-medium-emphasis">Window Return</div>
                        <div class="text-body-1 font-mono" :class="returnClass">
                            {{ formatSignedPercent(stock.returnPct) }}
                        </div>
                    </v-sheet>
                </v-col>
                <v-col cols="6" md="3">
                    <v-sheet class="stat-strip pa-3 rounded">
                        <div class="text-caption text-medium-emphasis">Market Cap</div>
                        <div class="text-body-1 font-mono">
                            {{ formatMoney(stock.fundamentals.marketCap) }}
                        </div>
                    </v-sheet>
                </v-col>
                <v-col cols="6" md="3">
                    <v-sheet class="stat-strip pa-3 rounded">
                        <div class="text-caption text-medium-emphasis">P/E</div>
                        <div class="text-body-1 font-mono">
                            {{
                                stock.fundamentals.peRatio != null
                                    ? stock.fundamentals.peRatio.toFixed(2)
                                    : '—'
                            }}
                        </div>
                    </v-sheet>
                </v-col>
            </v-row>

            <v-tabs v-model="stockTab" class="mb-3">
                <v-tab value="overview">Overview</v-tab>
                <v-tab value="charts">Charts & Technical</v-tab>
                <v-tab value="fundamentals">Fundamentals</v-tab>
            </v-tabs>

            <v-window v-model="stockTab">
                <v-window-item value="overview">
                    <v-alert
                        v-if="stock.analytics.narrative.length"
                        type="info"
                        variant="tonal"
                        density="comfortable"
                        class="mb-3"
                    >
                        <div v-for="(line, idx) in stock.analytics.narrative" :key="`narr-${idx}`">
                            {{ line }}
                        </div>
                    </v-alert>

                    <v-card class="pa-4 stock-card mb-3">
                        <PriceHistoryChart
                            :ticker="stock.ticker"
                            :prices="stock.prices"
                            :events="chartEvents"
                        />
                        <div class="text-caption text-medium-emphasis mt-2">
                            {{ stock.samples }} samples loaded{{
                                stock.latestDate ? ` · latest ${stock.latestDate}` : ''
                            }}
                        </div>
                    </v-card>

                    <v-row dense class="mb-3">
                        <v-col cols="12" md="6">
                            <v-card class="pa-4 stock-card">
                                <div class="text-subtitle-2 mb-3">Key Metrics</div>
                                <div class="metrics-grid">
                                    <div
                                        v-for="m in stock.keyMetrics"
                                        :key="m.label"
                                        class="metric-box"
                                    >
                                        <div class="text-caption text-medium-emphasis">
                                            {{ m.label }}
                                        </div>
                                        <div class="text-body-1 font-mono">{{ m.value }}</div>
                                    </div>
                                </div>
                            </v-card>
                        </v-col>
                        <v-col cols="12" md="6">
                            <v-card class="pa-4 stock-card">
                                <div class="text-subtitle-2 mb-3">Fundamentals Snapshot</div>
                                <div class="metrics-grid">
                                    <div
                                        v-for="m in overviewFundamentals"
                                        :key="m.label"
                                        class="metric-box"
                                    >
                                        <div class="text-caption text-medium-emphasis">
                                            {{ m.label }}
                                        </div>
                                        <div class="text-body-1 font-mono">{{ m.value }}</div>
                                    </div>
                                </div>
                            </v-card>
                        </v-col>
                    </v-row>

                    <v-card class="pa-4 stock-card mb-3">
                        <div class="text-subtitle-2 mb-3">Data Gaps</div>
                        <ul v-if="stock.dataGaps.length" class="data-gap-list">
                            <li v-for="gap in stock.dataGaps" :key="gap">{{ gap }}</li>
                        </ul>
                        <div v-else class="text-body-2 text-success">No known stock data gaps.</div>
                    </v-card>

                    <v-card class="pa-4 stock-card">
                        <div class="text-subtitle-2 mb-3">Provenance</div>
                        <div v-if="stock.citations.length" class="d-flex flex-wrap ga-2">
                            <CitationChip
                                v-for="(citation, idx) in stock.citations"
                                :key="`stock-citation-${idx}`"
                                :citation="citation"
                            />
                        </div>
                        <v-alert v-else type="info" variant="tonal" density="compact">
                            No citation links were returned for stock data.
                        </v-alert>
                    </v-card>
                </v-window-item>

                <v-window-item value="charts">
                    <SignalChips :analytics="stock.analytics" class="mb-3" />
                    <v-row dense class="mb-3">
                        <v-col cols="12" md="4">
                            <RSIGauge :value="stock.analytics.rsi14" />
                        </v-col>
                        <v-col cols="12" md="4">
                            <MACDChart
                                :macd="stock.analytics.macd?.macd ?? null"
                                :signal="stock.analytics.macd?.signal ?? null"
                                :histogram="stock.analytics.macd?.histogram ?? null"
                            />
                        </v-col>
                        <v-col cols="12" md="4">
                            <BollingerPosition
                                :percent-b="stock.analytics.bollinger?.percentB ?? null"
                            />
                        </v-col>
                    </v-row>
                    <v-row dense class="mb-3">
                        <v-col cols="12" md="6">
                            <VolatilityCard :value="stock.analytics.annualisedVol20d" />
                        </v-col>
                        <v-col cols="12" md="6">
                            <VolumeAnalysis :ratio="stock.analytics.volumeRatio20d" />
                        </v-col>
                    </v-row>
                    <MovingAveragesTable
                        :latest-close="stock.latestClose"
                        :moving-averages="stock.analytics.movingAverages"
                    />
                </v-window-item>

                <v-window-item value="fundamentals">
                    <v-card class="pa-4 stock-card mb-3">
                        <div class="text-subtitle-2 mb-3">Fundamentals (Elemental)</div>
                        <v-table density="comfortable">
                            <thead>
                                <tr>
                                    <th>Metric</th>
                                    <th class="text-right">Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="row in fundamentalsRows" :key="row.label">
                                    <td>{{ row.label }}</td>
                                    <td class="text-right font-mono">{{ row.value }}</td>
                                </tr>
                            </tbody>
                        </v-table>
                    </v-card>

                    <v-card class="pa-4 stock-card">
                        <div class="text-subtitle-2 mb-3">Fundamentals Provenance</div>
                        <div
                            v-if="stock.fundamentals.citations.length"
                            class="d-flex flex-wrap ga-2"
                        >
                            <CitationChip
                                v-for="(citation, idx) in stock.fundamentals.citations"
                                :key="`fund-citation-${idx}`"
                                :citation="citation"
                            />
                        </div>
                        <v-alert v-else type="info" variant="tonal" density="compact">
                            No fundamentals citations available.
                        </v-alert>
                    </v-card>
                </v-window-item>
            </v-window>
        </template>
    </div>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue';

    import CitationChip from '~/components/CitationChip.vue';
    import PriceHistoryChart from '~/components/entity/PriceHistoryChart.vue';
    import BollingerPosition from '~/components/entity/stock/BollingerPosition.vue';
    import MACDChart from '~/components/entity/stock/MACDChart.vue';
    import MovingAveragesTable from '~/components/entity/stock/MovingAveragesTable.vue';
    import RSIGauge from '~/components/entity/stock/RSIGauge.vue';
    import SignalChips from '~/components/entity/stock/SignalChips.vue';
    import VolatilityCard from '~/components/entity/stock/VolatilityCard.vue';
    import VolumeAnalysis from '~/components/entity/stock/VolumeAnalysis.vue';
    import type { StockEntityProfileData } from '~/composables/useEntityStockProfile';

    const props = defineProps<{
        stock: StockEntityProfileData | null;
        loading: boolean;
        error: string | null;
        events?: Array<{
            date: string;
            title: string;
            severity: 'low' | 'medium' | 'high';
            category: string;
        }>;
    }>();

    defineEmits<{ (e: 'refresh'): void }>();

    const stockTab = ref<'overview' | 'charts' | 'fundamentals'>('overview');

    const latestPriceText = computed(() => {
        if (!props.stock) return '';
        if (typeof props.stock.latestClose !== 'number') return 'No latest close available';
        const ret =
            typeof props.stock.returnPct === 'number'
                ? ` · ${props.stock.returnPct >= 0 ? '+' : ''}${props.stock.returnPct.toFixed(1)}%`
                : '';
        const date = props.stock.latestDate ? ` (${props.stock.latestDate.slice(0, 10)})` : '';
        return `$${props.stock.latestClose.toFixed(2)}${ret}${date}`;
    });

    const chartEvents = computed<
        Array<{ date: string; label: string; severity: 'high' | 'medium' | 'low' }>
    >(() =>
        (props.events || []).map((event) => ({
            date: event.date,
            label: `${event.category}: ${event.title}`,
            severity:
                event.severity === 'high' ? 'high' : event.severity === 'medium' ? 'medium' : 'low',
        }))
    );

    function formatMoney(value?: number) {
        if (value == null || !Number.isFinite(value)) return '—';
        if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
        if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
        if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
        return `$${value.toFixed(2)}`;
    }
    function formatPct(value?: number) {
        if (value == null || !Number.isFinite(value)) return '—';
        return `${(value * 100).toFixed(2)}%`;
    }
    function formatSignedPercent(value?: number | null) {
        if (value == null || !Number.isFinite(value)) return '—';
        return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
    }
    function formatPrice(value?: number | null) {
        if (value == null || !Number.isFinite(value)) return '—';
        return `$${value.toFixed(2)}`;
    }
    function formatRatio(value?: number) {
        if (value == null || !Number.isFinite(value)) return '—';
        return `${value.toFixed(2)}x`;
    }
    function formatNum(value?: number) {
        if (value == null || !Number.isFinite(value)) return '—';
        return value.toLocaleString();
    }

    const overviewFundamentals = computed(() => {
        const f = props.stock?.fundamentals;
        if (!f) return [];
        return [
            { label: 'Market Cap', value: formatMoney(f.marketCap) },
            { label: 'P/E Ratio', value: f.peRatio != null ? f.peRatio.toFixed(2) : '—' },
            { label: 'Profit Margin', value: formatPct(f.profitMargin) },
            { label: 'ROE', value: formatPct(f.roe) },
            { label: 'Debt/Equity', value: formatRatio(f.debtToEquity) },
            { label: 'Dividend Yield', value: formatPct(f.dividendYield) },
        ];
    });

    const fundamentalsRows = computed(() => {
        const f = props.stock?.fundamentals;
        if (!f) return [];
        return [
            ['Market Cap', formatMoney(f.marketCap)],
            ['P/E Ratio', f.peRatio != null ? f.peRatio.toFixed(2) : '—'],
            ['Profit Margin', formatPct(f.profitMargin)],
            ['ROE', formatPct(f.roe)],
            ['ROA', formatPct(f.roa)],
            ['Debt/Equity', formatRatio(f.debtToEquity)],
            ['Dividend Yield', formatPct(f.dividendYield)],
            ['Payout Ratio', formatPct(f.payoutRatio)],
            ['Total Revenue', formatMoney(f.totalRevenue)],
            ['Net Income', formatMoney(f.netIncome)],
            ['Total Assets', formatMoney(f.totalAssets)],
            ['Total Liabilities', formatMoney(f.totalLiabilities)],
            ['Shareholders Equity', formatMoney(f.shareholdersEquity)],
            ['Shares Outstanding', formatNum(f.sharesOutstanding)],
            ['Public Float', formatMoney(f.publicFloat)],
            ['Employees', formatNum(f.employees)],
            ['Long-term Debt', formatMoney(f.longTermDebt)],
            ['EPS Basic', f.epsBasic != null ? `$${f.epsBasic.toFixed(2)}` : '—'],
            ['EPS Diluted', f.epsDiluted != null ? `$${f.epsDiluted.toFixed(2)}` : '—'],
            ['Dividends Common', formatMoney(f.dividendsCommon)],
            ['Gross Profit', formatMoney(f.grossProfit)],
            ['Operating Cash Flow', formatMoney(f.operatingCashFlow)],
        ]
            .filter((row) => row[1] !== '—')
            .map(([label, value]) => ({ label, value }));
    });

    const returnClass = computed(() => {
        const value = props.stock?.returnPct;
        if (value == null) return '';
        return value >= 0 ? 'text-success' : 'text-error';
    });
</script>

<style scoped>
    .stock-card {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
    }
    .metric-box {
        border: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(255, 255, 255, 0.02);
        border-radius: 8px;
        padding: 8px 10px;
    }
    .data-gap-list {
        margin: 0;
        padding-left: 18px;
    }
    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
    .stat-strip {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
</style>
