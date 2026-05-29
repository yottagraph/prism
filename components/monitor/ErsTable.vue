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

            <template #item.ersScore="{ item }">
                <v-chip
                    v-if="item.scores?.executive != null"
                    :color="scoreLabelColor(item.scores.executive)"
                    size="small"
                    label
                    >{{ tierLabel(scoreToLabel(item.scores.executive)) }}</v-chip
                >
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.departures="{ item }">
                <template v-if="item.monitor?.ers">
                    <span class="font-mono text-body-2">
                        {{ item.monitor.ers.departures12m }}
                    </span>
                    <span class="text-caption text-medium-emphasis ml-1">
                        ({{ item.monitor.ers.departures90d }} in 90d)
                    </span>
                </template>
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.leadership="{ item }">
                <template v-if="item.monitor?.ers">
                    <span class="text-body-2">
                        {{ item.monitor.ers.officerCount }} officers ·
                        {{ item.monitor.ers.cSuiteCount }} C-suite
                    </span>
                </template>
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.governanceFlags="{ item }">
                <template v-if="item.monitor?.ers?.governanceFlags?.length">
                    <v-chip
                        v-for="flag in item.monitor.ers.governanceFlags.slice(0, 2)"
                        :key="flag"
                        size="x-small"
                        label
                        color="warning"
                        variant="tonal"
                        class="mr-1 mb-1"
                    >
                        {{ flag }}
                    </v-chip>
                    <span
                        v-if="item.monitor.ers.governanceFlags.length > 2"
                        class="text-caption text-medium-emphasis"
                    >
                        +{{ item.monitor.ers.governanceFlags.length - 2 }} more
                    </span>
                </template>
                <span v-else class="text-medium-emphasis text-body-2">None</span>
            </template>

            <template #item.auditor="{ item }">
                <template v-if="item.monitor?.ers?.auditorChanges12m">
                    <v-chip size="x-small" color="warning" label>
                        {{ item.monitor.ers.auditorChanges12m }}
                    </v-chip>
                </template>
                <span v-else class="text-medium-emphasis">Clear</span>
            </template>

            <template #item.keyPersonRisk="{ item }">
                <v-chip
                    v-if="item.monitor?.ers?.keyPersonRisk"
                    :color="riskColor(item.monitor.ers.keyPersonRisk)"
                    size="x-small"
                    label
                    variant="tonal"
                >
                    {{ item.monitor.ers.keyPersonRisk }}
                </v-chip>
                <span v-else class="text-medium-emphasis">—</span>
            </template>

            <template #item.signalAlignment="{ item }">
                {{ item.monitor?.signalAgreement || '—' }}
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
        { title: 'ERS', key: 'ersScore', sortable: false, width: 100 },
        { title: 'Departures (12m)', key: 'departures', sortable: false, width: 160 },
        { title: 'Leadership', key: 'leadership', sortable: false, width: 170 },
        { title: 'Governance flags', key: 'governanceFlags', sortable: false, width: 220 },
        { title: 'Auditor changes', key: 'auditor', sortable: false, width: 140 },
        { title: 'Key person', key: 'keyPersonRisk', sortable: false, width: 120 },
        { title: 'Signal alignment', key: 'signalAlignment', sortable: false, width: 140 },
        { title: '', key: 'actions', sortable: false, width: 40 },
    ];

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
