<template>
    <v-card>
        <v-data-table
            :headers="headers"
            :items="entities"
            :loading="loading"
            density="comfortable"
            hover
        >
            <template #item.name="{ item }">
                <div class="font-weight-medium">{{ item.resolvedName }}</div>
                <div class="text-caption text-medium-emphasis">{{ item.neid || '—' }}</div>
            </template>
            <template #item.acs="{ item }">
                <v-chip
                    v-if="item.scores?.compliance != null"
                    :color="scoreLabelColor(item.scores.compliance)"
                    size="small"
                    label
                    >{{ tierLabel(scoreToLabel(item.scores.compliance)) }}</v-chip
                >
                <span v-else>—</span>
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
                        >View source listing</a
                    >
                </template>
                <span v-else class="text-medium-emphasis">Clear</span>
            </template>
            <template #item.foci="{ item }">
                {{ item.monitor?.polymarketOutlook || '—' }}
            </template>
        </v-data-table>
    </v-card>
</template>

<script setup lang="ts">
    import type { PortfolioEntity } from '~/composables/usePortfolio';
    import { scoreToLabel, scoreLabelColor, tierLabel } from '~/composables/useFusedScoring';

    defineProps<{ entities: PortfolioEntity[]; loading?: boolean }>();
    const headers = [
        { title: 'Entity', key: 'name' },
        { title: 'ACS score', key: 'acs', align: 'end' as const },
        { title: 'Sanctions', key: 'sanctions' },
        { title: 'FOCI / outlook', key: 'foci' },
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
</script>
