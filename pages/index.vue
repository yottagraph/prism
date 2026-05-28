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

            <v-row dense class="mb-3 align-stretch">
                <v-col cols="12" md="3" class="d-flex flex-column ga-3">
                    <SourceFusionBar
                        :total="active?.entities.length ?? 0"
                        :coverage="coverage"
                        :coverage-detail="coverageDetail"
                        :scanning="scanning"
                    />
                    <RiskDistribution :counts="tierCounts" :scanning="scanning" />
                </v-col>
                <v-col cols="12" md="9" class="d-flex flex-column">
                    <MacroPanel class="flex-grow-1" />
                </v-col>
            </v-row>

            <v-tabs v-model="monitorTab" class="mb-3">
                <v-tab value="monitor">Monitor</v-tab>
                <v-tab value="fhs">FHS</v-tab>
                <v-tab value="ers">ERS</v-tab>
                <v-tab value="acs">ACS</v-tab>
            </v-tabs>
            <v-window v-model="monitorTab">
                <v-window-item value="monitor">
                    <MonitorTable
                        v-if="active"
                        :entities="sortedEntities"
                        :loading="scanning"
                        @open="goToEntity"
                        @assess="onAssess"
                    />
                </v-window-item>
                <v-window-item value="fhs">
                    <FhsTable v-if="active" :entities="sortedEntities" :loading="scanning" />
                </v-window-item>
                <v-window-item value="ers">
                    <ErsTable v-if="active" :entities="sortedEntities" :loading="scanning" />
                </v-window-item>
                <v-window-item value="acs">
                    <AcsTable v-if="active" :entities="sortedEntities" :loading="scanning" />
                </v-window-item>
            </v-window>

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

    import type { PortfolioEntity, PortfolioCoverageDetail } from '~/composables/usePortfolio';
    import type { RiskTier } from '~/composables/useFusedScoring';
    import { usePortfolio } from '~/composables/usePortfolio';
    import { useAgentPipeline } from '~/composables/useAgentPipeline';

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
        lastScanCoverageDetail,
        createPortfolio,
        saveAssessment,
    } = usePortfolio();

    const { runPipeline, activity, pushActivity } = useAgentPipeline();

    const lastScanError = ref('');
    const monitorTab = ref<'monitor' | 'fhs' | 'ers' | 'acs'>('monitor');
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
            medium: 0,
            low: 0,
        };
        active.value?.entities.forEach((e) => {
            if (e.scores?.tier) counts[e.scores.tier]++;
        });
        return counts;
    });

    const coverage = computed(() => {
        if (!active.value) return { sec: 0, news: 0, stock: 0, poly: 0 };
        const counts = { sec: 0, news: 0, stock: 0, poly: 0 };
        let anyPerEntityCoverage = false;
        for (const entity of active.value.entities) {
            if (!entity.coverage) continue;
            anyPerEntityCoverage = true;
            if (entity.coverage.sec) counts.sec++;
            if (entity.coverage.news) counts.news++;
            if (entity.coverage.stock) counts.stock++;
            if (entity.coverage.poly) counts.poly++;
        }
        // Per-entity coverage is the source of truth. Fall back to the scan-summary
        // block only when no entity has streamed coverage yet (e.g. a freshly loaded
        // portfolio with cached scores but no coverage payload).
        if (
            !anyPerEntityCoverage &&
            lastScanCoverage.value.poly +
                lastScanCoverage.value.sec +
                lastScanCoverage.value.news +
                lastScanCoverage.value.stock >
                0
        ) {
            return lastScanCoverage.value;
        }
        return counts;
    });

    function minDate(a: string | null, b: string | null): string | null {
        if (!a) return b;
        if (!b) return a;
        return a < b ? a : b;
    }
    function maxDate(a: string | null, b: string | null): string | null {
        if (!a) return b;
        if (!b) return a;
        return a > b ? a : b;
    }

    const coverageDetail = computed<PortfolioCoverageDetail>(() => {
        const empty: PortfolioCoverageDetail = {
            sec: { entities: 0, filings: 0, earliest: null, latest: null },
            news: { entities: 0, articles: 0, events: 0, earliest: null, latest: null },
            stock: { entities: 0, readings: 0, earliest: null, latest: null },
            poly: { entities: 0, markets: 0, active: 0 },
            fred: { entities: 0, series: 0, earliest: null, latest: null },
            acs: 0,
            eventPressure: 0,
            velocity: 0,
        };
        if (!active.value) return empty;

        let anyDetail = false;
        const agg = structuredClone(empty);

        for (const entity of active.value.entities) {
            const cd = entity.coverageDetail;
            if (!cd) continue;
            anyDetail = true;

            const cov = entity.coverage;
            if (cd.sec.filings > 0 || cov?.sec) {
                agg.sec.entities++;
                agg.sec.filings += cd.sec.filings;
                agg.sec.earliest = minDate(agg.sec.earliest, cd.sec.earliest);
                agg.sec.latest = maxDate(agg.sec.latest, cd.sec.latest);
            }
            if (cd.news.articles > 0 || cd.news.events > 0 || cov?.news) {
                agg.news.entities++;
                agg.news.articles += cd.news.articles;
                agg.news.events += cd.news.events;
                agg.news.earliest = minDate(agg.news.earliest, cd.news.earliest);
                agg.news.latest = maxDate(agg.news.latest, cd.news.latest);
            }
            if (cd.stock.readings > 0 || cov?.stock) {
                agg.stock.entities++;
                agg.stock.readings += cd.stock.readings;
                agg.stock.earliest = minDate(agg.stock.earliest, cd.stock.earliest);
                agg.stock.latest = maxDate(agg.stock.latest, cd.stock.latest);
            }
            if (cd.poly.markets > 0) {
                agg.poly.entities++;
                agg.poly.markets += cd.poly.markets;
                agg.poly.active += cd.poly.active;
            }
            if (cd.fred.series > 0) {
                agg.fred.entities++;
                agg.fred.series += cd.fred.series;
                agg.fred.earliest = minDate(agg.fred.earliest, cd.fred.earliest);
                agg.fred.latest = maxDate(agg.fred.latest, cd.fred.latest);
            }
            if (cd.acs) agg.acs++;
            if (cd.eventPressure) agg.eventPressure++;
            if (cd.velocity) agg.velocity++;
        }

        if (!anyDetail) return lastScanCoverageDetail.value;
        return agg;
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

    function onAssess(entityRow: any, tier: 'HIGH' | 'MEDIUM' | 'LOW' | 'IGNORE' | null) {
        if (!active.value?.id || !entityRow?.entity?.neid || !tier) return;
        const mapped: RiskTier = tier === 'HIGH' ? 'high' : tier === 'MEDIUM' ? 'medium' : 'low';
        saveAssessment(active.value.id, entityRow.entity.neid, mapped, '');
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
        border-bottom: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
        background: rgba(var(--dynamic-bg-rgb), 0.3);
    }

    .portfolio-title-select :deep(.v-field) {
        background: transparent;
        padding-inline: 0;
    }

    .portfolio-title-select :deep(.v-field__input) {
        font-family: var(--font-primary);
        font-size: var(--type-h1-size);
        font-weight: var(--type-h1-weight);
        letter-spacing: var(--type-h1-tracking);
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
        border-bottom: 1px dashed rgba(var(--dynamic-fg-rgb), 0.05);
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
