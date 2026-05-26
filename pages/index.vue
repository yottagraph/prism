<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-4 page-header">
            <PageHeader title="Portfolio Overview" icon="mdi-briefcase-variant-outline" class="mb-2">
                <template #actions>
                    <v-select
                        v-model="activeId"
                        :items="portfolioOptions"
                        label="Portfolio"
                        density="comfortable"
                        hide-details
                        style="max-width: 280px"
                        class="mr-3"
                    />
                    <v-btn
                        color="primary"
                        :loading="scanning"
                        :disabled="!active"
                        prepend-icon="mdi-play-circle-outline"
                        @click="onScan"
                    >
                        {{ allResolved ? 'Re-scan' : 'Run scan' }}
                    </v-btn>
                    <v-btn
                        icon="mdi-plus"
                        variant="text"
                        class="ml-1"
                        @click="newPortfolioOpen = true"
                    />
                </template>
            </PageHeader>
            <div v-if="active" class="d-flex align-center text-caption text-medium-emphasis">
                <span>{{ active.description }}</span>
                <v-spacer />
                <span class="mr-3">
                    <strong>{{ active.entities.length }}</strong> entities
                </span>
                <span v-if="scanning">
                    Scanning {{ scanProgress.done }}/{{ scanProgress.total }}…
                </span>
                <span v-else-if="allResolved" class="text-success">
                    <v-icon size="x-small" class="mr-1">mdi-check-circle</v-icon>
                    All entities scored
                </span>
                <span v-else>
                    <v-icon size="x-small" color="warning" class="mr-1"
                        >mdi-information-outline</v-icon
                    >
                    Click "Run scan" to resolve + score
                </span>
            </div>
        </div>

        <div class="flex-grow-1 overflow-y-auto pa-4 pt-0">
            <v-alert
                v-if="lastScanError"
                type="warning"
                variant="tonal"
                closable
                class="mb-3"
                @click:close="lastScanError = ''"
            >
                Scan completed with errors: {{ lastScanError }}
            </v-alert>

            <SourceFusionBar
                :total="active?.entities.length ?? 0"
                :coverage="coverage"
                class="mb-3"
            />

            <v-row dense class="mb-3">
                <v-col cols="12" md="6">
                    <RiskDistribution :counts="tierCounts" />
                </v-col>
                <v-col cols="12" md="6">
                    <MacroContext :signals="macroSignals" />
                </v-col>
            </v-row>

            <PortfolioTable
                v-if="active"
                :entities="sortedEntities"
                :loading="scanning"
                @open="goToEntity"
            />

            <AgentActivityFeed :entries="activity" class="mt-3" />
        </div>

        <v-dialog v-model="newPortfolioOpen" max-width="540">
            <v-card class="pa-4">
                <div class="text-h6 mb-3">New portfolio</div>
                <v-text-field
                    v-model="newName"
                    label="Portfolio name"
                    density="comfortable"
                    autofocus
                />
                <v-textarea
                    v-model="newEntities"
                    label="Entity names (one per line)"
                    rows="8"
                    density="comfortable"
                    placeholder="Ford Motor Company&#10;General Motors&#10;..."
                />
                <div class="d-flex justify-end mt-3">
                    <v-btn variant="text" @click="newPortfolioOpen = false">Cancel</v-btn>
                    <v-btn color="primary" :disabled="!newName.trim()" @click="createNew">
                        Create
                    </v-btn>
                </div>
            </v-card>
        </v-dialog>
    </div>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue';

    import type { PortfolioEntity } from '~/composables/usePortfolio';
    import type { RiskTier } from '~/composables/useFusedScoring';
    import { usePortfolio } from '~/composables/usePortfolio';
    import { useAgentPipeline } from '~/composables/useAgentPipeline';
    import { useMacroContext } from '~/composables/useRelationships';

    const router = useRouter();

    const {
        portfolios,
        activePortfolio: active,
        setActivePortfolio,
        scanPortfolio,
        scanning,
        scanProgress,
        lastScanError: scanError,
        lastScanCoverage,
        createPortfolio,
    } = usePortfolio();

    const { runPipeline, activity, pushActivity } = useAgentPipeline();

    const lastScanError = ref('');
    watch(scanError, (e) => {
        if (e) lastScanError.value = e;
    });

    const portfolioOptions = computed(() =>
        portfolios.value.map((p) => ({ title: p.name, value: p.id }))
    );

    const activeId = computed({
        get: () => active.value?.id ?? null,
        set: (v) => {
            if (v) setActivePortfolio(v);
        },
    });

    const sortedEntities = computed(() => {
        if (!active.value) return [];
        return [...active.value.entities].sort(
            (a, b) => (b.scores?.fused ?? -1) - (a.scores?.fused ?? -1)
        );
    });

    const allResolved = computed(
        () => !!active.value && active.value.entities.every((e) => e.scores && e.neid)
    );

    const tierCounts = computed<Record<RiskTier, number>>(() => {
        const counts: Record<RiskTier, number> = {
            critical: 0,
            high: 0,
            watch: 0,
            normal: 0,
        };
        active.value?.entities.forEach((e) => {
            if (e.scores?.tier) counts[e.scores.tier]++;
        });
        return counts;
    });

    const coverage = computed(() => {
        if (!active.value) return { sec: 0, news: 0, stock: 0, poly: 0 };
        if (lastScanCoverage.value.poly > 0) {
            return lastScanCoverage.value;
        }
        const resolved = active.value.entities.filter((entity) => entity.neid).length;
        const scored = active.value.entities.filter((entity) => entity.scores).length;
        return {
            sec: resolved,
            news: scored,
            stock: scored,
            poly: scored > 0 ? active.value.entities.length : 0,
        };
    });

    const { signals: macroSignals } = useMacroContext();

    async function onScan() {
        if (!active.value) return;
        const id = active.value.id;
        pushActivity('Dialogue Agent', active.value.name, 'Portfolio scan triggered');
        await Promise.all([
            scanPortfolio(id),
            runPipeline({ trigger: active.value.name, entityCount: active.value.entities.length }),
        ]);
    }

    function goToEntity(entity: PortfolioEntity) {
        if (!entity.neid) return;
        router.push(`/entity/${entity.neid}`);
    }

    const newPortfolioOpen = ref(false);
    const newName = ref('');
    const newEntities = ref('');

    function createNew() {
        const lines = newEntities.value
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
        createPortfolio(newName.value.trim(), lines);
        newName.value = '';
        newEntities.value = '';
        newPortfolioOpen.value = false;
    }
</script>

<style scoped>
    .page-header {
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(0, 0, 0, 0.3);
    }
</style>
