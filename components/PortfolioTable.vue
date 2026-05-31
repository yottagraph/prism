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
            <!-- Custom header slots add HelpTooltip to lens columns -->
            <template
                v-for="lh in lensHeaders"
                :key="lh.key"
                v-slot:[`header.${lh.key}`]="{ column }"
            >
                <span class="d-inline-flex align-center">
                    {{ column.title }}
                    <HelpTooltip
                        :text="lh.description"
                        :title="lh.fullLabel"
                        :size="12"
                        location="top"
                    />
                </span>
            </template>
            <template v-slot:header.fused="{ column }">
                <span class="d-inline-flex align-center">
                    {{ column.title }}
                    <HelpTooltip
                        title="Overall risk"
                        text="A weighted blend of Financial strength (35%), Material events (25%), Leadership stability (25%), and Headline risk (15%). Higher = more risk."
                        :size="12"
                        location="top"
                    />
                </span>
            </template>
            <template v-slot:header.trend="{ column }">
                <span class="d-inline-flex align-center">
                    {{ column.title }}
                    <HelpTooltip
                        text="Risk trend since the last scan: up means risk increased, down means it decreased."
                        :size="12"
                        location="top"
                    />
                </span>
            </template>
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
                <v-chip
                    v-if="item[lens] != null"
                    :color="scoreLabelColor(item[lens])"
                    size="x-small"
                    label
                    >{{ tierLabel(scoreToLabel(item[lens])) }}</v-chip
                >
                <span v-else class="text-caption text-medium-emphasis">–</span>
            </template>

            <template v-slot:item.fused="{ item }">
                <v-chip v-if="item.tier" :color="tierColor(item.tier)" size="small" label>
                    {{ tierLabel(item.tier) }}
                </v-chip>
                <span v-else class="text-caption text-medium-emphasis">–</span>
            </template>

            <template v-slot:item.trend="{ item }">
                <v-icon
                    :color="
                        item.trend === 'up'
                            ? 'error'
                            : item.trend === 'down'
                              ? 'success'
                              : 'medium-emphasis'
                    "
                    size="small"
                >
                    {{
                        item.trend === 'up'
                            ? 'mdi-trending-up'
                            : item.trend === 'down'
                              ? 'mdi-trending-down'
                              : 'mdi-trending-neutral'
                    }}
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
    import { computed } from 'vue';

    import type { PortfolioEntity } from '~/composables/usePortfolio';
    import {
        tierColor,
        tierLabel,
        scoreToLabel,
        scoreLabelColor,
        LENS_META,
    } from '~/composables/useFusedScoring';

    const props = defineProps<{
        entities: PortfolioEntity[];
        loading?: boolean;
    }>();

    const emit = defineEmits<{
        open: [entity: PortfolioEntity];
    }>();

    const lenses = ['solvency', 'executive', 'news', 'market'] as const;

    /** Metadata for lens columns used to render header tooltips. */
    const lensHeaders = lenses.map((key) => ({
        key,
        fullLabel: LENS_META[key].label,
        description: LENS_META[key].description,
    }));

    const headers = [
        { title: '#', key: 'rank', sortable: false, width: 40 },
        { title: 'Name', key: 'resolvedName', sortable: true },
        {
            title: 'Fin. strength',
            key: 'solvency',
            sortable: true,
            align: 'end' as const,
            width: 100,
        },
        {
            title: 'Leadership',
            key: 'executive',
            sortable: true,
            align: 'end' as const,
            width: 100,
        },
        { title: 'Headline risk', key: 'news', sortable: true, align: 'end' as const, width: 100 },
        {
            title: 'Price stability',
            key: 'market',
            sortable: true,
            align: 'end' as const,
            width: 105,
        },
        { title: 'Overall risk', key: 'fused', sortable: true, align: 'end' as const, width: 130 },
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
            trend:
                e.scores?.previousFused === undefined
                    ? 'flat'
                    : (e.scores?.fused ?? 0) > e.scores.previousFused
                      ? 'up'
                      : (e.scores?.fused ?? 0) < e.scores.previousFused
                        ? 'down'
                        : 'flat',
        }))
    );

    function onRowClick(_e: Event, row: { item: PortfolioEntity }) {
        if (row.item.neid) emit('open', row.item);
    }
</script>

<style scoped>
    .portfolio-table :deep(tbody tr) {
        cursor: pointer;
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
