<template>
    <div class="d-flex flex-column fill-height">
        <!-- ── Header ──────────────────────────────────────────────── -->
        <div class="flex-shrink-0 page-header pa-4">
            <div class="d-flex align-center" style="gap: 12px">
                <div class="d-flex align-center" style="gap: 8px">
                    <v-icon size="large" color="primary">mdi-layers-triple-outline</v-icon>
                    <div>
                        <h1 class="text-h6 font-weight-medium mb-0">Agent Workspace</h1>
                        <p class="text-caption text-medium-emphasis mb-0">
                            One Elemental graph · one scan · every render
                        </p>
                    </div>
                </div>

                <v-spacer />

                <!-- Book selector (institutional books only) -->
                <div class="d-flex align-center" style="gap: 8px">
                    <span class="text-caption text-medium-emphasis text-no-wrap">Book</span>
                    <v-select
                        v-model="activeBookId"
                        :items="bookOptions"
                        variant="outlined"
                        density="compact"
                        hide-details
                        style="min-width: 280px"
                        prepend-inner-icon="mdi-book-open-outline"
                        @update:model-value="onBookChange"
                    />
                    <v-btn
                        icon="mdi-plus"
                        variant="tonal"
                        size="small"
                        density="comfortable"
                        aria-label="Create new book"
                        @click="newBookOpen = true"
                    />
                </div>

                <!-- Mandate selector -->
                <div class="d-flex align-center" style="gap: 8px">
                    <span class="text-caption text-medium-emphasis text-no-wrap">Policy</span>
                    <v-select
                        v-model="activeMandateId"
                        :items="mandateOptions"
                        variant="outlined"
                        density="compact"
                        hide-details
                        style="min-width: 220px"
                        prepend-inner-icon="mdi-tune-variant"
                        @update:model-value="onMandateChange"
                    />
                </div>

                <!-- Run analysis -->
                <v-btn
                    color="primary"
                    :loading="scanning"
                    :disabled="!active"
                    prepend-icon="mdi-play-circle-outline"
                    @click="onAnalyze"
                >
                    Run analysis
                </v-btn>
            </div>

            <!-- Mandate context banner -->
            <div v-if="activeMandate" class="mt-3 mandate-banner pa-3 rounded">
                <div class="d-flex align-center flex-wrap" style="gap: 8px">
                    <span class="text-caption text-medium-emphasis font-weight-medium">
                        {{ activeMandate.pack }}
                    </span>
                    <v-icon size="x-small" class="text-medium-emphasis">mdi-chevron-right</v-icon>
                    <span class="text-caption text-medium-emphasis">
                        {{ activeMandate.question }}
                    </span>
                    <v-spacer />
                    <span class="text-caption text-medium-emphasis">Modules</span>
                    <v-chip
                        v-for="mod in activeMandate.primaryModules"
                        :key="mod"
                        size="x-small"
                        :color="moduleColor(mod)"
                        variant="tonal"
                        label
                    >
                        {{ mod }} · {{ moduleExpansion(mod) }}
                    </v-chip>
                </div>
            </div>
        </div>

        <!-- ── Body ───────────────────────────────────────────────── -->
        <div class="flex-grow-1 overflow-y-auto">
            <!-- Empty state before first scan of this book -->
            <div
                v-if="!activeBookScored && !scanning"
                class="d-flex flex-column align-center justify-center pa-12"
                style="min-height: 400px; gap: 16px"
            >
                <v-icon size="64" color="medium-emphasis">mdi-layers-triple-outline</v-icon>
                <div class="text-center" style="max-width: 480px">
                    <p class="text-subtitle-1 font-weight-medium mb-2">Ready to analyze the book</p>
                    <p class="text-body-2 text-medium-emphasis mb-4">
                        Elemental resolves each issuer, runs the modules under the active policy,
                        and every render below will reflect the same evidence.
                    </p>
                    <v-btn
                        color="primary"
                        size="large"
                        prepend-icon="mdi-play-circle-outline"
                        :loading="scanning"
                        @click="onAnalyze"
                    >
                        Run analysis
                    </v-btn>
                </div>
            </div>

            <div
                v-else-if="activeBookScored || scanning"
                class="pa-4 d-flex flex-column"
                style="gap: 16px"
            >
                <!-- ── The Seam ──────────────────────────────────────── -->
                <v-card class="seam-card pa-0" variant="outlined">
                    <div class="seam-header pa-3 d-flex align-center" style="gap: 8px">
                        <v-icon size="small" color="primary">mdi-share-variant-outline</v-icon>
                        <span class="text-subtitle-2 font-weight-medium">Shared context</span>
                        <span class="text-caption text-medium-emphasis ml-1">
                            — one Elemental graph, resolved once. Every render below draws from the
                            same source.
                        </span>
                        <v-spacer />
                        <v-chip
                            v-if="active"
                            size="x-small"
                            variant="tonal"
                            color="primary"
                            prepend-icon="mdi-domain"
                        >
                            {{ active.entities.length }} issuers
                        </v-chip>
                        <v-chip
                            v-if="scanCompletedAt"
                            size="x-small"
                            variant="tonal"
                            color="success"
                        >
                            Scored
                        </v-chip>
                        <v-chip v-if="scanning" size="x-small" variant="tonal" color="warning">
                            <v-progress-circular indeterminate size="10" width="2" class="mr-1" />
                            {{
                                scanProgress.total
                                    ? `Analyzing ${scanProgress.done}/${scanProgress.total}`
                                    : 'Analyzing…'
                            }}
                        </v-chip>
                    </div>

                    <!-- Live scan status / error surfacing -->
                    <div
                        v-if="scanning && scanStatusMessage && scanStatusMessage !== 'Idle'"
                        class="px-3 pb-2 text-caption text-medium-emphasis d-flex align-center"
                        style="gap: 6px"
                    >
                        <v-icon size="x-small">mdi-information-outline</v-icon>
                        {{ scanStatusMessage }}
                    </div>
                    <div
                        v-if="scanning && scanWatchdog"
                        class="px-3 pb-2 text-caption text-warning d-flex align-center"
                        style="gap: 6px"
                    >
                        <v-icon size="x-small" color="warning">mdi-clock-alert-outline</v-icon>
                        {{ scanWatchdog }}
                    </div>
                    <v-alert
                        v-if="lastScanError && !scanning"
                        type="error"
                        density="compact"
                        variant="tonal"
                        class="mx-3 mb-3"
                        :text="lastScanError"
                    />

                    <v-divider />

                    <div class="pa-3 d-flex flex-wrap" style="gap: 16px">
                        <!-- Coverage (SourceFusionBar) -->
                        <div class="flex-grow-1" style="min-width: 340px">
                            <SourceFusionBar
                                v-if="active && scanCompletedAt"
                                :total="active.entities.length"
                                :coverage="lastScanCoverage"
                                :coverage-detail="lastScanCoverageDetail"
                                :scanning="scanning"
                            />
                            <div
                                v-else
                                class="text-caption text-medium-emphasis d-flex align-center"
                                style="min-height: 40px"
                            >
                                <v-icon size="small" class="mr-2">mdi-circle-outline</v-icon>
                                Source coverage will appear after the first analysis run.
                            </div>
                        </div>

                        <!-- Agent pipeline -->
                        <div class="flex-shrink-0" style="min-width: 280px">
                            <div class="text-caption text-medium-emphasis mb-2 font-weight-medium">
                                Agent pipeline
                            </div>
                            <div
                                class="pipeline-inline d-flex align-center flex-wrap"
                                style="gap: 6px"
                            >
                                <div
                                    v-for="(step, i) in currentPipeline"
                                    :key="step.name"
                                    class="d-flex align-center"
                                    style="gap: 6px"
                                >
                                    <div
                                        class="pipeline-step-chip d-flex align-center"
                                        :class="`pipeline-step-${step.status}`"
                                        style="
                                            gap: 4px;
                                            padding: 2px 8px;
                                            border-radius: 12px;
                                            font-size: 11px;
                                        "
                                    >
                                        <v-progress-circular
                                            v-if="step.status === 'working'"
                                            indeterminate
                                            size="10"
                                            width="2"
                                            color="primary"
                                        />
                                        <v-icon
                                            v-else-if="step.status === 'completed'"
                                            size="10"
                                            color="success"
                                            >mdi-check</v-icon
                                        >
                                        <v-icon v-else size="10" color="medium-emphasis"
                                            >mdi-circle-outline</v-icon
                                        >
                                        {{ step.label }}
                                    </div>
                                    <v-icon
                                        v-if="i < currentPipeline.length - 1"
                                        size="12"
                                        color="medium-emphasis"
                                        >mdi-chevron-right</v-icon
                                    >
                                </div>
                            </div>
                        </div>
                    </div>
                </v-card>

                <!-- ── Four renders (tabbed) ─────────────────────────── -->
                <v-card class="render-card" variant="outlined">
                    <v-tabs v-model="activeRender" density="compact" color="primary">
                        <v-tab value="table">
                            <v-icon size="small" color="primary" class="mr-2">mdi-table</v-icon>
                            Issuer table
                        </v-tab>
                        <v-tab value="brief">
                            <v-icon size="small" color="secondary" class="mr-2"
                                >mdi-text-long</v-icon
                            >
                            Diligence brief
                        </v-tab>
                        <v-tab value="network">
                            <v-icon size="small" color="info" class="mr-2"
                                >mdi-graph-outline</v-icon
                            >
                            Entity network
                        </v-tab>
                        <v-tab value="chat">
                            <v-icon size="small" color="warning" class="mr-2"
                                >mdi-message-question-outline</v-icon
                            >
                            Ask the book
                        </v-tab>
                    </v-tabs>

                    <v-divider />

                    <v-tabs-window v-model="activeRender">
                        <!-- Table -->
                        <v-tabs-window-item value="table">
                            <div class="render-caption px-3 pt-2 text-caption text-medium-emphasis">
                                FHS · ERS · ACS · News · Market
                            </div>
                            <div class="render-body overflow-auto">
                                <MonitorTable
                                    v-if="active"
                                    :entities="sortedEntities"
                                    :loading="scanning"
                                    @open="goToEntity"
                                    @assess="() => {}"
                                    @remove="() => {}"
                                />
                            </div>
                        </v-tabs-window-item>

                        <!-- Narrative -->
                        <v-tabs-window-item value="brief">
                            <div class="render-caption px-3 pt-2 text-caption text-medium-emphasis">
                                Composition agent
                            </div>
                            <div class="render-body overflow-auto">
                                <SummaryPortfolioSummaryTab
                                    v-if="active"
                                    :entities="sortedEntities"
                                    :portfolio-id="active.id"
                                    :portfolio-name="active.name"
                                    :active="true"
                                    :scan-completed-at="scanCompletedAt"
                                    :coverage-detail="lastScanCoverageDetail"
                                    @request-scan="onAnalyze"
                                />
                            </div>
                        </v-tabs-window-item>

                        <!-- Graph -->
                        <v-tabs-window-item value="network">
                            <div class="render-caption px-3 pt-2 text-caption text-medium-emphasis">
                                Companies · people · instruments · locations
                            </div>
                            <div class="render-body overflow-hidden">
                                <div
                                    v-if="!activeBookScored && !scanning"
                                    class="d-flex flex-column align-center justify-center pa-8 text-center text-medium-emphasis"
                                    style="height: 100%"
                                >
                                    <v-icon size="40" class="mb-2">mdi-graph-outline</v-icon>
                                    <span class="text-body-2">
                                        Run analysis to populate the connected universe.
                                    </span>
                                </div>
                                <div v-else class="pa-2" style="height: 100%">
                                    <RelationshipsRelationshipNetwork
                                        :nodes="graph.nodes"
                                        :edges="graph.edges"
                                        :loading="relLoading"
                                        @select-node="selectedNode = $event"
                                    />
                                    <v-card
                                        v-if="selectedNode"
                                        class="mt-2 pa-2"
                                        variant="outlined"
                                        density="compact"
                                    >
                                        <div class="text-body-2 font-weight-medium">
                                            {{ selectedNode.label }}
                                        </div>
                                        <div class="text-caption text-medium-emphasis">
                                            {{ selectedNode.kind }} · connected to
                                            {{ selectedNode.connectsTo.length }} issuer{{
                                                selectedNode.connectsTo.length === 1 ? '' : 's'
                                            }}
                                        </div>
                                    </v-card>
                                </div>
                            </div>
                        </v-tabs-window-item>

                        <!-- Chat -->
                        <v-tabs-window-item value="chat">
                            <div class="render-caption px-3 pt-2 text-caption text-medium-emphasis">
                                Agent-backed Q&A
                            </div>
                            <div class="render-body overflow-auto">
                                <SummaryChatSection
                                    endpoint="/api/portfolio-summary/chat"
                                    :request-body="chatContext"
                                    :suggestions="chatSuggestions"
                                    placeholder="Ask anything about this diligence book…"
                                />
                            </div>
                        </v-tabs-window-item>
                    </v-tabs-window>
                </v-card>
            </div>
        </div>

        <PortfolioAddEntitiesDialog v-model="newBookOpen" mode="create" @submit="onCreateBook" />
    </div>
