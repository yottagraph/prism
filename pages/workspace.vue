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
            <!-- Empty state before first scan -->
            <div
                v-if="!hasAnyScored && !scanning"
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

            <div v-else class="pa-4 d-flex flex-column" style="gap: 16px">
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
                            Analyzing…
                        </v-chip>
                    </div>

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

                <!-- ── Four renders ──────────────────────────────────── -->
                <div class="renders-grid">
                    <!-- Table -->
                    <v-card class="render-card">
                        <div class="render-label pa-3 d-flex align-center" style="gap: 8px">
                            <v-icon size="small" color="primary">mdi-table</v-icon>
                            <span class="text-subtitle-2">Issuer table</span>
                            <span class="text-caption text-medium-emphasis">
                                — FHS · ERS · ACS · News · Market
                            </span>
                        </div>
                        <v-divider />
                        <div class="render-body overflow-auto">
                            <MonitorMonitorTable
                                v-if="active"
                                :entities="sortedEntities"
                                :loading="scanning"
                                @open="goToEntity"
                                @assess="() => {}"
                                @remove="() => {}"
                            />
                        </div>
                    </v-card>

                    <!-- Narrative -->
                    <v-card class="render-card">
                        <div class="render-label pa-3 d-flex align-center" style="gap: 8px">
                            <v-icon size="small" color="secondary">mdi-text-long</v-icon>
                            <span class="text-subtitle-2">Diligence brief</span>
                            <span class="text-caption text-medium-emphasis">
                                — composition agent
                            </span>
                        </div>
                        <v-divider />
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
                    </v-card>

                    <!-- Graph -->
                    <v-card class="render-card">
                        <div class="render-label pa-3 d-flex align-center" style="gap: 8px">
                            <v-icon size="small" color="info">mdi-graph-outline</v-icon>
                            <span class="text-subtitle-2">Entity network</span>
                            <span class="text-caption text-medium-emphasis">
                                — companies · people · instruments · locations
                            </span>
                        </div>
                        <v-divider />
                        <div class="render-body overflow-hidden">
                            <div
                                v-if="!hasAnyScored && !scanning"
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
                    </v-card>

                    <!-- Chat -->
                    <v-card class="render-card">
                        <div class="render-label pa-3 d-flex align-center" style="gap: 8px">
                            <v-icon size="small" color="warning"
                                >mdi-message-question-outline</v-icon
                            >
                            <span class="text-subtitle-2">Ask the book</span>
                            <span class="text-caption text-medium-emphasis">
                                — agent-backed Q&A
                            </span>
                        </div>
                        <v-divider />
                        <div class="render-body overflow-auto">
                            <SummaryChatSection
                                endpoint="/api/portfolio-summary/chat"
                                :request-body="chatContext"
                                :suggestions="chatSuggestions"
                                placeholder="Ask anything about this diligence book…"
                            />
                        </div>
                    </v-card>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue';

    import { INSTITUTIONAL_OWNER, type PortfolioEntity } from '~/composables/usePortfolio';
    import { usePortfolio } from '~/composables/usePortfolio';
    import { useScoringSettings, type MandateId } from '~/composables/useScoringSettings';
    import { useAgentPipeline } from '~/composables/useAgentPipeline';
    import { useRelationships } from '~/composables/useRelationships';
    import type { GraphNode } from '~/composables/useRelationships';
    import { tierColor } from '~/composables/useFusedScoring';

    const router = useRouter();

    // ── Portfolio state (no user filter — sees institutional books) ──
    const {
        portfolios,
        activePortfolio: active,
        setActivePortfolio,
        scanPortfolio,
        scanning,
        scanProgress,
        scanCompletedAt,
        lastScanCoverage,
        lastScanCoverageDetail,
        hasAnyScored,
    } = usePortfolio();

    // Restrict to institutional books only on this surface
    const institutionalBooks = computed(() =>
        portfolios.value.filter(
            (p) => p.kind === 'institutional' || p.ownerUserId === INSTITUTIONAL_OWNER
        )
    );

    const bookOptions = computed(() =>
        institutionalBooks.value.map((p) => ({ title: p.name, value: p.id }))
    );

    // Default to the EDD book
    const EDD_BOOK_ID = 'edd-credit-committee';
    const activeBookId = ref<string>(active.value?.id ?? EDD_BOOK_ID);

    // On mount, ensure EDD book is active
    if (active.value?.ownerUserId !== INSTITUTIONAL_OWNER) {
        const eddBook = institutionalBooks.value.find((p) => p.id === EDD_BOOK_ID);
        if (eddBook) setActivePortfolio(eddBook.id);
        activeBookId.value = eddBook?.id ?? EDD_BOOK_ID;
    }

    function onBookChange(id: string) {
        setActivePortfolio(id);
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
        if (hasAnyScored.value) await rescan();
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

    // ── Analysis ────────────────────────────────────────────────────
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
            const sa = a.scores?.overall ?? -1;
            const sb = b.scores?.overall ?? -1;
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
            const overall = e.scores.overall?.toFixed(0) ?? '–';
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

    /* 2×2 renders grid */
    .renders-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: auto auto;
        gap: 16px;
    }

    .render-card {
        display: flex;
        flex-direction: column;
        min-height: 520px;
    }

    .render-label {
        flex-shrink: 0;
        border-bottom: none;
    }

    .render-body {
        flex: 1;
        min-height: 0;
    }

    @media (max-width: 1200px) {
        .renders-grid {
            grid-template-columns: 1fr;
        }
    }
</style>
