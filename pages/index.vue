<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-4 page-header">
            <div class="d-flex align-center flex-wrap" style="gap: 4px 0">
                <!-- User switcher -->
                <v-select
                    v-model="activeUserIdModel"
                    :items="userOptions"
                    variant="plain"
                    density="compact"
                    hide-details
                    prepend-inner-icon="mdi-account-circle-outline"
                    style="max-width: 180px"
                    class="mr-1"
                />
                <v-btn
                    icon="mdi-pencil-outline"
                    variant="text"
                    size="small"
                    aria-label="Edit profile"
                    @click="onboardingOpen = true"
                />

                <v-divider vertical class="mx-2" style="height: 28px; align-self: center" />

                <v-icon size="large" color="primary" class="mr-2">
                    mdi-briefcase-variant-outline
                </v-icon>

                <v-select
                    v-model="activeId"
                    :items="portfolioOptions"
                    variant="plain"
                    density="comfortable"
                    hide-details
                    class="portfolio-title-select mr-1"
                    style="max-width: 260px"
                />

                <!-- Goal metadata chip + edit button -->
                <template v-if="active">
                    <v-chip
                        v-if="active.goal"
                        size="small"
                        variant="tonal"
                        color="primary"
                        class="mr-1"
                        prepend-icon="mdi-target"
                        @click="goalEditorOpen = true"
                    >
                        {{ active.goal.purpose }} · {{ active.goal.horizonYears }}y
                    </v-chip>
                    <v-btn
                        v-else
                        icon="mdi-target"
                        variant="text"
                        size="small"
                        aria-label="Set goal for this bucket"
                        @click="goalEditorOpen = true"
                    />
                </template>

                <v-btn
                    color="primary"
                    :loading="scanning"
                    :disabled="!active"
                    prepend-icon="mdi-play-circle-outline"
                    @click="onScan"
                >
                    {{ allResolved ? 'Re-analyze' : 'Analyze' }}
                </v-btn>
                <v-btn
                    icon="mdi-plus"
                    variant="text"
                    class="ml-1"
                    aria-label="Create new goal bucket"
                    @click="newPortfolioOpen = true"
                />
                <v-btn
                    icon="mdi-account-multiple-plus-outline"
                    variant="text"
                    class="ml-1"
                    aria-label="Add holdings to bucket"
                    :disabled="!active"
                    @click="addEntitiesOpen = true"
                />

                <v-spacer />

                <span v-if="active" class="text-caption text-medium-emphasis mr-3">
                    <strong>{{ active.entities.length }}</strong> holding{{
                        active.entities.length !== 1 ? 's' : ''
                    }}
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
                    All holdings analyzed
                </span>
                <span v-else class="text-caption text-medium-emphasis">
                    <v-icon size="x-small" color="warning" class="mr-1"
                        >mdi-information-outline</v-icon
                    >
                    Analyze to assess holdings
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
                                {{ recentScanStatus.length }} events
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

            <!-- Bucket recommendation verdict (post-analysis) -->
            <v-alert
                v-if="bucketVerdict"
                :color="bucketVerdict.color"
                variant="tonal"
                density="compact"
                class="mb-3"
                :icon="
                    bucketVerdict.color === 'success'
                        ? 'mdi-check-circle-outline'
                        : 'mdi-alert-circle-outline'
                "
            >
                <span class="text-body-2">{{ bucketVerdict.message }}</span>
            </v-alert>

            <!-- Two-dimension strip: A) Horizon fit · B) Holdings health -->
            <v-row v-if="active" dense class="mb-3 align-stretch">
                <!-- Dimension A: Goal alignment -->
                <v-col cols="12" md="6">
                    <GoalsHorizonFitCard
                        :goal="active.goal"
                        :user="activeUser"
                        :analyzed="bucketHealth.scanned > 0"
                        :holding-vols="
                            sortedEntities.map((e) => e.monitor?.stockVolatility30d ?? null)
                        "
                        :holding-sectors="
                            sortedEntities.map((e) => (e.monitor?.sector as any) ?? null)
                        "
                        class="fill-height"
                        @edit-goal="goalEditorOpen = true"
                    />
                </v-col>

                <!-- Dimension B: Holdings health -->
                <v-col cols="12" md="6">
                    <v-card variant="outlined" class="pa-4 fill-height">
                        <div class="d-flex align-center mb-3">
                            <v-icon color="primary" class="mr-2" size="small">
                                mdi-shield-search
                            </v-icon>
                            <span class="text-subtitle-2 font-weight-medium">Holdings health</span>
                            <v-spacer />
                            <v-chip
                                v-if="bucketHealth.worstTier"
                                :color="tierColor(bucketHealth.worstTier)"
                                size="small"
                                label
                                variant="flat"
                            >
                                {{ tierLabel(bucketHealth.worstTier) }} risk
                            </v-chip>
                        </div>

                        <!-- Unscanned -->
                        <div
                            v-if="bucketHealth.scanned === 0"
                            class="text-body-2 text-medium-emphasis"
                        >
                            Use the Analyze button to assess holdings across SEC filings, news, and
                            market signals.
                        </div>

                        <!-- Scanned -->
                        <template v-else>
                            <!-- Headline verdict -->
                            <div class="mb-3">
                                <template v-if="bucketHealth.needsAttention > 0">
                                    <span
                                        class="text-h6 font-weight-bold"
                                        :class="`text-${tierColor(bucketHealth.worstTier ?? 'medium')}`"
                                    >
                                        {{ bucketHealth.needsAttention }}
                                        {{
                                            bucketHealth.needsAttention === 1
                                                ? 'holding'
                                                : 'holdings'
                                        }}
                                    </span>
                                    <span class="text-body-2 ml-1 text-medium-emphasis"
                                        >need attention</span
                                    >
                                </template>
                                <template v-else>
                                    <v-icon color="success" size="20" class="mr-1"
                                        >mdi-check-circle</v-icon
                                    >
                                    <span class="text-body-1 font-weight-medium text-success"
                                        >All holdings look healthy</span
                                    >
                                </template>
                            </div>

                            <div class="d-flex align-center mb-3" style="gap: 12px">
                                <div class="text-center">
                                    <div class="text-h6 font-weight-bold">
                                        {{ bucketHealth.scanned }}
                                    </div>
                                    <div class="text-caption text-medium-emphasis">Scored</div>
                                </div>
                                <div v-if="bucketHealth.needsAttention > 0" class="text-center">
                                    <div class="text-h6 font-weight-bold text-warning">
                                        {{ bucketHealth.needsAttention }}
                                    </div>
                                    <div class="text-caption text-medium-emphasis">Flagged</div>
                                </div>
                                <v-spacer />
                                <div v-if="bucketHealth.avgFused !== null" class="text-right">
                                    <div class="text-subtitle-2 font-weight-bold">
                                        {{ bucketHealth.avgFused }}
                                    </div>
                                    <div class="text-caption text-medium-emphasis">
                                        Avg overall risk
                                    </div>
                                </div>
                            </div>

                            <!-- Lens worst -->
                            <div
                                v-if="anyLensData"
                                class="d-flex align-center"
                                style="gap: 12px; flex-wrap: wrap"
                            >
                                <div
                                    v-if="bucketHealth.lensWorst.fhs !== null"
                                    class="lens-score-item"
                                >
                                    <span class="text-caption text-medium-emphasis"
                                        >Fin. strength</span
                                    >
                                    <span
                                        class="text-caption font-weight-bold"
                                        :class="`text-${tierColor(scoreToLabel(bucketHealth.lensWorst.fhs))}`"
                                    >
                                        {{ bucketHealth.lensWorst.fhs }}
                                    </span>
                                </div>
                                <div
                                    v-if="bucketHealth.lensWorst.ers !== null"
                                    class="lens-score-item"
                                >
                                    <span class="text-caption text-medium-emphasis"
                                        >Leadership</span
                                    >
                                    <span
                                        class="text-caption font-weight-bold"
                                        :class="`text-${tierColor(scoreToLabel(bucketHealth.lensWorst.ers))}`"
                                    >
                                        {{ bucketHealth.lensWorst.ers }}
                                    </span>
                                </div>
                                <div
                                    v-if="bucketHealth.lensWorst.acs !== null"
                                    class="lens-score-item"
                                >
                                    <span class="text-caption text-medium-emphasis">Ownership</span>
                                    <span
                                        class="text-caption font-weight-bold"
                                        :class="`text-${tierColor(scoreToLabel(bucketHealth.lensWorst.acs))}`"
                                    >
                                        {{ bucketHealth.lensWorst.acs }}
                                    </span>
                                </div>
                            </div>
                        </template>

                        <p class="text-caption text-medium-emphasis mt-3 mb-0" style="opacity: 0.7">
                            Multi-source fusion: SEC · news · market · ownership
                        </p>
                    </v-card>
                </v-col>
            </v-row>

            <v-row dense class="mb-3 align-stretch">
                <v-col cols="12" class="d-flex flex-column summary-col summary-col--20">
                    <SourceFusionBar
                        :total="active?.entities.length ?? 0"
                        :coverage="coverage"
                        :coverage-detail="coverageDetail"
                        :fred-macro="fredMacroCoverage"
                        :scanning="scanning"
                        class="flex-grow-1"
                    />
                </v-col>
                <v-col cols="12" class="d-flex flex-column summary-col summary-col--20">
                    <RiskDistribution
                        :counts="tierCounts"
                        :details="tierDrivers"
                        :scanning="scanning"
                        class="flex-grow-1"
                    />
                </v-col>
                <v-col cols="12" class="d-flex flex-column summary-col summary-col--60">
                    <MacroPanel class="flex-grow-1" />
                </v-col>
            </v-row>

            <div class="d-flex align-center mb-1">
                <v-tabs
                    ref="tabsEl"
                    v-model="monitorTab"
                    style="flex: 1"
                    @update:model-value="scrollToTabs"
                >
                    <v-tab value="monitor">Holdings</v-tab>
                    <v-tab value="summary">AI Summary</v-tab>
                    <template v-if="showAdvanced">
                        <v-tab value="fhs">Financial (FHS)</v-tab>
                        <v-tab value="ers">Leadership (ERS)</v-tab>
                        <v-tab value="acs">Ownership (ACS)</v-tab>
                    </template>
                </v-tabs>
                <v-btn
                    size="small"
                    variant="text"
                    :color="showAdvanced ? 'primary' : 'default'"
                    :prepend-icon="showAdvanced ? 'mdi-chevron-up' : 'mdi-tune-variant'"
                    class="ml-2 text-caption"
                    @click="showAdvanced = !showAdvanced"
                >
                    Advanced
                </v-btn>
            </div>
            <v-window v-model="monitorTab">
                <v-window-item value="monitor" style="min-height: 400px">
                    <MonitorTable
                        v-if="active"
                        :entities="sortedEntities"
                        :loading="scanning"
                        @open="goToEntity"
                        @assess="onAssess"
                        @remove="onRemoveEntity"
                    />
                </v-window-item>
                <v-window-item value="fhs" style="min-height: 400px">
                    <MonitorFhsTable
                        v-if="active"
                        :entities="sortedEntities"
                        :loading="scanning"
                        @open="(e) => goToEntity(e, 'fhs')"
                    />
                </v-window-item>
                <v-window-item value="ers" style="min-height: 400px">
                    <MonitorErsTable
                        v-if="active"
                        :entities="sortedEntities"
                        :loading="scanning"
                        @open="(e) => goToEntity(e, 'ers')"
                    />
                </v-window-item>
                <v-window-item value="acs" style="min-height: 400px">
                    <MonitorAcsTable
                        v-if="active"
                        :entities="sortedEntities"
                        :loading="scanning"
                        @open="(e) => goToEntity(e, 'acs')"
                    />
                </v-window-item>
                <v-window-item value="summary" style="min-height: 600px">
                    <SummaryPortfolioSummaryTab
                        v-if="active"
                        :entities="sortedEntities"
                        :portfolio-id="active.id"
                        :portfolio-name="active.name"
                        :active="monitorTab === 'summary'"
                        :scan-completed-at="scanCompletedAt"
                        :macro="{
                            regime: regime.label,
                            synthesis: regime.synthesis,
                            sectorTilt: regime.sectorTilt?.map((s) => s.label).join(', '),
                            portfolioImplication: regime.portfolioImplication,
                        }"
                        :coverage-detail="coverageDetail"
                        @request-scan="onScan"
                    />
                    <div v-else class="pa-6 text-center text-medium-emphasis">
                        Select a portfolio to view the summary.
                    </div>
                </v-window-item>
            </v-window>
        </div>

        <PortfolioAddEntitiesDialog
            v-model="newPortfolioOpen"
            mode="create"
            @submit="onCreatePortfolio"
        />

        <PortfolioAddEntitiesDialog v-model="addEntitiesOpen" mode="add" @submit="onAddEntities" />

        <OnboardingOnboardingDialog
            v-model="onboardingOpen"
            :user="activeUser"
            @submit="onOnboardingSubmit"
        />

        <GoalsGoalEditorDialog
            v-model="goalEditorOpen"
            :bucket-name="active?.name"
            :existing-goal="active?.goal"
            :user-risk-tolerance="activeUser?.riskTolerance"
            @submit="onGoalSubmit"
            @clear="onGoalClear"
        />

        <v-dialog
            :model-value="!!entityToRemove"
            max-width="420"
            @update:model-value="entityToRemove = null"
        >
            <v-card>
                <v-card-title class="text-body-1 font-weight-medium">Remove entity?</v-card-title>
                <v-card-text class="text-body-2">
                    Remove
                    <strong>{{ entityToRemove?.resolvedName || entityToRemove?.inputName }}</strong>
                    from <strong>{{ active?.name }}</strong
                    >? This only affects this portfolio.
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn variant="text" @click="entityToRemove = null">Cancel</v-btn>
                    <v-btn color="error" variant="tonal" @click="confirmRemoveEntity">Remove</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script setup lang="ts">
    import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

    import type {
        PortfolioEntity,
        PortfolioCoverageDetail,
        ResolvedEntityInput,
    } from '~/composables/usePortfolio';
    import type { RiskTier } from '~/composables/useFusedScoring';
    import { tierColor, tierLabel, scoreToLabel } from '~/composables/useFusedScoring';
    import { bucketHoldingsHealth } from '~/utils/goals/holdingsHealth';
    import { usePortfolio } from '~/composables/usePortfolio';
    import { useUser } from '~/composables/useUser';
    import { useAgentPipeline } from '~/composables/useAgentPipeline';
    import { useFredMacroContext, useRelationships } from '~/composables/useRelationships';
    import { useMacroRegime } from '~/composables/useMacroRegime';

    const router = useRouter();

    const {
        users,
        activeUserId,
        activeUser,
        setActiveUser,
        createUser,
        updateUser,
        markOnboarded,
    } = useUser();

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
        createPortfolioFromEntities,
        addResolvedEntities,
        removeEntity,
        updateGoal,
        saveAssessment,
    } = usePortfolio(activeUserId);

    const { runPipeline, pushActivity } = useAgentPipeline();

    // Pre-warm the relationship universe so /relationships loads instantly after a scan.
    useRelationships(active, scanning);

    // FRED is portfolio-wide macro context (GDP, inflation, rates), not a
    // per-entity source — surface its live curated series in the coverage panel.
    const { signals: fredMacroSignals } = useFredMacroContext({ autoRefresh: false });
    const fredMacroCoverage = computed(() => {
        const sig = fredMacroSignals.value;
        const latest = sig
            .map((s) => s.historyEnd)
            .filter((d): d is string => !!d)
            .sort()
            .pop();
        return {
            live: sig.length,
            total: Math.max(sig.length, 5),
            earliest: null,
            latest: latest ?? null,
        };
    });

    const lastScanError = ref('');
    const showAdvanced = ref(false);
    const monitorTab = ref<'monitor' | 'fhs' | 'ers' | 'acs' | 'summary'>('monitor');
    const tabsEl = ref<HTMLElement | null>(null);

    function scrollToTabs() {
        nextTick(() => {
            const el = tabsEl.value as any;
            const node: HTMLElement | null = el?.$el ?? el;
            node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }
    const { regime } = useMacroRegime();
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

    // ── Dimension B: holdings health for the active bucket ──────────
    const bucketHealth = computed(() => bucketHoldingsHealth(active.value?.entities ?? []));

    /** Short recommendation-first verdict for the active bucket. */
    const bucketVerdict = computed(() => {
        if (bucketHealth.value.scanned === 0) return null;
        const { worstTier, needsAttention, avgFused } = bucketHealth.value;
        if (worstTier === 'critical' || worstTier === 'high') {
            const topRiskyNames = (active.value?.entities ?? [])
                .filter((e) => e.scores?.tier === worstTier)
                .slice(0, 2)
                .map((e) => e.resolvedName || e.inputName)
                .join(' and ');
            const reason = topRiskyNames
                ? `${topRiskyNames} ${needsAttention > 1 ? 'raise' : 'raises'} near-term risk`
                : `${needsAttention} holding${needsAttention > 1 ? 's' : ''} need attention`;
            return { color: 'error', message: reason };
        }
        if (needsAttention > 0) {
            return {
                color: 'warning',
                message: `${needsAttention} holding${needsAttention > 1 ? 's' : ''} warrant a closer look`,
            };
        }
        if (avgFused !== null && avgFused < 30) {
            return { color: 'success', message: 'All holdings look healthy across key signals' };
        }
        return null;
    });

    const anyLensData = computed(
        () =>
            bucketHealth.value.lensWorst.fhs !== null ||
            bucketHealth.value.lensWorst.ers !== null ||
            bucketHealth.value.lensWorst.acs !== null
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

    const DRIVER_LENS_LABEL: Record<string, string> = {
        solvency: 'Solvency',
        executive: 'Leadership',
        news: 'News',
        market: 'Market',
        eventPressure: 'Events',
        compliance: 'Screening',
    };

    // Per-tier "what's driving this priority": tally each entity's top driver
    // lenses, then surface the most common ones for the tier.
    const tierDrivers = computed<Partial<Record<RiskTier, string>>>(() => {
        const tally: Record<RiskTier, Map<string, number>> = {
            critical: new Map(),
            high: new Map(),
            medium: new Map(),
            low: new Map(),
        };
        for (const e of active.value?.entities ?? []) {
            const tier = e.scores?.tier;
            if (!tier) continue;
            const topDrivers = [...(e.drivers ?? [])].sort((a, b) => b.score - a.score).slice(0, 2);
            for (const d of topDrivers) {
                const label = DRIVER_LENS_LABEL[d.lens] ?? d.lens;
                tally[tier].set(label, (tally[tier].get(label) ?? 0) + 1);
            }
        }
        const out: Partial<Record<RiskTier, string>> = {};
        (Object.keys(tally) as RiskTier[]).forEach((t) => {
            const ranked = [...tally[t].entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([label]) => label);
            if (ranked.length) out[t] = ranked.join(' · ');
        });
        return out;
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

    function emptyPortfolioCoverage(): PortfolioCoverageDetail {
        return {
            sec: { entities: 0, filings: 0, earliest: null, latest: null },
            news: { entities: 0, articles: 0, events: 0, earliest: null, latest: null },
            stock: { entities: 0, readings: 0, instruments: 0, earliest: null, latest: null },
            poly: { entities: 0, markets: 0, active: 0 },
            fred: { entities: 0, series: 0, earliest: null, latest: null },
            acs: 0,
            eventPressure: 0,
            velocity: 0,
            sanctions: 0,
            ownership: { entities: 0, links: 0 },
            fdic: 0,
        };
    }

    const coverageDetail = computed<PortfolioCoverageDetail>(() => {
        if (!active.value) return emptyPortfolioCoverage();

        let anyDetail = false;
        const agg = emptyPortfolioCoverage();

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
            if (cd.sanctions) agg.sanctions++;
            if (cd.ownership > 0) {
                agg.ownership.entities++;
                agg.ownership.links += cd.ownership;
            }
            if (cd.fdic) agg.fdic++;
        }

        if (!anyDetail) return lastScanCoverageDetail.value;
        return agg;
    });

    const recentScanStatus = computed(() => scanStatusHistory.value.slice(-40).reverse());
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

    function goToEntity(entity: PortfolioEntity, tab?: string) {
        if (!entity.neid) return;
        const query = tab ? { tab } : {};
        router.push({ path: `/entity/${entity.neid}`, query });
    }

    function onAssess(entityRow: any, tier: 'HIGH' | 'MEDIUM' | 'LOW' | 'IGNORE' | null) {
        if (!active.value?.id || !entityRow?.entity?.neid || !tier) return;
        const mapped: RiskTier = tier === 'HIGH' ? 'high' : tier === 'MEDIUM' ? 'medium' : 'low';
        saveAssessment(active.value.id, entityRow.entity.neid, mapped, '');
    }

    const newPortfolioOpen = ref(false);
    const addEntitiesOpen = ref(false);

    function onCreatePortfolio(payload: { name?: string; entities: ResolvedEntityInput[] }) {
        if (!payload.name?.trim()) return;
        createPortfolioFromEntities(payload.name.trim(), payload.entities);
    }

    function onAddEntities(payload: { name?: string; entities: ResolvedEntityInput[] }) {
        if (!active.value) return;
        addResolvedEntities(active.value.id, payload.entities);
    }

    const entityToRemove = ref<PortfolioEntity | null>(null);

    function onRemoveEntity(entity: PortfolioEntity) {
        entityToRemove.value = entity;
    }

    function confirmRemoveEntity() {
        if (!active.value || !entityToRemove.value) return;
        removeEntity(active.value.id, entityToRemove.value.inputName);
        entityToRemove.value = null;
    }

    // --- Onboarding / user management ---
    const onboardingOpen = ref(false);
    const editingUser = ref(false);

    // Show onboarding when the active user hasn't completed it yet.
    watch(
        activeUser,
        (u) => {
            if (u && !u.onboarded) {
                onboardingOpen.value = true;
            }
        },
        { immediate: true }
    );

    function onOnboardingSubmit(
        profile: Omit<import('~/composables/useUser').DemoUser, 'id' | 'createdAt' | 'onboarded'>
    ) {
        if (activeUser.value) {
            updateUser(activeUser.value.id, profile);
            markOnboarded(activeUser.value.id);
        }
    }

    // User-switcher options
    const userOptions = computed(() => users.value.map((u) => ({ title: u.name, value: u.id })));

    const activeUserIdModel = computed({
        get: () => activeUserId.value,
        set: (v) => {
            if (v) setActiveUser(v);
        },
    });

    // --- Goal editor ---
    const goalEditorOpen = ref(false);

    function onGoalSubmit(goal: import('~/composables/usePortfolio').GoalMeta) {
        if (active.value) updateGoal(active.value.id, goal);
    }

    function onGoalClear() {
        if (active.value) updateGoal(active.value.id, null);
    }

    const yearsToRetirement = computed(() =>
        activeUser.value ? Math.max(0, activeUser.value.retirementAge - activeUser.value.age) : null
    );
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

    .lens-score-item {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 1px;
    }

    @media (min-width: 960px) {
        .summary-col--20 {
            flex: 0 0 20%;
            max-width: 20%;
        }
        .summary-col--60 {
            flex: 0 0 60%;
            max-width: 60%;
        }
    }
</style>