</template>

<script setup lang="ts">
    import { computed, onMounted, ref, watch } from 'vue';

    import {
        INSTITUTIONAL_OWNER,
        type PortfolioEntity,
        type ResolvedEntityInput,
        type MandateMeta,
    } from '~/composables/usePortfolio';
    import { usePortfolio } from '~/composables/usePortfolio';
    import { useScoringSettings, type MandateId } from '~/composables/useScoringSettings';
    import { useAgentPipeline } from '~/composables/useAgentPipeline';
    import { useRelationships } from '~/composables/useRelationships';
    import type { GraphNode } from '~/composables/useRelationships';

    const router = useRouter();

    // ── Portfolio state (no user filter — sees institutional books) ──
    const {
        portfolios,
        activePortfolio: active,
        setActivePortfolio,
        createInstitutionalBook,
        scanPortfolio,
        scanning,
        scanProgress,
        scanStatusMessage,
        scanCompletedAt,
        lastScanError,
        lastScanCoverage,
        lastScanCoverageDetail,
    } = usePortfolio();

    // True only when the currently active book has been scored — not any retail portfolio.
    const activeBookScored = computed(() => active.value?.entities.some((e) => e.scores) ?? false);

    // Restrict to institutional books only on this surface
    const institutionalBooks = computed(() =>
        portfolios.value.filter(
            (p) => p.kind === 'institutional' || p.ownerUserId === INSTITUTIONAL_OWNER
        )
    );

    const bookOptions = computed(() =>
        institutionalBooks.value.map((p) => ({ title: p.name, value: p.id }))
    );

    const EDD_BOOK_ID = 'edd-credit-committee';
    const activeBookId = ref<string>(EDD_BOOK_ID);

    // Switch to the EDD book on mount, after prefs have loaded from Firestore/KV.
    // Running this in script setup would race with async prefs hydration.
    onMounted(() => {
        const eddBook = institutionalBooks.value.find((p) => p.id === EDD_BOOK_ID);
        if (eddBook) {
            setActivePortfolio(eddBook.id);
            activeBookId.value = eddBook.id;
        }
    });

    function onBookChange(id: string) {
        setActivePortfolio(id);
    }

    // ── Create a new institutional book ──────────────────────────────
    const newBookOpen = ref(false);

    function onCreateBook(payload: { name?: string; entities: ResolvedEntityInput[] }) {
        if (!payload.name?.trim()) return;
        // Seed the new book with the currently selected mandate so the agents
        // have a policy to operate under from the start.
        const mandate: MandateMeta | undefined = activeMandate.value
            ? {
                  pack: activeMandate.value.pack,
                  question: activeMandate.value.question,
                  primaryModules: activeMandate.value.primaryModules,
              }
            : undefined;
        const book = createInstitutionalBook(payload.name.trim(), payload.entities, mandate);
        setActivePortfolio(book.id);
        activeBookId.value = book.id;
    }

    // Keep selector in sync if active changes externally
    watch(
        () => active.value?.id,
        (id) => {
            if (id) activeBookId.value = id;
        }
    );

    // ── Mandate / policy ────────────────────────────────────────────
    const { mandatePresets, applyMandate, rescan } = useScoringSettings();

    const mandateOptions = computed(() =>
        mandatePresets.map((m) => ({ title: `${m.label} — ${m.pack}`, value: m.id }))
    );

    const activeMandateId = ref<MandateId>('edd');
    const activeMandate = computed(
        () => mandatePresets.find((m) => m.id === activeMandateId.value) ?? null
    );

    async function onMandateChange(id: MandateId) {
        applyMandate(id);
        // Only re-score if the active book has already been analyzed.
        if (activeBookScored.value) await rescan();
    }

    // ── Scoring labels per module ────────────────────────────────────
    const MODULE_COLORS: Record<string, string> = {
        FHS: 'primary',
        ERS: 'secondary',
        ACS: 'error',
        SCR: 'warning',
        CHS: 'info',
    };

    const MODULE_EXPANSIONS: Record<string, string> = {
        FHS: 'Financial Health',
        ERS: 'Executive Risk',
        ACS: 'Adversarial Capital',
        SCR: 'Supply Chain',
        CHS: 'Cyber Hygiene',
    };

    function moduleColor(mod: string): string {
        return MODULE_COLORS[mod] ?? 'default';
    }

    function moduleExpansion(mod: string): string {
        return MODULE_EXPANSIONS[mod] ?? mod;
    }

    // ── Agent pipeline ───────────────────────────────────────────────
    const { currentPipeline, runPipeline, pushActivity } = useAgentPipeline();

    // ── Relationships ────────────────────────────────────────────────
    const { loading: relLoading, graph } = useRelationships(active, scanning);

    const selectedNode = ref<GraphNode | null>(null);

    // ── Active render tab ────────────────────────────────────────────
    const activeRender = ref<'table' | 'brief' | 'network' | 'chat'>('table');

    // ── Analysis ────────────────────────────────────────────────────
    // Client-side watchdog: the server now bounds every Elemental call, but as
    // a belt-and-suspenders we surface a hint if a scan runs unusually long so
    // the UI can never look like a silent hang.
    const scanWatchdog = ref<string | null>(null);
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;

    watch(scanning, (isScanning) => {
        if (watchdogTimer) {
            clearTimeout(watchdogTimer);
            watchdogTimer = null;
        }
        scanWatchdog.value = null;
        if (isScanning) {
            watchdogTimer = setTimeout(() => {
                if (scanning.value) {
                    scanWatchdog.value =
                        'This scan is taking longer than usual — some issuers may be slow to resolve. It will finish or report an error shortly.';
                }
            }, 60_000);
        }
    });

    async function onAnalyze() {
        if (!active.value) return;
        pushActivity('Monitoring Agent', active.value.name, 'Analysis triggered from Workspace');
        await Promise.all([
            scanPortfolio(active.value.id, { force: true }),
            runPipeline({
                trigger: active.value.name,
                entityCount: active.value.entities.length,
            }),
        ]);
    }

    // ── Sorted entities (by fused risk score desc) ───────────────────
    const sortedEntities = computed<PortfolioEntity[]>(() => {
        const entities = active.value?.entities ?? [];
        return [...entities].sort((a, b) => {
            const sa = a.scores?.fused ?? -1;
            const sb = b.scores?.fused ?? -1;
            return sb - sa;
        });
    });

    // ── Chat context ─────────────────────────────────────────────────
    // Built deterministically from scan results so chat works immediately
    // after a scan, without waiting on the LLM narrative brief.
    const chatContext = computed(() => {
        if (!active.value) return {};
        const entities = sortedEntities.value;
        const mandate = activeMandate.value;

        const lines: string[] = [
            `# ${active.value.name}`,
            mandate ? `**Mandate:** ${mandate.pack} — ${mandate.question}` : '',
            `**Issuers (${entities.length}):** ${entities.map((e) => e.resolvedName).join(', ')}`,
            '',
            '## Risk summary',
        ];

        for (const e of entities) {
            if (!e.scores) continue;
            const tier = e.scores.tier ?? 'unknown';
            const overall = e.scores.fused?.toFixed(0) ?? '–';
            const drivers = (e.drivers ?? [])
                .slice(0, 3)
                .map((d) => `${d.lens}=${d.score.toFixed(0)}`)
                .join(', ');
            lines.push(
                `- **${e.resolvedName}**: overall ${overall} (${tier})${drivers ? ` | ${drivers}` : ''}`
            );
        }

        if (mandate?.primaryModules?.length) {
            lines.push('', `**Active modules:** ${mandate.primaryModules.join(', ')}`);
        }

        return {
            summary: lines.filter((l) => l !== '').join('\n'),
            portfolioName: active.value.name,
        };
    });

    const chatSuggestions = computed(() => {
        const names = sortedEntities.value
            .filter((e) => e.scores)
            .slice(0, 3)
            .map((e) => e.resolvedName);

        return [
            names[0]
                ? `Why is ${names[0]} ranked highest risk?`
                : 'Which issuer carries the most risk?',
            'Which issuers have the most governance concerns?',
            'Where do financial health and executive signals agree or conflict?',
            names[1] ? `Summarize the case for ${names[1]}` : 'What are the top three findings?',
        ];
    });

    function goToEntity(entity: PortfolioEntity) {
        if (entity.neid) void router.push(`/entity/${entity.neid}`);
    }
