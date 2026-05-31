<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-4 page-header">
            <PageHeader title="Relationships" icon="mdi-graph-outline" />
            <div v-if="active" class="d-flex align-center mt-1" style="gap: 8px">
                <span class="text-caption text-medium-emphasis">
                    What hidden exposures connect this customer's portfolios?
                </span>
                <v-chip v-if="galaxyEnabled" size="x-small" color="success" variant="tonal">
                    <v-icon start size="10">mdi-lightning-bolt</v-icon>
                    Galaxy
                </v-chip>
                <v-chip v-else-if="!loading" size="x-small" variant="tonal">Elemental</v-chip>
                <HelpTooltip
                    title="Source: Elemental relationship graph"
                    text="Every link in this graph — companies, officers, instruments, locations — comes from Elemental's knowledge graph. No local data is stored. Click 'Data sources' in the sidebar to learn more."
                    :size="13"
                    location="right"
                />
            </div>
        </div>

        <div class="flex-grow-1 overflow-y-auto pa-4">
            <!-- Pre-analysis empty state -->
            <div
                v-if="!hasAnyScored && !loading"
                class="d-flex flex-column align-center justify-center"
                style="min-height: 260px; gap: 16px"
            >
                <v-icon size="56" color="medium-emphasis">mdi-graph-outline</v-icon>
                <div class="text-center">
                    <p class="text-subtitle-1 font-weight-medium mb-1">
                        Analyze your holdings to build the connected universe
                    </p>
                    <p class="text-body-2 text-medium-emphasis mb-3">
                        Elemental resolves entities, maps relationships, and surfaces
                        cross-portfolio connections.
                    </p>
                    <v-btn
                        color="primary"
                        variant="tonal"
                        prepend-icon="mdi-play-circle-outline"
                        @click="scanActiveUserPortfolios({ force: false })"
                    >
                        Analyze all goals
                    </v-btn>
                </div>
            </div>

            <v-alert
                v-if="error"
                type="error"
                variant="tonal"
                density="compact"
                class="mb-3"
                :text="error"
                closable
            />
            <v-card v-if="hasAnyScored || loading">
                <!-- Post-analysis insight summary -->
                <div
                    v-if="hasAnyScored && !loading"
                    class="pa-3 pb-0 d-flex align-center flex-wrap"
                    style="gap: 16px"
                >
                    <v-chip size="small" variant="tonal" color="primary" prepend-icon="mdi-graph">
                        {{ graph.nodes.length }} nodes in graph
                    </v-chip>
                    <v-chip
                        v-if="companyCount > 0"
                        size="small"
                        variant="tonal"
                        color="secondary"
                        prepend-icon="mdi-domain"
                    >
                        {{ companyCount }} companies
                    </v-chip>
                    <v-chip
                        v-if="locationCount > 0"
                        size="small"
                        variant="tonal"
                        color="info"
                        prepend-icon="mdi-map-marker-outline"
                    >
                        {{ locationCount }} locations
                    </v-chip>
                    <v-chip
                        v-if="topConnectedName"
                        size="small"
                        variant="tonal"
                        color="warning"
                        prepend-icon="mdi-link-variant"
                    >
                        Most connected: {{ topConnectedName }}
                    </v-chip>
                </div>
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
                    <v-tab value="network">
                        <v-icon size="small" class="mr-2">mdi-graph</v-icon>
                        Network
                    </v-tab>
                </v-tabs>

                <v-divider />

                <!-- Search bar for non-network tabs -->
                <div v-if="tab !== 'network'" class="px-4 pt-3 pb-2">
                    <v-row dense align="center">
                        <v-col cols="12" md="6">
                            <v-text-field
                                v-model="tableSearch"
                                density="compact"
                                hide-details
                                clearable
                                prepend-inner-icon="mdi-magnify"
                                label="Filter by name or relationship"
                            />
                        </v-col>
                    </v-row>
                </div>

                <v-window v-model="tab">
                    <!-- Companies -->
                    <v-window-item value="companies">
                        <v-data-table
                            :headers="companyHeaders"
                            :items="filteredCompanies"
                            :loading="loading"
                            density="comfortable"
                            class="rel-table"
                            :items-per-page="25"
                            :items-per-page-options="[10, 25, 50, 100]"
                            @click:row="onCompanyRowClick"
                        >
                            <template #item.connectedTo="{ item }">
                                {{ (item.connectedTo as string[]).join(', ') }}
                            </template>
                            <template #no-data>
                                <div class="text-caption text-medium-emphasis pa-4">
                                    No related companies found.
                                </div>
                            </template>
                        </v-data-table>
                    </v-window-item>

                    <!-- People -->
                    <v-window-item value="people">
                        <v-data-table
                            :headers="peopleHeaders"
                            :items="filteredPeople"
                            :loading="loading"
                            density="comfortable"
                            class="rel-table"
                            :items-per-page="25"
                            :items-per-page-options="[10, 25, 50, 100]"
                        >
                            <template #item.roles="{ item }">
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
                            <template #item.companiesServed="{ item }">
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
                            <template #item.departed="{ item }">
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

                    <!-- Financial Instruments -->
                    <v-window-item value="instruments">
                        <v-data-table
                            :headers="instrumentHeaders"
                            :items="filteredInstruments"
                            :loading="loading"
                            density="comfortable"
                            class="rel-table"
                            :items-per-page="25"
                            :items-per-page-options="[10, 25, 50, 100]"
                            @click:row="onInstrumentRowClick"
                        >
                            <template #no-data>
                                <div class="text-caption text-medium-emphasis pa-4">
                                    No related instruments found.
                                </div>
                            </template>
                        </v-data-table>
                    </v-window-item>

                    <!-- Locations -->
                    <v-window-item value="locations">
                        <v-data-table
                            :headers="locationHeaders"
                            :items="filteredLocations"
                            :loading="loading"
                            density="comfortable"
                            class="rel-table"
                            :items-per-page="25"
                            :items-per-page-options="[10, 25, 50, 100]"
                        >
                            <template #item.entitiesPresent="{ item }">
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
                    </v-window-item>

                    <!-- Network -->
                    <v-window-item value="network">
                        <div class="pa-3">
                            <RelationshipNetwork
                                :nodes="graph.nodes"
                                :edges="graph.edges"
                                :loading="loading"
                                @select-node="onSelectNode"
                            />

                            <v-card v-if="selectedNode" class="mt-3 pa-3">
                                <div class="d-flex align-center mb-2">
                                    <v-icon size="small" class="mr-2">
                                        mdi-information-outline
                                    </v-icon>
                                    <span class="text-subtitle-2">Node Detail</span>
                                    <v-spacer />
                                    <v-btn
                                        v-if="selectedNode.neid"
                                        size="x-small"
                                        variant="tonal"
                                        :to="`/entity/${selectedNode.neid}`"
                                    >
                                        View entity
                                    </v-btn>
                                </div>
                                <div class="text-body-1 font-weight-medium">
                                    {{ selectedNode.label }}
                                </div>
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
                        </div>
                    </v-window-item>
                </v-window>
            </v-card>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue';

    import { usePortfolio } from '~/composables/usePortfolio';
    import { useUser } from '~/composables/useUser';
    import { useRelationships } from '~/composables/useRelationships';
    import type { GraphNode } from '~/composables/useRelationships';

    const { activeUserId } = useUser();
    const {
        activePortfolio: active,
        scanning,
        hasAnyScored,
        scanActiveUserPortfolios,
    } = usePortfolio(activeUserId);
    const { loading, error, graph, companies, people, instruments, locations, galaxyEnabled } =
        useRelationships(active, scanning);
    const router = useRouter();

    const tab = ref('companies');
    const tableSearch = ref('');
    const selectedNode = ref<GraphNode | null>(null);

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

    function onSelectNode(n: GraphNode) {
        selectedNode.value = n;
    }

    const companyCount = computed(() => companies.value.length);
    const locationCount = computed(() => locations.value.length);
    const topConnectedName = computed(() => {
        const sorted = [...companies.value].sort(
            (a, b) => (b.relationshipCount ?? 0) - (a.relationshipCount ?? 0)
        );
        return sorted[0]?.name ?? null;
    });

    function onCompanyRowClick(_: Event, payload: { item: { raw: { neid?: string } } }) {
        const neid = payload?.item?.raw?.neid;
        if (neid) void router.push(`/entity/${neid}`);
    }

    function onInstrumentRowClick(_: Event, payload: { item: { raw: { neid?: string } } }) {
        const neid = payload?.item?.raw?.neid;
        if (neid) void router.push(`/entity/${neid}`);
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
        max-height: 520px;
    }
</style>
