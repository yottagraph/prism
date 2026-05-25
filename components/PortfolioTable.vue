<template>
    <v-card>
        <v-data-table
            :headers="headers"
            :items="rows"
            :loading="loading"
            density="comfortable"
            hover
            items-per-page="50"
            class="portfolio-table"
            @click:row="onRowClick"
        >
            <template v-slot:item.rank="{ index }">
                <span class="text-caption text-medium-emphasis font-mono">{{ index + 1 }}</span>
            </template>

            <template v-slot:item.resolvedName="{ item }">
                <div class="d-flex align-center">
                    <span class="font-weight-medium">{{ item.resolvedName }}</span>
                    <v-tooltip v-if="item.resolutionError" :text="item.resolutionError">
                        <template #activator="{ props: tooltipProps }">
                            <v-icon
                                v-bind="tooltipProps"
                                size="x-small"
                                color="warning"
                                class="ml-2"
                            >
                                mdi-alert-circle-outline
                            </v-icon>
                        </template>
                    </v-tooltip>
                </div>
                <div v-if="item.neid" class="text-caption text-medium-emphasis font-mono">
                    {{ item.neid }}
                </div>
            </template>

            <template v-for="lens in lenses" v-slot:[`item.${lens}`]="{ item }" :key="lens">
                <ScoreCell :value="item[lens]" />
            </template>

            <template v-slot:item.fused="{ item }">
                <div class="d-flex align-center">
                    <ScoreCell :value="item.fused" emphasize />
                    <v-chip
                        v-if="item.tier"
                        :color="tierColor(item.tier)"
                        size="x-small"
                        variant="tonal"
                        label
                        class="ml-2"
                    >
                        {{ tierLabel(item.tier) }}
                    </v-chip>
                </div>
            </template>

            <template v-slot:item.trend="{ item }">
                <v-icon :color="item.trend === 'up' ? 'error' : 'success'" size="small">
                    {{ item.trend === 'up' ? 'mdi-trending-up' : 'mdi-trending-down' }}
                </v-icon>
            </template>

            <template v-slot:item.actions="{ item }">
                <v-btn
                    v-if="item.neid"
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
    import { computed, defineAsyncComponent, h } from 'vue';

    import type { PortfolioEntity } from '~/composables/usePortfolio';
    import { tierColor, tierLabel } from '~/composables/useFusedScoring';

    const props = defineProps<{
        entities: PortfolioEntity[];
        loading?: boolean;
    }>();

    const emit = defineEmits<{
        open: [entity: PortfolioEntity];
    }>();

    const lenses = ['solvency', 'executive', 'news', 'market'] as const;

    const headers = [
        { title: '#', key: 'rank', sortable: false, width: 40 },
        { title: 'Name', key: 'resolvedName', sortable: true },
        { title: 'FHS', key: 'solvency', sortable: true, align: 'end' as const, width: 80 },
        { title: 'ERS', key: 'executive', sortable: true, align: 'end' as const, width: 80 },
        { title: 'News', key: 'news', sortable: true, align: 'end' as const, width: 80 },
        { title: 'Mkt', key: 'market', sortable: true, align: 'end' as const, width: 80 },
        { title: 'Fused', key: 'fused', sortable: true, align: 'end' as const, width: 130 },
        { title: 'Trend', key: 'trend', sortable: false, width: 70 },
        { title: '', key: 'actions', sortable: false, width: 40 },
    ];

    const rows = computed(() =>
        props.entities.map((e) => ({
            ...e,
            solvency: e.scores?.solvency ?? null,
            executive: e.scores?.executive ?? null,
            news: e.scores?.news ?? null,
            market: e.scores?.market ?? null,
            fused: e.scores?.fused ?? null,
            tier: e.scores?.tier ?? null,
            trend: (e.scores?.fused ?? 0) >= 60 ? 'up' : 'down',
        }))
    );

    function onRowClick(_e: Event, row: { item: PortfolioEntity }) {
        if (row.item.neid) emit('open', row.item);
    }

    // Inline score cell component (keeps the file self-contained).
    const ScoreCell = defineAsyncComponent(async () => ({
        props: { value: { type: Number as any, default: null }, emphasize: Boolean },
        setup(p: any) {
            return () => {
                if (p.value === null || p.value === undefined) {
                    return h('span', { class: 'text-caption text-medium-emphasis' }, '–');
                }
                const v: number = p.value;
                const color =
                    v >= 80 ? 'error' : v >= 65 ? 'warning' : v >= 50 ? 'info' : 'success';
                return h(
                    'span',
                    {
                        class:
                            'd-inline-flex align-center justify-end font-mono ' +
                            (p.emphasize ? 'text-h6' : 'text-body-2'),
                        style: `color: var(--v-theme-${color}); min-width: 32px;`,
                    },
                    v
                );
            };
        },
    }));
</script>

<style scoped>
    .portfolio-table :deep(tbody tr) {
        cursor: pointer;
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