</script>

<style scoped>
    .page-header {
        border-bottom: 1px solid rgba(var(--dynamic-fg-rgb), 0.06);
        background: rgba(var(--dynamic-bg-rgb), 0.4);
    }

    .mandate-banner {
        background: rgba(var(--dynamic-primary-rgb), 0.04);
        border: 1px solid rgba(var(--dynamic-primary-rgb), 0.12);
    }

    .seam-card {
        border-color: rgba(var(--dynamic-primary-rgb), 0.2) !important;
        background: rgba(var(--dynamic-primary-rgb), 0.02) !important;
    }

    .seam-header {
        background: rgba(var(--dynamic-primary-rgb), 0.04);
    }

    .pipeline-step-chip {
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.12);
        background: rgba(var(--dynamic-fg-rgb), 0.03);
        font-family: var(--font-primary, sans-serif);
        white-space: nowrap;
    }

    .pipeline-step-working {
        border-color: rgba(var(--dynamic-primary-rgb), 0.4);
        background: rgba(var(--dynamic-primary-rgb), 0.06);
    }

    .pipeline-step-completed {
        border-color: rgba(var(--v-theme-success), 0.3);
        background: rgba(var(--v-theme-success), 0.04);
    }

    /* Tabbed render card — each tab body gets a defined height so the
       network canvas and tables render correctly inside the window item. */
    .render-card {
        display: flex;
        flex-direction: column;
    }

    .render-caption {
        flex-shrink: 0;
    }

    .render-body {
        min-height: 600px;
        height: 600px;
    }
</style>
