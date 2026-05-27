<template>
    <div class="pa-3">
        <div v-if="!data" class="text-caption text-medium-emphasis py-8 text-center">
            No stock analytics available for this portfolio.
        </div>

        <template v-else>
            <v-row dense class="mb-2">
                <v-col cols="12" sm="6" lg="3">
                    <v-card class="metric-card">
                        <div class="text-caption text-medium-emphasis">Tickers Analyzed</div>
                        <div class="text-h5 font-weight-bold">
                            {{ data.summary.tickersAnalyzed }}
                        </div>
                    </v-card>
                </v-col>
                <v-col cols="12" sm="6" lg="3">
                    <v-card class="metric-card metric-bullish">
                        <div class="text-caption">Bullish Trend</div>
                        <div class="text-h5 font-weight-bold">{{ data.summary.bullishCount }}</div>
                    </v-card>
                </v-col>
                <v-col cols="12" sm="6" lg="3">
                    <v-card class="metric-card metric-bearish">
                        <div class="text-caption">Bearish Trend</div>
                        <div class="text-h5 font-weight-bold">{{ data.summary.bearishCount }}</div>
                    </v-card>
                </v-col>
                <v-col cols="12" sm="6" lg="3">
                    <v-card class="metric-card metric-anomaly">
                        <div class="text-caption">Anomalies</div>
                        <div class="text-h5 font-weight-bold">{{ data.totalAnomalyCount }}</div>
                    </v-card>
                </v-col>
            </v-row>

            <v-row dense class="mb-2">
                <v-col cols="12" lg="5">
                    <AnomalyAlertsList
                        :alerts="data.anomalies"
                        :total-count="data.totalAnomalyCount"
                        :loading="loading"
                        @select="onSelectAnomaly"
                    />
                </v-col>
                <v-col cols="12" lg="7">
                    <MomentumHeatmap :items="data.tickers" @select="onSelectTicker" />
                </v-col>
            </v-row>

            <v-row dense>
                <v-col cols="12" lg="6">
                    <v-card class="pa-3 fill-height">
                        <div class="text-subtitle-2 mb-3">RSI Distribution</div>
                        <div class="mb-2">
                            <div class="d-flex justify-space-between text-caption">
                                <span>Oversold (&lt;30)</span
                                ><span>{{ data.summary.oversoldCount }}</span>
                            </div>
                            <v-progress-linear
                                :model-value="toPct(data.summary.oversoldCount)"
                                color="success"
                                height="10"
                            />
                        </div>
                        <div class="mb-2">
                            <div class="d-flex justify-space-between text-caption">
                                <span>Neutral (30-70)</span
                                ><span>{{ data.summary.rsiNeutralCount }}</span>
                            </div>
                            <v-progress-linear
                                :model-value="toPct(data.summary.rsiNeutralCount)"
                                color="info"
                                height="10"
                            />
                        </div>
                        <div>
                            <div class="d-flex justify-space-between text-caption">
                                <span>Overbought (&gt;70)</span
                                ><span>{{ data.summary.overboughtCount }}</span>
                            </div>
                            <v-progress-linear
                                :model-value="toPct(data.summary.overboughtCount)"
                                color="error"
                                height="10"
                            />
                        </div>
                    </v-card>
                </v-col>
                <v-col cols="12" lg="6">
                    <v-card class="pa-3 fill-height">
                        <div class="text-subtitle-2 mb-3">Trend Distribution</div>
                        <div class="mb-2">
                            <div class="d-flex justify-space-between text-caption">
                                <span>Bullish</span><span>{{ data.summary.bullishCount }}</span>
                            </div>
                            <v-progress-linear
                                :model-value="toPct(data.summary.bullishCount)"
                                color="success"
                                height="10"
                            />
                        </div>
                        <div class="mb-2">
                            <div class="d-flex justify-space-between text-caption">
                                <span>Neutral</span><span>{{ data.summary.neutralCount }}</span>
                            </div>
                            <v-progress-linear
                                :model-value="toPct(data.summary.neutralCount)"
                                color="info"
                                height="10"
                            />
                        </div>
                        <div>
                            <div class="d-flex justify-space-between text-caption">
                                <span>Bearish</span><span>{{ data.summary.bearishCount }}</span>
                            </div>
                            <v-progress-linear
                                :model-value="toPct(data.summary.bearishCount)"
                                color="error"
                                height="10"
                            />
                        </div>
                    </v-card>
                </v-col>
            </v-row>
        </template>
    </div>
</template>

<script setup lang="ts">
    import type {
        PortfolioStockAnalytics,
        PortfolioStockAnomalyRow,
        PortfolioStockTickerRow,
    } from '~/composables/useRelationships';

    const props = defineProps<{
        data: PortfolioStockAnalytics | null;
        loading?: boolean;
    }>();

    const emit = defineEmits<{
        selectTicker: [item: PortfolioStockTickerRow];
        selectAnomaly: [item: PortfolioStockAnomalyRow];
    }>();

    function toPct(count: number) {
        const total = props.data?.summary.tickersAnalyzed || 0;
        if (!total) return 0;
        return (count / total) * 100;
    }

    function onSelectTicker(item: PortfolioStockTickerRow) {
        emit('selectTicker', item);
    }

    function onSelectAnomaly(item: PortfolioStockAnomalyRow) {
        emit('selectAnomaly', item);
    }
</script>

<style scoped>
    .metric-card {
        padding: 12px;
    }

    .metric-bullish {
        background: rgba(45, 202, 112, 0.14);
    }

    .metric-bearish {
        background: rgba(244, 67, 54, 0.14);
    }

    .metric-anomaly {
        background: rgba(255, 167, 38, 0.14);
    }
</style>
