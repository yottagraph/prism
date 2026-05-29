<template>
    <v-card class="pa-4 mb-3">
        <div class="text-subtitle-2 mb-3">Entity Profile</div>
        <v-row dense>
            <v-col v-for="field in fields" :key="field.label" cols="6" sm="4">
                <div class="text-caption text-medium-emphasis text-uppercase">
                    {{ field.label }}
                </div>
                <div class="text-body-2 font-weight-medium mt-1">{{ field.value || '—' }}</div>
            </v-col>
        </v-row>
        <v-divider v-if="statusSummary" class="my-3" />
        <div v-if="statusSummary" class="text-body-2 text-medium-emphasis">
            <v-icon size="small" :color="statusColor" class="mr-1">{{ statusIcon }}</v-icon>
            {{ statusSummary }}
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { tierColor } from '~/composables/useFusedScoring';
    import type { EntityProfileData } from '~/composables/useEntityProfile';

    const props = defineProps<{
        data: EntityProfileData;
    }>();

    const fields = computed(() => {
        const d = props.data;
        const descriptive = (d as any).descriptive ?? {};
        return [
            { label: 'Ticker', value: d.ticker },
            { label: 'CIK', value: d.cik },
            { label: 'Sector', value: d.sector },
            { label: 'Type', value: d.entityType },
            { label: 'Headquarters', value: descriptive.headquarters ?? null },
            { label: 'Founded', value: descriptive.founded ?? null },
            {
                label: 'Employees',
                value: descriptive.employees
                    ? Number(descriptive.employees).toLocaleString()
                    : null,
            },
            { label: 'Market cap', value: descriptive.marketCap ?? null },
        ].filter((f) => f.value);
    });

    const statusSummary = computed(() => (props.data as any).statusSummary ?? null);

    const statusColor = computed(() => {
        const tier = props.data.scores?.tier;
        return tier ? tierColor(tier) : 'default';
    });

    const statusIcon = computed(() => {
        const tier = props.data.scores?.tier;
        switch (tier) {
            case 'critical':
                return 'mdi-alert-octagon';
            case 'high':
                return 'mdi-alert';
            case 'medium':
                return 'mdi-information';
            default:
                return 'mdi-check-circle';
        }
    });
</script>
