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
        { title: 'FOCI / outlook', key: 'foci' },
    ];
</script>
