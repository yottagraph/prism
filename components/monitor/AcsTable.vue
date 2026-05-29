<template>
    <v-card>
        <v-data-table
            :headers="headers"
            :items="entities"
            :loading="loading"
            density="comfortable"
            hover
            @click:row="(_e: Event, { item }: { item: PortfolioEntity }) => emit('open', item)"
        >
            <template #item.name="{ item }">
                <div class="font-weight-medium cursor-pointer">{{ item.resolvedName }}</div>
                <div class="text-caption text-medium-emphasis">{{ item.neid || '—' }}</div>
            </template>

            <template #item.acsScore="{ item }">
                <v-chip
                    v-if="item.scores?.compliance != null"
                    :color="scoreLabelColor(item.scores.compliance)"
                    size="small"
                    label
                    >{{ tierLabel(scoreToLabel(item.scores.compliance)) }}</v-chip
                >
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.sanctions="{ item }">
                <template v-if="item.monitor?.sanctions?.listed">
                    <v-chip color="error" size="small" label class="font-weight-bold">
                        <v-icon start size="small">mdi-alert-octagon</v-icon>LISTED
                    </v-chip>
                    <div class="text-caption mt-1">{{ sanctionsLine(item.monitor.sanctions) }}</div>
                    <a
                        v-if="item.monitor.sanctions.url"
                        :href="item.monitor.sanctions.url"
                        target="_blank"
                        rel="noopener"
                        class="text-caption text-primary"
                        >View listing</a
                    >
                </template>
                <span v-else class="text-medium-emphasis">Clear</span>
            </template>

            <template #item.ownershipExposure="{ item }">
                <template v-if="item.monitor?.acsDetail">
                    <span class="text-body-2">
                        {{ item.monitor.acsDetail.graphNodesScreened }} nodes
                    </span>
                    <span class="text-caption text-medium-emphasis ml-1">
                        ({{ item.monitor.acsDetail.directMatchCount }} direct,
                        {{ item.monitor.acsDetail.pathMatchCount }} path)
                    </span>
                </template>
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.foci="{ item }">
                <template v-if="item.monitor?.acsDetail?.foci">
                    <v-chip
                        :color="riskColor(item.monitor.acsDetail.foci.overallRisk)"
                        size="x-small"
                        label
                        variant="tonal"
                        class="mr-1"
                    >
                        {{ item.monitor.acsDetail.foci.overallRisk }}
                    </v-chip>
                    <span class="text-caption text-medium-emphasis">
                        {{ item.monitor.acsDetail.foci.foreignOwnershipPct.toFixed(1) }}% foreign
                        own.
                    </span>
                </template>
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.jurisdictions="{ item }">
                <template v-if="item.monitor?.acsDetail?.jurisdictionHits?.length">
                    <v-chip
                        v-for="hit in item.monitor.acsDetail.jurisdictionHits.slice(0, 3)"
                        :key="hit.name"
                        size="x-small"
                        :color="hit.tier === 1 ? 'error' : 'warning'"
                        label
                        variant="tonal"
                        class="mr-1 mb-1"
                    >
                        {{ hit.jurisdiction || hit.name }}
                    </v-chip>
                </template>
                <span v-else class="text-medium-emphasis text-body-2">None flagged</span>
            </template>

            <template #item.polymarketFoci="{ item }">
                {{ item.monitor?.polymarketOutlook || '—' }}
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

    defineProps<{ entities: PortfolioEntity[]; loading?: boolean }>();
    const emit = defineEmits<{ open: [entity: PortfolioEntity] }>();

    const headers = [
        { title: 'Entity', key: 'name', sortable: true },
        { title: 'ACS', key: 'acsScore', sortable: false, width: 100 },
        { title: 'Sanctions', key: 'sanctions', sortable: false, width: 180 },
        { title: 'Ownership graph', key: 'ownershipExposure', sortable: false, width: 200 },
        { title: 'FOCI', key: 'foci', sortable: false, width: 200 },
        { title: 'High-risk jurisdictions', key: 'jurisdictions', sortable: false, width: 220 },
        { title: 'Polymarket outlook', key: 'polymarketFoci', sortable: false, width: 140 },
        { title: '', key: 'actions', sortable: false, width: 40 },
    ];

    type SanctionsInfo = NonNullable<NonNullable<PortfolioEntity['monitor']>['sanctions']>;

    function sanctionsLine(s: SanctionsInfo): string {
        const parts: string[] = [];
        parts.push(s.authority ? `Listed by ${s.authority}` : 'On a screening list');
        if (s.sector) parts.push(`${s.sector} sector`);
        if (s.since) parts.push(`since ${s.since}`);
        if (s.listId) parts.push(`ref ${s.listId}`);
        return parts.join(' · ');
    }

    function riskColor(level: string) {
        switch (level) {
            case 'critical':
                return 'error';
            case 'high':
                return 'warning';
            case 'medium':
                return 'info';
            default:
                return 'success';
        }
    }
</script>
