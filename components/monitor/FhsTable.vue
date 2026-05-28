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
                <v-chip
                    v-if="item.scores?.solvency != null"
                    :color="scoreLabelColor(item.scores.solvency)"
                    size="small"
                    label
                    >{{ tierLabel(scoreToLabel(item.scores.solvency)) }}</v-chip
                >
                <span v-else>—</span>
            </template>
            <template #item.eventPressure="{ item }">
                <v-chip
                    v-if="item.scores?.eventPressure != null"
                    :color="scoreLabelColor(item.scores.eventPressure)"
                    size="small"
                    label
                    >{{ tierLabel(scoreToLabel(item.scores.eventPressure)) }}</v-chip
                >
                <span v-else>—</span>
            </template>
            <template #item.fused="{ item }">
                <v-chip
                    v-if="item.scores?.fused != null"
                    :color="scoreLabelColor(item.scores.fused)"
                    size="small"
                    label
                    >{{ tierLabel(scoreToLabel(item.scores.fused)) }}</v-chip
                >
                <span v-else>—</span>
            </template>
        </v-data-table>
    </v-card>
</template>

<script setup lang="ts">
    import type { PortfolioEntity } from '~/composables/usePortfolio';
    import { scoreToLabel, scoreLabelColor, tierLabel } from '~/composables/useFusedScoring';

    const props = defineProps<{ entities: PortfolioEntity[]; loading?: boolean }>();

    const headers = [
        { title: 'Entity', key: 'name' },
        { title: 'FHS score', key: 'score', align: 'end' as const },
        { title: 'Event pressure', key: 'eventPressure', align: 'end' as const },
        { title: 'Fused', key: 'fused', align: 'end' as const },
    ];
    const rows = computed(() => props.entities);
</script>
