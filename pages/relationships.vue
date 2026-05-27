<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-4 page-header">
            <PageHeader title="Relationship Explorer" icon="mdi-graph-outline" />
            <div v-if="active" class="text-caption text-medium-emphasis mt-1">
                Connected universe of <strong>{{ active.name }}</strong> ·
                {{ active.entities.filter((e) => e.neid).length }} resolved entities ·
                {{ graph.nodes.length }} total nodes · {{ patterns.length }} cross-portfolio
                pattern(s)
            </div>
        </div>

        <div class="flex-grow-1 overflow-y-auto pa-4">
            <v-row dense>
                <v-col cols="12" lg="8">
                    <RelationshipGraph
                        :nodes="graph.nodes"
                        :edges="graph.edges"
                        @select-node="onSelectNode"
                    />
                </v-col>
                <v-col cols="12" lg="4">
                    <v-card class="pa-3 fill-height">
                        <div class="text-subtitle-2 mb-3">Cross-Portfolio Patterns</div>
                        <PatternCards :patterns="patterns" />
                    </v-card>
                </v-col>
            </v-row>

            <v-card v-if="selectedNode" class="mt-3 pa-3">
                <div class="d-flex align-center mb-2">
                    <v-icon size="small" class="mr-2">mdi-information-outline</v-icon>
                    <span class="text-subtitle-2">Node Detail</span>
                </div>
                <div class="text-body-1 font-weight-medium">{{ selectedNode.label }}</div>
                <div class="text-caption text-medium-emphasis mb-2">
                    {{ selectedNode.kind }} · connected to
                    {{ selectedNode.connectsTo.length }} portfolio entit{{
                        selectedNode.connectsTo.length === 1 ? 'y' : 'ies'
                    }}
                </div>
                <v-chip
                    v-for="nodeId in selectedNode.connectsTo"
                    :key="nodeId"
                    size="x-small"
                    variant="outlined"
                    class="mr-1 mb-1"
                >
                    {{ portfolioName(nodeId) }}
                </v-chip>
            </v-card>

            <v-card class="mt-3">
                <v-tabs v-model="tab" color="primary" align-tabs="start">
                    <v-tab value="companies">
                        <v-icon size="small" class="mr-2">mdi-domain</v-icon>
                        Companies
                        <v-chip size="x-small" class="ml-2" variant="outlined">
                            {{ companies.length }}
                        </v-chip>
                    </v-tab>
                    <v-tab value="people">
                        <v-icon size="small" class="mr-2">mdi-account</v-icon>
                        People
                        <v-chip size="x-small" class="ml-2" variant="outlined">
                            {{ people.length }}
                        </v-chip>
                    </v-tab>
                    <v-tab value="instruments">
                        <v-icon size="small" class="mr-2">mdi-bank</v-icon>
                        Financial Instruments
                        <v-chip size="x-small" class="ml-2" variant="outlined">
                            {{ instruments.length }}
                        </v-chip>
                    </v-tab>
                    <v-tab value="locations">
                        <v-icon size="small" class="mr-2">mdi-map-marker</v-icon>
                        Locations
                        <v-chip size="x-small" class="ml-2" variant="outlined">
                            {{ locations.length }}
                        </v-chip>
                    </v-tab>
                    <v-tab value="stocks">
                        <v-icon size="small" class="mr-2">mdi-chart-line</v-icon>
                        Stocks
                        <v-chip size="x-small" class="ml-2" variant="outlined">
                            {{ stocks?.tickers.length ?? 0 }}
                        </v-chip>
                    </v-tab>
                </v-tabs>
                <v-divider />
                <div v-if="tab !== 'stocks'" class="px-4 pt-3">
                    <v-row dense>
                        <v-col cols="12" md="6">
                            <v-text-field
                                v-model="tableSearch"
                                density="compact"
                                hide-details
                                clearable
                                label="Filter by name or relationship"
                            />
                        </v-col>
                        <v-col cols="12" md="6" class="d-flex justify-end">
                            <v-btn-toggle
                                v-if="tab === 'locations'"
                                v-model="locationView"
                                mandatory
                                density="comfortable"
                            >
                                <v-btn value="table" size="small">Table</v-btn>
                                <v-btn value="map" size="small">Map</v-btn>
                            </v-btn-toggle>
                        </v-col>
                    </v-row>
                </div>
                <v-window v-model="tab">
                    <v-window-item value="companies">
                        <v-data-table
                            :headers="companyHeaders"
                            :items="filteredCompanies"
                            :loading="loading"
                            density="comfortable"
                            class="rel-table"
                            @click:row="onCompanyRowClick"
                        >
                            <template v-slot:item.connectedTo="{ item }">
                                {{ (item.connectedTo as string[]).join(', ') }}
                            </template>
                            <template #no-data>
                                <div class="text-caption text-medium-emphasis pa-4">
                                    No related companies found.
                                </div>
                            </template>
                        </v-data-table>
                    </v-window-item>
                    <v-window-item value="people">
                        <v-data-table
                            :headers="peopleHeaders"
                            :items="filteredPeople"
                            :loading="loading"
                            density="comfortable"
                            class="rel-table"
                        >
                            <template v-slot:item.roles="{ item }">
                                <v-chip
                                    v-for="r in item.roles as string[]"
                                    :key="r"
                                    size="x-small"
                                    variant="tonal"
                                    class="mr-1"
                                >
                                    {{ r }}
                                </v-chip>
                            </template>
                            <template v-slot:item.companiesServed="{ item }">
                                <strong
                                    v-if="(item.companiesServed as string[]).length > 1"
                                    class="text-warning"
                                >
                                    {{ (item.companiesServed as string[]).length }}
                                </strong>
                                <span v-else>{{ (item.companiesServed as string[]).length }}</span>
                                <span class="text-caption text-medium-emphasis ml-2">
                                    {{ (item.companiesServed as string[]).join(', ') }}
                                </span>
                            </template>
                            <template v-slot:item.departed="{ item }">
                                <v-chip
                                    v-if="item.departed"
                                    color="warning"
                                    size="x-small"
                                    variant="tonal"
                                >
                                    Departed
                                </v-chip>
                                <span v-else class="text-caption text-success">Active</span>
                            </template>
                            <template #no-data>
                                <div class="text-caption text-medium-emphasis pa-4">
                                    No related people found.
                                </div>
                            </template>
                        </v-data-table>
                    </v-window-item>
                    <v-window-item value="instruments">
                        <v-data-table
                            :headers="instrumentHeaders"
                            :items="filteredInstruments"
                            :loading="loading"
                            density="comfortable"
                            class="rel-table"
                            @click:row="onInstrumentRowClick"
                        >
                            <template #no-data>
                                <div class="text-caption text-medium-emphasis pa-4">
                                    No related instruments found.
                                </div>
                            </template>
                        </v-data-table>
                    </v-window-item>
                    <v-window-item value="locations">
                        <v-data-table
                            v-if="locationView === 'table'"
                            :headers="locationHeaders"
                            :items="filteredLocations"
                            :loading="loading"
                            density="comfortable"
                            class="rel-table"
                        >
                            <template v-slot:item.entitiesPresent="{ item }">
                                <strong
                                    v-if="(item.entitiesPresent as string[]).length > 3"
                                    class="text-warning"
                                >
                                    {{ (item.entitiesPresent as string[]).length }}
                                </strong>
                                <span v-else>{{ (item.entitiesPresent as string[]).length }}</span>
                                <span class="text-caption text-medium-emphasis ml-2">
                                    {{ (item.entitiesPresent as string[]).join(', ') }}
                                </span>
                            </template>
                            <template #no-data>
                                <div class="text-caption text-medium-emphasis pa-4">
                                    No related locations found.
                                </div>
                            </template>
                        </v-data-table>
                        <v-row v-else dense class="pa-3">
                            <v-col
                                v-for="loc in filteredLocations"
                                :key="loc.name"
                                cols="12"
                                md="6"
                            >
                                <v-sheet class="pa-3 map-node">
                                    <div class="text-subtitle-2">{{ loc.name }}</div>
                                    <div class="text-caption text-medium-emphasis">
                                        {{ loc.entitiesPresent.length }} entities present
                                    </div>
                                    <div class="text-caption mt-2">
                                        {{ loc.entitiesPresent.join(', ') }}
                                    </div>
                                </v-sheet>
                            </v-col>
                        </v-row>
                    </v-window-item>
                    <v-window-item value="stocks">
                        <StocksAnalyticsTab
                            :data="stocks"
                            :loading="loading"
                            @select-ticker="onSelectTicker"
                            @select-anomaly="onSelectAnomaly"
                        />
                    </v-window-item>
                </v-window>
            </v-card>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue';

    import { usePortfolio } from '~/composables/usePortfolio';
    import { useRelationships } from '~/composables/useRelationships';
    import type { GraphNode } from '~/composables/useRelationships';

    const { activePortfolio: active } = usePortfolio();
    const { loading, graph, companies, people, instruments, locations, patterns, stocks } =
        useRelationships(active);
    const router = useRouter();

    const tab = ref('companies');
    const locationView = ref<'table' | 'map'>('table');
    const tableSearch = ref('');

    const companyHeaders = [
        { title: 'Name', key: 'name', sortable: true },
        { title: 'Connection', key: 'connectionType' },
        { title: 'Connected to', key: 'connectedTo' },
        { title: 'Count', key: 'relationshipCount', align: 'end' as const },
    ];
    const peopleHeaders = [
        { title: 'Name', key: 'name', sortable: true },
        { title: 'Roles', key: 'roles' },
        { title: 'Companies served', key: 'companiesServed' },
        { title: 'Tenure', key: 'tenure' },
        { title: 'Status', key: 'departed' },
    ];
    const instrumentHeaders = [
        { title: 'Instrument', key: 'name' },
        { title: 'Type', key: 'type' },
        { title: 'Issuer', key: 'issuer' },
        { title: 'Amount', key: 'amount', align: 'end' as const },
        { title: 'Maturity', key: 'maturity' },
        { title: 'Lender', key: 'lender' },
    ];
    const locationHeaders = [
        { title: 'Location', key: 'name' },
        { title: 'Entities present', key: 'entitiesPresent' },
    ];

    const selectedNode = ref<GraphNode | null>(null);
    function onSelectNode(n: GraphNode) {
        selectedNode.value = n;
    }

    function onCompanyRowClick(_: Event, payload: { item: { raw: { neid?: string } } }) {
        const neid = payload?.item?.raw?.neid;
        if (neid) void router.push(`/entity/${neid}`);
    }

    function onInstrumentRowClick(_: Event, payload: { item: { raw: { neid?: string } } }) {
        const neid = payload?.item?.raw?.neid;
        if (neid) void router.push(`/entity/${neid}`);
    }

    function onSelectTicker(item: { neid: string }) {
        if (item.neid) void router.push(`/entity/${item.neid}`);
    }

    function onSelectAnomaly(item: { neid: string }) {
        if (item.neid) void router.push(`/entity/${item.neid}`);
    }

    function portfolioName(nodeId: string) {
        if (!active.value) return nodeId;
        const neid = nodeId.startsWith('p-') ? nodeId.slice(2) : nodeId;
        return active.value.entities.find((entity) => entity.neid === neid)?.resolvedName ?? nodeId;
    }

    const filteredCompanies = computed(() =>
        companies.value.filter((row) =>
            `${row.name} ${row.connectionType} ${(row.connectedTo || []).join(' ')}`
                .toLowerCase()
                .includes(tableSearch.value.toLowerCase())
        )
    );
    const filteredPeople = computed(() =>
        people.value.filter((row) =>
            `${row.name} ${(row.roles || []).join(' ')} ${(row.companiesServed || []).join(' ')}`
                .toLowerCase()
                .includes(tableSearch.value.toLowerCase())
        )
    );
    const filteredInstruments = computed(() =>
        instruments.value.filter((row) =>
            `${row.name} ${row.type} ${row.issuer} ${row.lender}`
                .toLowerCase()
                .includes(tableSearch.value.toLowerCase())
        )
    );
    const filteredLocations = computed(() =>
        locations.value.filter((row) =>
            `${row.name} ${(row.entitiesPresent || []).join(' ')}`
                .toLowerCase()
                .includes(tableSearch.value.toLowerCase())
        )
    );
</script>

<style scoped>
    .page-header {
        border-bottom: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
        background: rgba(var(--dynamic-bg-rgb), 0.3);
    }

    .rel-table :deep(.v-data-table__wrapper) {
        max-height: 420px;
    }

    .map-node {
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.08);
        border-radius: 10px;
        background: rgba(var(--dynamic-fg-rgb), 0.02);
    }
</style>
