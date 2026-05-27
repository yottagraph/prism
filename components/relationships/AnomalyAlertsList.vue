<template>
    <v-card class="pa-3 fill-height">
        <div class="d-flex align-center justify-space-between mb-3">
            <div class="d-flex align-center ga-2">
                <v-icon size="small" color="warning">mdi-alert-circle-outline</v-icon>
                <span class="text-subtitle-2">Anomaly Alerts</span>
            </div>
            <v-chip size="x-small" variant="outlined"
                >{{ alerts.length }} / {{ totalCount }}</v-chip
            >
        </div>

        <v-data-table
            :headers="headers"
            :items="alerts"
            :loading="loading"
            density="compact"
            class="alerts-table"
            item-value="priceDate"
            hover
        >
            <template #item.ticker="{ item }">
                <span class="font-weight-medium">{{ item.ticker || item.entityName }}</span>
            </template>

            <template #item.anomalyScore="{ item }">
                <v-chip size="x-small" :color="scoreColor(item.anomalyScore)" variant="tonal">
                    {{ item.anomalyScore.toFixed(0) }}
                </v-chip>
            </template>

            <template #item.anomalyType="{ item }">
                <v-chip size="x-small" variant="outlined">{{
                    prettyType(item.anomalyType)
                }}</v-chip>
            </template>

            <template #item.dailyReturn="{ item }">
                <span
                    :class="
                        item.dailyReturn != null && item.dailyReturn < 0
                            ? 'text-error'
                            : 'text-success'
                    "
                >
                    {{ item.dailyReturn == null ? 'n/a' : `${item.dailyReturn.toFixed(2)}%` }}
                </span>
            </template>

            <template #item.signals="{ item }">
                <v-chip size="x-small" variant="text" class="mr-1">
                    P: {{ formatZ(item.returnZscore) }}
                </v-chip>
                <v-chip size="x-small" variant="text" class="mr-1">
                    V: {{ formatZ(item.volumeZscore) }}
                </v-chip>
                <v-chip size="x-small" variant="text">
                    Vol: {{ formatZ(item.volatilityZscore) }}
                </v-chip>
            </template>

            <template #item.actions="{ item }">
                <v-btn
                    icon="mdi-arrow-right"
                    size="x-small"
                    variant="text"
                    @click="$emit('select', item)"
                />
            </template>
        </v-data-table>
    </v-card>
</template>

<script setup lang="ts">
    import type { PortfolioStockAnomalyRow } from '~/composables/useRelationships';

    defineProps<{
        alerts: PortfolioStockAnomalyRow[];
        totalCount: number;
        loading?: boolean;
    }>();

    defineEmits<{
        select: [item: PortfolioStockAnomalyRow];
    }>();

    const headers = [
        { title: 'Ticker', key: 'ticker', sortable: false },
        { title: 'Date', key: 'priceDate', sortable: true },
        { title: 'Score', key: 'anomalyScore', sortable: true, align: 'end' as const },
        { title: 'Type', key: 'anomalyType', sortable: false },
        { title: 'Return', key: 'dailyReturn', sortable: true, align: 'end' as const },
        { title: 'Signals', key: 'signals', sortable: false },
        { title: '', key: 'actions', sortable: false, width: 32 },
    ];

    function scoreColor(score: number) {
        if (score >= 80) return 'error';
        if (score >= 60) return 'warning';
        return 'primary';
    }

    function formatZ(value: number | null) {
        return value == null ? 'n/a' : value.toFixed(1);
    }

    function prettyType(value: string | null) {
        if (!value) return 'n/a';
        return value.replaceAll('_', ' ');
    }
</script>

<style scoped>
    .alerts-table :deep(.v-data-table__wrapper) {
        max-height: 260px;
    }
</style>
