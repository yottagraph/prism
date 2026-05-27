<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-4 page-header">
            <div class="d-flex align-center">
                <v-icon size="large" color="primary" class="mr-3">
                    mdi-briefcase-variant-outline
                </v-icon>

                <v-select
                    v-model="activeId"
                    :items="portfolioOptions"
                    variant="plain"
                    density="comfortable"
                    hide-details
                    class="portfolio-title-select mr-2"
                    style="max-width: 320px"
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

                <v-spacer />

                <span v-if="active" class="text-caption text-medium-emphasis mr-3">
                    <strong>{{ active.entities.length }}</strong> entities
                </span>
                <span
                    v-if="scanning"
                    class="d-inline-flex align-center text-caption text-medium-emphasis"
                >
                    <v-progress-circular
                        size="14"
                        width="2"
                        indeterminate
                        color="primary"
                        class="mr-2"
                    />
                    {{ scanStatusMessage }}
                    <span class="ml-1">({{ scanProgress.done }}/{{ scanProgress.total }})</span>
                    <span v-if="scanElapsedText" class="ml-2 font-mono"
                        >· {{ scanElapsedText }}</span
                    >
                </span>
                <span v-else-if="allResolved" class="text-caption text-success">
                    <v-icon size="x-small" class="mr-1">mdi-check-circle</v-icon>
                    All entities scored
                </span>
                <span v-else class="text-caption text-medium-emphasis">
                    <v-icon size="x-small" color="warning" class="mr-1"
                        >mdi-information-outline</v-icon
                    >
                    Run scan to resolve + score
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

            <v-expansion-panels v-if="recentScanStatus.length" variant="accordion" class="mb-3">
                <v-expansion-panel>
                    <v-expansion-panel-title>
                        <div class="d-flex align-center" style="width: 100%">
                            <v-icon size="small" class="mr-2">mdi-text-box-search-outline</v-icon>
                            <span class="text-subtitle-2">Scan details</span>
                            <v-spacer />
                            <span class="text-caption text-medium-emphasis">
                                {{ recentScanStatus.length }} latest updates
                            </span>
                        </div>
                    </v-expansion-panel-title>
                    <v-expansion-panel-text>
                        <div class="scan-status-list">
                            <div
                                v-for="(item, idx) in recentScanStatus"
                                :key="`${item.at}-${idx}`"
                                class="scan-status-row"
                            >
                                <span class="font-mono text-caption text-medium-emphasis">
                                    {{ new Date(item.at).toLocaleTimeString() }}
                                </span>
                                <v-chip
                                    size="x-small"
                                    variant="tonal"
                                    :color="
                                        item.phase === 'error'
                                            ? 'error'
                                            : item.phase === 'warning'
                                              ? 'warning'
                                              : 'info'
                                    "
                                    label
                                >
                                    {{ item.phase }}
                                </v-chip>
                                <span class="text-body-2">{{ item.message }}</span>
                            </div>
                        </div>
                    </v-expansion-panel-text>
                </v-expansion-panel>
            </v-expansion-panels>

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
                    <v-row dense>
                        <v-col cols="12">
                            <MacroContext
                                :signals="fredMacroSignals"
                                title="Macro Fundamentals"
                                source="FRED"
                            />
                        </v-col>
                        <v-col cols="12">
                            <MacroContext
                                :signals="macroSignals"
                                title="Macro Outlook"
                                source="Polymarket"
                            />
                        </v-col>
                        <v-col cols="12">
                            <v-card class="pa-3">
                                <div class="d-flex align-center">
                                    <v-icon size="small" class="mr-2">mdi-compare</v-icon>
                                    <span class="text-subtitle-2">Macro Signal Alignment</span>
                                    <v-spacer />
                                    <v-chip
                                        :color="alignmentChip.color"
                                        size="small"
                                        variant="tonal"
                                    >
                                        {{ alignmentChip.label }}
                                    </v-chip>
                                </div>
                                <div class="text-caption text-medium-emphasis mt-2">
                                    {{ alignmentChip.note }}
                                </div>
                            </v-card>
                        </v-col>
                    </v-row>
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
    import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

    import type { PortfolioEntity } from '~/composables/usePortfolio';
    import type { RiskTier } from '~/composables/useFusedScoring';
    import { usePortfolio } from '~/composables/usePortfolio';
    import { useAgentPipeline } from '~/composables/useAgentPipeline';
    import { useFredMacroContext, useMacroContext } from '~/composables/useRelationships';

    const router = useRouter();

    const {
        portfolios,
        activePortfolio: active,
        setActivePortfolio,
        scanPortfolio,
        scanning,
        scanProgress,
        scanStatusMessage,
        scanStatusHistory,
        scanStartedAt,
        scanCompletedAt,
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

    const recentScanStatus = computed(() => scanStatusHistory.value.slice(-10).reverse());
    const nowMs = ref(Date.now());
    let clockTimer: ReturnType<typeof setInterval> | null = null;

    onMounted(() => {
        clockTimer = setInterval(() => {
            nowMs.value = Date.now();
        }, 1000);
    });

    onUnmounted(() => {
        if (clockTimer) clearInterval(clockTimer);
        clockTimer = null;
    });

    const scanElapsedText = computed(() => {
        const startedAt = scanStartedAt.value;
        if (!startedAt) return null;
        const end = scanning.value ? nowMs.value : (scanCompletedAt.value ?? nowMs.value);
        const elapsedSec = Math.max(0, Math.floor((end - startedAt) / 1000));
        const minutes = Math.floor(elapsedSec / 60);
        const seconds = elapsedSec % 60;
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    });

    const { signals: macroSignals } = useMacroContext();
    const { signals: fredMacroSignals } = useFredMacroContext();

    const alignmentChip = computed(() => {
        const polyTrend = macroSignals.value[0]?.trend ?? 'flat';
        const fredTrend = fredMacroSignals.value[0]?.trend ?? 'flat';
        if (polyTrend === fredTrend) {
            return {
                label: 'Aligned',
                color: 'success',
                note: 'Market-implied probabilities and macro fundamentals are moving in the same direction.',
            };
        }
        if (polyTrend === 'flat' || fredTrend === 'flat') {
            return {
                label: 'Mixed',
                color: 'warning',
                note: 'One source is neutral while the other trends, indicating partial agreement.',
            };
        }
        return {
            label: 'Divergent',
            color: 'error',
            note: 'Polymarket outlook and FRED fundamentals are pointing in different directions.',
        };
    });

    async function onScan() {
        if (!active.value) return;
        const id = active.value.id;
        pushActivity('Dialogue Agent', active.value.name, 'Portfolio scan triggered');
        await Promise.all([
            scanPortfolio(id, { force: true }),
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

    .portfolio-title-select :deep(.v-field) {
        background: transparent;
        padding-inline: 0;
    }

    .portfolio-title-select :deep(.v-field__input) {
        font-size: 1.25rem;
        font-weight: 600;
        min-height: 32px;
        padding: 0;
    }

    .portfolio-title-select :deep(.v-field__outline) {
        display: none;
    }

    .scan-status-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .scan-status-row {
        display: grid;
        grid-template-columns: 92px 86px 1fr;
        gap: 10px;
        align-items: center;
        padding: 4px 0;
        border-bottom: 1px dashed rgba(255, 255, 255, 0.05);
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
