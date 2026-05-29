<template>
    <v-card>
        <v-data-table
            :headers="headers"
            :items="rows"
            :loading="loading"
            density="comfortable"
            hover
            @click:row="(_e: Event, { item }: { item: PortfolioEntity }) => emit('open', item)"
        >
            <template #item.name="{ item }">
                <div class="font-weight-medium cursor-pointer">{{ item.resolvedName }}</div>
                <div class="text-caption text-medium-emphasis">{{ item.neid || '—' }}</div>
            </template>

            <template #item.fhsScore="{ item }">
                <v-chip
                    v-if="item.scores?.solvency != null"
                    :color="scoreLabelColor(item.scores.solvency)"
                    size="small"
                    label
                    >{{ tierLabel(scoreToLabel(item.scores.solvency)) }}</v-chip
                >
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.trend="{ item }">
                <v-chip
                    v-if="item.monitor?.fhs?.trendDirection"
                    :color="trendColor(item.monitor.fhs.trendDirection)"
                    size="x-small"
                    label
                    variant="tonal"
                >
                    <v-icon start size="x-small">{{
                        trendIcon(item.monitor.fhs.trendDirection)
                    }}</v-icon>
                    {{ item.monitor.fhs.trendDirection }}
                </v-chip>
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.leverage="{ item }">
                <span
                    v-if="item.monitor?.fhs?.leverageLatest != null"
                    class="font-mono text-body-2"
                >
                    {{ item.monitor.fhs.leverageLatest.toFixed(2) }}x
                    <span
                        v-if="item.monitor.fhs.leveragePrevious != null"
                        class="text-caption text-medium-emphasis"
                    >
                        (prev {{ item.monitor.fhs.leveragePrevious.toFixed(2) }}x)
                    </span>
                </span>
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.distressEvents="{ item }">
                <template v-if="item.monitor?.fhs?.totalDistressEvents">
                    <v-chip color="error" size="x-small" label class="mr-1">
                        {{ item.monitor.fhs.totalDistressEvents }}
                    </v-chip>
                    <span class="text-caption text-medium-emphasis">
                        {{ distressLabel(item.monitor.fhs.distressEventCounts) }}
                    </span>
                </template>
                <span v-else class="text-medium-emphasis text-body-2">None</span>
            </template>

            <template #item.filingAge="{ item }">
                <span
                    v-if="item.monitor?.fhs?.freshestFilingDays != null"
                    class="font-mono text-body-2"
                >
                    {{ item.monitor.fhs.freshestFilingDays }}d
                </span>
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.eventPressure="{ item }">
                <v-chip
                    v-if="item.scores?.eventPressure != null"
                    :color="scoreLabelColor(item.scores.eventPressure)"
                    size="small"
                    label
                    >{{ tierLabel(scoreToLabel(item.scores.eventPressure)) }}</v-chip
                >
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.fused="{ item }">
                <v-chip
                    v-if="item.scores?.fused != null"
                    :color="scoreLabelColor(item.scores.fused)"
                    size="small"
                    label
                    >{{ tierLabel(scoreToLabel(item.scores.fused)) }}</v-chip
                >
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.actions="{ item }">
                <v-btn
                    icon="mdi-arrow-right"
                    size="x-small"
                    variant="text"
                    @click.stop="emit('open', item)"
                />
            </template>
        </v-data-table>
    </v-card>
</template>

<script setup lang="ts">
    import type { PortfolioEntity } from '~/composables/usePortfolio';
    import { scoreToLabel, scoreLabelColor, tierLabel } from '~/composables/useFusedScoring';

    const props = defineProps<{ entities: PortfolioEntity[]; loading?: boolean }>();
    const emit = defineEmits<{ open: [entity: PortfolioEntity] }>();

    const headers = [
        { title: 'Entity', key: 'name', sortable: true },
        { title: 'FHS', key: 'fhsScore', sortable: false, width: 100 },
        { title: 'Trend', key: 'trend', sortable: false, width: 120 },
        { title: 'Leverage (D/E)', key: 'leverage', sortable: false, width: 170 },
        { title: 'Distress events', key: 'distressEvents', sortable: false, width: 200 },
        { title: 'Filing age', key: 'filingAge', sortable: false, width: 100 },
        { title: 'Event pressure', key: 'eventPressure', sortable: false, width: 130 },
        { title: 'Fused', key: 'fused', sortable: false, width: 90 },
        { title: '', key: 'actions', sortable: false, width: 40 },
    ];

    const rows = computed(() => props.entities);

    type DistressCount = NonNullable<
        NonNullable<NonNullable<PortfolioEntity['monitor']>['fhs']>['distressEventCounts']
    >;

    function distressLabel(counts: DistressCount): string {
        const parts: string[] = [];
        if (counts.bankruptcy) parts.push(`${counts.bankruptcy} bankruptcy`);
        if (counts.delisting) parts.push(`${counts.delisting} delisting`);
        if (counts.nonReliance) parts.push(`${counts.nonReliance} non-reliance`);
        if (counts.triggering) parts.push(`${counts.triggering} triggering`);
        if (counts.impairment) parts.push(`${counts.impairment} impairment`);
        if (counts.termination) parts.push(`${counts.termination} termination`);
        return parts.slice(0, 2).join(', ') + (parts.length > 2 ? '…' : '');
    }

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
