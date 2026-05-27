<template>
    <v-card>
        <v-data-table
            :headers="headers"
            :items="rows"
            :loading="loading"
            density="comfortable"
            hover
        >
            <template #item.name="{ item }">
                <div class="font-weight-medium">{{ item.resolvedName }}</div>
                <div class="text-caption text-medium-emphasis">{{ item.neid || '—' }}</div>
            </template>
            <template #item.score="{ item }">
                <span class="font-mono">{{ item.scores?.solvency ?? '—' }}</span>
            </template>
            <template #item.eventPressure="{ item }">
                <span class="font-mono">{{ item.scores?.eventPressure ?? '—' }}</span>
            </template>
            <template #item.fused="{ item }">
                <span class="font-mono">{{ item.scores?.fused ?? '—' }}</span>
            </template>
        </v-data-table>
    </v-card>
</template>

<script setup lang="ts">
    import type { PortfolioEntity } from '~/composables/usePortfolio';

    const props = defineProps<{ entities: PortfolioEntity[]; loading?: boolean }>();

    const headers = [
        { title: 'Entity', key: 'name' },
        { title: 'FHS score', key: 'score', align: 'end' as const },
        { title: 'Event pressure', key: 'eventPressure', align: 'end' as const },
        { title: 'Fused', key: 'fused', align: 'end' as const },
    ];
    const rows = computed(() => props.entities);
</script>
