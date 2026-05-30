<template>
    <div class="portfolio-summary-tab d-flex" style="min-height: 560px; overflow: hidden">
        <!-- Main content area -->
        <div
            class="flex-grow-1 d-flex flex-column"
            style="min-width: 0; min-height: 560px; overflow: hidden"
        >
            <!-- Empty — no scan yet -->
            <div
                v-if="!hasScannedEntities && !generating"
                class="flex-grow-1 d-flex flex-column align-center justify-center pa-6"
            >
                <v-icon size="80" color="primary" class="mb-4"
                    >mdi-file-document-edit-outline</v-icon
                >
                <div class="text-h5 font-weight-medium mb-2">Portfolio Risk Briefing</div>
                <div
                    class="text-body-1 text-medium-emphasis mb-6"
                    style="max-width: 480px; text-align: center"
                >
                    Analyze first, then generate an AI-powered briefing with citations, risk
                    drivers, and portfolio-level themes.
                </div>
                <v-btn variant="outlined" @click="$emit('requestScan')">
                    <v-icon start>mdi-play-circle-outline</v-icon>
                    Go to Scan
                </v-btn>
            </div>

            <!-- Generating -->
            <div
                v-else-if="generating"
                class="flex-grow-1 d-flex flex-column align-center justify-center"
            >
                <v-progress-circular
                    indeterminate
                    size="72"
                    width="5"
                    color="primary"
                    class="mb-4"
                />
                <div class="text-h6 font-weight-medium mb-1">Generating Briefing</div>
                <div class="text-body-2 text-medium-emphasis mb-4">
                    Synthesizing signals across {{ props.entities.length }} entities…
                </div>
                <SummaryAgentSteps :steps="generationSteps" />
            </div>

            <!-- Error -->
            <div
                v-else-if="generationError"
                class="flex-grow-1 d-flex flex-column align-center justify-center pa-6"
            >
                <v-icon size="64" color="error" class="mb-3">mdi-alert-circle-outline</v-icon>
                <div class="text-h6 mb-2">Generation Failed</div>
                <div
                    class="text-body-2 text-medium-emphasis mb-5"
                    style="max-width: 400px; text-align: center"
                >
                    {{ generationError }}
                </div>
                <v-btn color="primary" @click="generate(true)">
                    <v-icon start>mdi-refresh</v-icon>
                    Try Again
                </v-btn>
            </div>

            <!-- Ready — no briefing yet -->
            <div
                v-else-if="!currentSummary"
                class="flex-grow-1 d-flex flex-column align-center justify-center pa-6"
            >
                <v-icon size="80" color="primary" class="mb-4">mdi-file-chart-outline</v-icon>
                <div class="text-h5 font-weight-medium mb-2">Portfolio Risk Briefing</div>
                <div
                    class="text-body-1 text-medium-emphasis mb-6"
                    style="max-width: 500px; text-align: center"
                >
                    Generate a cross-source risk memo with entity-level citations, key findings, and
                    portfolio themes.
                </div>
                <div class="d-flex gap-3">
                    <v-btn color="primary" size="x-large" class="px-8" @click="showConfig = true">
                        <v-icon start>mdi-tune</v-icon>
                        Configure &amp; Generate
                    </v-btn>
                    <v-btn variant="outlined" size="x-large" @click="generate(true)">
                        <v-icon start>mdi-lightning-bolt</v-icon>
                        Quick Generate
                    </v-btn>
                </div>
            </div>

            <!-- Briefing view -->
            <template v-else>
                <!-- Header bar -->
                <div class="summary-header pa-4 d-flex align-center flex-shrink-0">
                    <div>
                        <div class="text-overline text-medium-emphasis mb-1">
                            PORTFOLIO BRIEFING
                        </div>
                        <div class="text-h6 font-weight-medium">{{ props.portfolioName }}</div>
                    </div>
                    <v-spacer />
                    <div class="d-flex align-center gap-2">
                        <div class="text-right mr-2">
                            <div class="text-caption text-medium-emphasis">Generated</div>
                            <div class="text-body-2">{{ formatDate(currentGeneratedAt) }}</div>
                            <div v-if="currentCached" class="text-caption text-success">
                                <v-icon size="x-small" class="mr-1">mdi-cached</v-icon>Cached
                            </div>
                        </div>
                        <v-btn
                            icon
                            variant="text"
                            title="Configure report"
                            @click="showConfig = true"
                        >
                            <v-icon>mdi-tune</v-icon>
                        </v-btn>
                        <v-btn icon variant="text" title="Export PDF" @click="exportPDF">
                            <v-icon>mdi-file-pdf-box</v-icon>
                        </v-btn>
                        <v-btn icon variant="text" title="Export HTML" @click="exportHTML">
                            <v-icon>mdi-language-html5</v-icon>
                        </v-btn>
                        <v-btn icon variant="text" title="Copy to clipboard" @click="copyClipboard">
                            <v-icon>mdi-content-copy</v-icon>
                        </v-btn>
                        <v-btn
                            icon
                            variant="text"
                            title="Regenerate"
                            :loading="generating"
                            @click="generate(true)"
                        >
                            <v-icon>mdi-refresh</v-icon>
                        </v-btn>
                        <v-btn
                            v-if="history.length > 0"
                            icon
                            variant="text"
                            :color="showHistory ? 'primary' : undefined"
                            title="History"
                            @click="showHistory = !showHistory"
                        >
                            <v-icon>mdi-history</v-icon>
                        </v-btn>
                    </div>
                </div>

                <v-divider />

                <!-- Meta bar -->
                <SummaryMetaBar
                    :entity-count="props.entities.length"
                    :read-time="`~${reportConfig.style === 'brief' ? '2' : reportConfig.style === 'detailed' ? '8' : '5'} min`"
                    :model="currentUsage?.model"
                    :usage="currentUsage"
                    :agent-steps="lastAgentSteps"
                    :show-agent-details="showAgentDetails"
                    :feedback="currentFeedback"
                    :feedback-loading="feedbackLoading"
                    @update:show-agent-details="showAgentDetails = $event"
                    @feedback="submitFeedback"
                />

                <div v-if="showAgentDetails && lastAgentSteps.length" class="px-4 py-2">
                    <SummaryAgentSteps :steps="lastAgentSteps" show-details />
                </div>

                <v-divider />

                <!-- Scrollable body -->
                <div class="summary-scroll flex-grow-1 overflow-y-auto d-flex flex-column">
                    <div class="pa-4">
                        <!-- Source coverage cards -->
                        <div class="sources-grid mb-5">
                            <div
                                v-for="src in sourceSummaries"
                                :key="src.id"
                                class="source-card"
                                :class="{ available: src.available }"
                            >
                                <div class="source-header">
                                    <v-icon :color="src.available ? src.color : 'grey'" size="18">{{
                                        src.icon
                                    }}</v-icon>
                                    <span class="source-name">{{ src.name }}</span>
                                    <v-chip
                                        v-if="src.count"
                                        size="x-small"
                                        :color="src.available ? 'primary' : 'grey'"
                                        variant="tonal"
                                    >
                                        {{ src.count }}
                                    </v-chip>
                                </div>
                                <div class="source-sub text-caption text-medium-emphasis">
                                    {{ src.sub }}
                                </div>
                            </div>
                        </div>

                        <!-- Rendered briefing -->
                        <article class="report-article">
                            <div class="briefing-body" v-html="renderedHtml" />
                        </article>
                    </div>

                    <!-- Chat Q&A -->
                    <SummaryChatSection
                        endpoint="/api/portfolio-summary/chat"
                        title="Portfolio Q&A"
                        :request-body="{
                            summary: currentSummary,
                            portfolioName: props.portfolioName,
                        }"
                        :suggestions="chatSuggestions"
                    />
                </div>
            </template>
        </div>

        <!-- History sidebar -->
        <div
            v-if="showHistory && history.length > 0"
            class="history-sidebar flex-shrink-0 border-s"
        >
            <div class="pa-3 d-flex align-center">
                <v-icon size="small" class="mr-2">mdi-history</v-icon>
                <span class="text-subtitle-2">Past Briefings</span>
                <v-spacer />
                <v-btn icon size="x-small" variant="text" @click="showHistory = false">
                    <v-icon size="small">mdi-close</v-icon>
                </v-btn>
            </div>
            <v-divider />
            <div class="history-list overflow-y-auto">
                <v-list density="compact" class="py-0">
                    <v-list-item
                        v-for="item in history"
                        :key="item.id"
                        :class="{ 'bg-primary-lighten-5': selectedHistoryId === item.id }"
                        @click="loadHistoryItem(item)"
                    >
                        <v-list-item-title class="text-body-2">
                            {{ formatShortDate(item.generated_at) }}
                        </v-list-item-title>
                        <v-list-item-subtitle class="text-caption">
                            {{ item.entity_count }} entities
                            <v-icon
                                v-if="item.feedback === 'positive'"
                                size="x-small"
                                color="success"
                                class="ml-1"
                                >mdi-thumb-up</v-icon
                            >
                            <v-icon
                                v-else-if="item.feedback === 'negative'"
                                size="x-small"
                                color="error"
                                class="ml-1"
                                >mdi-thumb-down</v-icon
                            >
                        </v-list-item-subtitle>
                    </v-list-item>
                </v-list>
            </div>
        </div>

        <!-- Config dialog -->
        <v-dialog v-model="showConfig" max-width="640" persistent>
            <v-card>
                <v-card-title class="d-flex align-center py-4 px-6">
                    <v-icon class="mr-3" color="primary">mdi-tune-variant</v-icon>
                    <span class="text-h6">Configure Briefing</span>
                    <v-spacer />
                    <v-btn icon variant="text" @click="showConfig = false"
                        ><v-icon>mdi-close</v-icon></v-btn
                    >
                </v-card-title>
                <v-divider />
                <div style="max-height: 55vh; overflow-y: auto">
                    <v-card-text class="pa-6">
                        <div class="config-section mb-5">
                            <div class="text-subtitle-2 font-weight-bold mb-2">Report Style</div>
                            <v-btn-toggle
                                v-model="reportConfig.style"
                                mandatory
                                color="primary"
                                divided
                                variant="outlined"
                                class="w-100"
                            >
                                <v-btn value="brief" class="flex-grow-1">Executive Brief</v-btn>
                                <v-btn value="standard" class="flex-grow-1">Standard</v-btn>
                                <v-btn value="detailed" class="flex-grow-1">Detailed</v-btn>
                            </v-btn-toggle>
                        </div>
                        <v-divider class="mb-5" />
                        <div class="config-section mb-5">
                            <div class="text-subtitle-2 font-weight-bold mb-2">Coverage Focus</div>
                            <v-select
                                v-model="reportConfig.focus"
                                :items="focusOptions"
                                item-title="label"
                                item-value="value"
                                variant="outlined"
                                density="comfortable"
                                hide-details
                            />
                        </div>
                        <v-divider class="mb-5" />
                        <div class="config-section mb-5">
                            <div class="text-subtitle-2 font-weight-bold mb-2">Tone</div>
                            <v-radio-group v-model="reportConfig.tone" inline hide-details>
                                <v-radio label="Formal" value="formal" />
                                <v-radio label="Conversational" value="conversational" />
                                <v-radio label="Action-Oriented" value="action" />
                            </v-radio-group>
                        </div>
                        <v-divider class="mb-5" />
                        <div class="config-section mb-5">
                            <div class="text-subtitle-2 font-weight-bold mb-2">Analysis Period</div>
                            <v-btn-toggle
                                v-model="reportConfig.timePeriod"
                                mandatory
                                color="primary"
                                divided
                                variant="outlined"
                                class="w-100"
                            >
                                <v-btn value="7" class="flex-grow-1">7 Days</v-btn>
                                <v-btn value="30" class="flex-grow-1">30 Days</v-btn>
                                <v-btn value="90" class="flex-grow-1">90 Days</v-btn>
                            </v-btn-toggle>
                        </div>
                        <v-divider class="mb-5" />
                        <div class="config-section mb-5">
                            <div class="text-subtitle-2 font-weight-bold mb-2">AI Model</div>
                            <v-select
                                v-model="reportConfig.model"
                                :items="modelOptions"
                                item-title="label"
                                item-value="value"
                                variant="outlined"
                                density="comfortable"
                                hide-details
                            />
                        </div>
                        <v-divider class="mb-5" />
                        <div class="config-section">
                            <div class="d-flex align-center justify-space-between">
                                <div>
                                    <div class="text-subtitle-2 font-weight-bold">
                                        Thinking Mode
                                    </div>
                                    <div class="text-caption text-medium-emphasis">
                                        Deeper reasoning (slower)
                                    </div>
                                </div>
                                <v-switch
                                    v-model="reportConfig.thinkingMode"
                                    color="primary"
                                    hide-details
                                    density="compact"
                                />
                            </div>
                        </div>
                    </v-card-text>
                </div>
                <v-divider />
                <v-card-actions class="pa-4">
                    <v-btn variant="text" @click="resetConfig">Reset</v-btn>
                    <v-spacer />
                    <v-btn variant="text" @click="showConfig = false">Cancel</v-btn>
                    <v-btn color="primary" variant="flat" @click="applyAndGenerate">Generate</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <!-- Copy snackbar -->
        <v-snackbar v-model="snackbar" :timeout="2000" location="bottom" color="success">
            {{ snackbarText }}
        </v-snackbar>
    </div>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue';
    import { marked } from 'marked';
    import DOMPurify from 'dompurify';
    import {
        highlightEntitiesInHtml,
        type SummaryEntityRef,
    } from '~/composables/useEntityHighlighting';
    import { useSummaryExport } from '~/composables/useSummaryExport';
    import {
        usePortfolioSummary,
        type SummaryHistoryItem,
    } from '~/composables/usePortfolioSummary';
    import type { GenerationStep } from '~/components/summary/AgentSteps.vue';

    interface EntityProp {
        resolvedName: string;
        neid: string | null;
        ticker?: string;
        scores: any | null;
        drivers?: any[];
        confidenceLevel?: string;
        coverage?: any;
        monitor?: any;
    }

    interface MacroProp {
        regime?: string;
        synthesis?: string;
        sectorTilt?: string;
        portfolioImplication?: string;
    }

    const props = defineProps<{
        entities: EntityProp[];
        portfolioId: string;
        portfolioName: string;
        /** True when the Summary tab is the active tab. */
        active?: boolean;
        /** Timestamp (ms) of the last completed scan, for cache staleness check. */
        scanCompletedAt?: number | null;
        macro?: MacroProp;
        coverageDetail?: any;
    }>();

    defineEmits<{ requestScan: [] }>();

    const { history, saveToHistory, setFeedback } = usePortfolioSummary(props.portfolioId);
    const { exportSummaryAsHtml } = useSummaryExport();

    // --- State ---
    const generating = ref(false);
    const generationError = ref<string | null>(null);
    const currentSummary = ref<string | null>(null);
    const currentGeneratedAt = ref<string | null>(null);
    const currentCached = ref(false);
    const currentUsage = ref<any | null>(null);
    const currentFeedback = ref<'positive' | 'negative' | null>(null);
    const currentSummaryId = ref<string | null>(null);
    const feedbackLoading = ref(false);
    const showHistory = ref(false);
    const selectedHistoryId = ref<string | null>(null);
    const showAgentDetails = ref(false);
    const lastAgentSteps = ref<GenerationStep[]>([]);
    const generationSteps = ref<GenerationStep[]>([]);
    const showConfig = ref(false);
    const snackbar = ref(false);
    const snackbarText = ref('');

    // --- Config ---
    const defaultConfig = {
        style: 'standard' as 'brief' | 'standard' | 'detailed',
        focus: 'balanced' as 'balanced' | 'risks' | 'regulatory' | 'market',
        tone: 'formal' as 'formal' | 'conversational' | 'action',
        // Keep in sync with GEMINI_DEFAULT_MODEL in server/utils/gemini.ts
        model: 'gemini-2.5-flash',
        thinkingMode: false,
        timePeriod: '30' as '7' | '30' | '90',
    };
    const reportConfig = ref({ ...defaultConfig });

    const focusOptions = [
        { value: 'balanced', label: 'Balanced — all risk signals' },
        { value: 'risks', label: 'Risk Alerts — distress & severity' },
        { value: 'regulatory', label: 'Regulatory — compliance & SEC' },
        { value: 'market', label: 'Market — stock & sentiment' },
    ];

    const modelOptions = [
        // Keep in sync with GEMINI_DEFAULT_MODEL / GEMINI_PRO_MODEL in server/utils/gemini.ts
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (fast)' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (quality)' },
    ];

    // --- Computed ---
    const hasScannedEntities = computed(() => props.entities.some((e) => e.scores != null));

    const entityRefs = computed<SummaryEntityRef[]>(() => {
        const refs: SummaryEntityRef[] = [];
        for (const e of props.entities) {
            refs.push({ name: e.resolvedName, neid: e.neid, type: 'organization' });
            if (e.ticker) refs.push({ name: e.ticker, neid: e.neid, type: 'ticker' });
        }
        return refs;
    });

    const renderedHtml = computed(() => {
        if (!currentSummary.value) return '';
        const raw = marked.parse(currentSummary.value);
        const clean = DOMPurify.sanitize(typeof raw === 'string' ? raw : '', {
            ADD_ATTR: ['href', 'title', 'style', 'data-entity-name'],
        });
        return highlightEntitiesInHtml(clean, entityRefs.value);
    });

    // Build data-source cards from coverageDetail + live counts
    const sourceSummaries = computed(() => {
        const cd = props.coverageDetail;
        const total = props.entities.length;
        return [
            {
                id: 'sec',
                name: 'SEC Filings',
                icon: 'mdi-file-document',
                color: 'blue',
                available: cd ? cd.sec.entities > 0 : props.entities.some((e) => e.coverage?.sec),
                count: cd ? `${cd.sec.entities}/${total}` : undefined,
                sub: cd?.sec.filings ? `${cd.sec.filings} filings` : 'regulatory',
            },
            {
                id: 'news',
                name: 'News & Sentiment',
                icon: 'mdi-newspaper',
                color: 'orange',
                available: cd ? cd.news.entities > 0 : props.entities.some((e) => e.coverage?.news),
                count: cd ? `${cd.news.entities}/${total}` : undefined,
                sub: cd?.news.articles ? `${cd.news.articles} articles` : 'sentiment',
            },
            {
                id: 'stock',
                name: 'Stock Data',
                icon: 'mdi-chart-line',
                color: 'green',
                available: cd
                    ? cd.stock.entities > 0
                    : props.entities.some((e) => e.coverage?.stock),
                count: cd ? `${cd.stock.entities}/${total}` : undefined,
                sub: 'price & technicals',
            },
            {
                id: 'sanctions',
                name: 'Screening',
                icon: 'mdi-shield-alert-outline',
                color: 'red',
                available: cd
                    ? cd.sanctions > 0
                    : props.entities.some((e) => e.coverage?.sanctions),
                count: cd ? `${cd.sanctions}/${total}` : undefined,
                sub: 'OFAC / CSL screening',
            },
            {
                id: 'ownership',
                name: 'Ownership',
                icon: 'mdi-sitemap-outline',
                color: 'indigo',
                available: cd
                    ? cd.ownership.entities > 0
                    : props.entities.some((e) => e.coverage?.ownership),
                count: cd ? `${cd.ownership.links} links` : undefined,
                sub: 'GLEIF / graph',
            },
            {
                id: 'fdic',
                name: 'FDIC',
                icon: 'mdi-bank',
                color: 'cyan',
                available: cd ? cd.fdic > 0 : props.entities.some((e) => e.coverage?.fdic),
                count: cd ? `${cd.fdic}/${total}` : undefined,
                sub: 'bank financials',
            },
        ];
    });

    const chatSuggestions = [
        'Which entities are driving the most portfolio risk?',
        'What themes appear across multiple portfolio companies?',
        'Are there any convergent risk signals I should escalate?',
        'What coverage gaps might understate the risk?',
    ];

    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

    /**
     * Load a cached summary if one exists and is fresh enough, otherwise
     * auto-generate when the tab becomes active and a scan has been run.
     * "Fresh" means generated_at < 4h ago AND generated_at is AFTER the last
     * scan completion (so a re-scan always produces a new briefing).
     */
    function maybeAutoGenerate() {
        if (!hasScannedEntities.value || generating.value) return;

        const newest = history.value[0];
        if (newest) {
            const age = Date.now() - new Date(newest.generated_at).getTime();
            const scanTs = props.scanCompletedAt ?? 0;
            const generatedTs = new Date(newest.generated_at).getTime();
            const freshEnough = age < FOUR_HOURS_MS && generatedTs >= scanTs;
            if (freshEnough) {
                if (!currentSummary.value) loadHistoryItem(newest);
                return;
            }
        }

        // No fresh cache — auto-generate with defaults.
        void generate(false);
    }

    // --- Load history on portfolio change ---
    watch(
        () => props.portfolioId,
        () => {
            currentSummary.value = null;
            generationError.value = null;
            currentUsage.value = null;
            currentFeedback.value = null;
            currentSummaryId.value = null;
            selectedHistoryId.value = null;
            lastAgentSteps.value = [];

            if (history.value.length > 0) {
                loadHistoryItem(history.value[0]);
            }
        },
        { immediate: true }
    );

    // Auto-generate when the tab is opened (active flips to true).
    // immediate: true ensures we run on first mount when the tab is already active.
    watch(
        () => props.active,
        (isActive) => {
            if (isActive) maybeAutoGenerate();
        },
        { immediate: true }
    );

    // Also trigger when scan data lands while the tab is already open.
    watch(hasScannedEntities, (ready) => {
        if (ready && props.active) maybeAutoGenerate();
    });

    // --- Generate ---
    function seedGenerationSteps() {
        generationSteps.value = [
            {
                agent: 'Dialogue Agent',
                icon: 'mdi-forum-outline',
                color: '#26C6DA',
                status: 'completed',
                summary: 'Interpreted request and settings',
            },
            {
                agent: 'History Agent',
                icon: 'mdi-history',
                color: '#42A5F5',
                status: 'completed',
                summary: 'Retrieved portfolio entities',
            },
            {
                agent: 'Analytics Agent',
                icon: 'mdi-chart-line',
                color: '#AB47BC',
                status: 'completed',
                summary: 'Assembled risk signals',
            },
            {
                agent: 'Publisher Agent',
                icon: 'mdi-file-document-edit-outline',
                color: '#66BB6A',
                status: 'working',
                summary: 'Composing briefing…',
            },
        ];
    }

    async function generate(force = false) {
        if (!hasScannedEntities.value) return;
        generating.value = true;
        generationError.value = null;
        currentFeedback.value = null;
        seedGenerationSteps();

        try {
            const res = await $fetch<any>('/api/portfolio-summary/generate', {
                method: 'POST',
                body: {
                    portfolioName: props.portfolioName,
                    entities: props.entities.map((e) => ({
                        resolvedName: e.resolvedName,
                        neid: e.neid,
                        ticker: e.ticker,
                        scores: e.scores,
                        drivers: e.drivers,
                        confidenceLevel: e.confidenceLevel,
                        coverage: e.coverage,
                        monitor: e.monitor,
                    })),
                    macro: props.macro,
                    config: reportConfig.value,
                },
                timeout: 180_000,
            });

            currentSummary.value = res.summary;
            currentGeneratedAt.value = res.generated_at;
            currentCached.value = false;
            currentUsage.value = res.usage ?? null;
            lastAgentSteps.value = res.agent_steps ?? [];

            const saved = saveToHistory({
                summary: res.summary,
                entity_count: res.entity_count ?? props.entities.length,
                generated_at: res.generated_at,
                feedback: null,
                config: {
                    style: reportConfig.value.style,
                    focus: reportConfig.value.focus,
                    tone: reportConfig.value.tone,
                    model: reportConfig.value.model,
                },
                usage: res.usage ?? null,
            });
            currentSummaryId.value = saved.id;

            notify('Briefing generated!');
        } catch (e: any) {
            generationError.value = e.data?.statusMessage || e.message || 'Generation failed';
        } finally {
            generating.value = false;
        }
    }

    function loadHistoryItem(item: SummaryHistoryItem) {
        currentSummary.value = item.summary;
        currentGeneratedAt.value = item.generated_at;
        currentCached.value = true;
        currentFeedback.value = item.feedback;
        currentSummaryId.value = item.id;
        currentUsage.value = item.usage ?? null;
        selectedHistoryId.value = item.id;
        lastAgentSteps.value = [];
        showAgentDetails.value = false;
    }

    async function submitFeedback(type: 'positive' | 'negative') {
        if (!currentSummaryId.value || currentFeedback.value === type) return;
        feedbackLoading.value = true;
        try {
            setFeedback(currentSummaryId.value, type);
            currentFeedback.value = type;
        } finally {
            feedbackLoading.value = false;
        }
    }

    // --- Config helpers ---
    function resetConfig() {
        reportConfig.value = { ...defaultConfig };
    }

    function applyAndGenerate() {
        showConfig.value = false;
        generate(true);
    }

    // --- Export ---
    function exportPDF() {
        if (!currentSummary.value) return;
        const printWin = window.open('', '_blank', 'width=800,height=600');
        if (!printWin) {
            notify('Please allow popups to export PDF');
            return;
        }

        const dateStr = currentGeneratedAt.value ? formatDate(currentGeneratedAt.value) : '';
        const reportHtml = renderedHtml.value;

        printWin.document
            .write(`<!DOCTYPE html><html><head><title>Portfolio Briefing - ${escapeHtml(props.portfolioName)}</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11pt; line-height: 1.65; color: #2c3e50; padding: .75in; max-width: 8.5in; margin: 0 auto; }
.header { border-bottom: 2px solid #333; padding-bottom: 1rem; margin-bottom: 1.5rem; }
.header-label { font-size: 10pt; color: #666; text-transform: uppercase; letter-spacing: .1em; margin-bottom: .25rem; }
.header-title { font-size: 18pt; font-weight: bold; }
.header-meta { font-size: 10pt; color: #666; margin-top: .5rem; }
h1 { font-size: 14pt; font-weight: 600; margin-top: 1.5rem; margin-bottom: .75rem; padding-bottom: .4rem; border-bottom: 2px solid #10b981; }
h2 { font-size: 12pt; font-weight: 600; margin-top: 1.25rem; margin-bottom: .5rem; }
h3 { font-size: 11pt; font-weight: 600; margin-top: 1rem; margin-bottom: .4rem; }
p { margin-bottom: .75rem; color: #4a5568; }
ul, ol { margin-bottom: 1rem; padding-left: 1.5rem; }
li { margin-bottom: .5rem; line-height: 1.65; page-break-inside: avoid; }
strong { font-weight: 600; color: #1a202c; }
em { font-style: italic; color: #718096; font-size: .9em; }
a.entity-highlight { color: #42A5F5 !important; border-bottom: 1px dashed #42A5F5; text-decoration: none; font-weight: 500; }
.footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 9pt; color: #94a3b8; text-align: center; }
@media print { body { padding: 0; } @page { margin: .75in; size: letter; } }
</style></head><body>
<div class="header">
  <div class="header-label">Portfolio Risk Briefing</div>
  <div class="header-title">${escapeHtml(props.portfolioName)}</div>
  <div class="header-meta">Generated: ${escapeHtml(dateStr)} · ${props.entities.length} entities</div>
</div>
${reportHtml}
<div class="footer">Generated by Prism</div>
</body></html>`);
        printWin.document.close();
        printWin.onload = () => setTimeout(() => printWin.print(), 250);
    }

    function exportHTML() {
        if (!currentSummary.value) return;
        exportSummaryAsHtml({
            title: props.portfolioName,
            subtitle: 'Portfolio Risk Briefing',
            summaryMarkdown: currentSummary.value,
            generatedAt: currentGeneratedAt.value,
            filenamePrefix: 'prism-briefing',
            entityCount: props.entities.length,
            model: currentUsage.value?.model,
        });
        notify('HTML exported');
    }

    async function copyClipboard() {
        if (!currentSummary.value) return;
        await navigator.clipboard.writeText(currentSummary.value);
        notify('Copied to clipboard!');
    }

    // --- Helpers ---
    function notify(msg: string) {
        snackbarText.value = msg;
        snackbar.value = true;
    }

    function formatDate(d: string | null): string {
        if (!d) return '';
        return new Date(d).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    }

    function formatShortDate(d?: string | null): string {
        if (!d) return '';
        return new Date(d).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        });
    }

    function escapeHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
</script>

<style scoped>
    .portfolio-summary-tab {
        background: var(--lovelace-surface, transparent);
    }

    .summary-header {
        background: linear-gradient(
            135deg,
            rgba(var(--dynamic-primary-rgb), 0.04) 0%,
            transparent 60%
        );
    }

    .summary-scroll {
        background: rgba(var(--v-theme-surface), 0.5);
    }

    /* Source coverage grid */
    .sources-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 10px;
    }

    .source-card {
        padding: 12px;
        background: rgba(var(--v-theme-surface-variant), 0.4);
        border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
        border-radius: 6px;
        opacity: 0.45;
        transition: opacity 0.2s;
    }

    .source-card.available {
        opacity: 1;
        border-color: rgba(var(--dynamic-primary-rgb), 0.15);
        background: linear-gradient(
            135deg,
            rgba(var(--v-theme-surface-variant), 0.4) 0%,
            rgba(var(--dynamic-primary-rgb), 0.03) 100%
        );
    }

    .source-header {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
    }

    .source-name {
        font-weight: 600;
        font-size: 0.8125rem;
        flex: 1;
    }

    .source-sub {
        font-size: 0.73rem;
        margin-top: 2px;
    }

    /* Briefing article */
    .briefing-body :deep(h1) {
        font-size: 1.15rem;
        font-weight: 600;
        margin-top: 1.5rem;
        margin-bottom: 0.75rem;
        padding-bottom: 0.4rem;
        border-bottom: 2px solid rgba(var(--dynamic-primary-rgb), 0.5);
    }

    .briefing-body :deep(h2) {
        font-size: 1rem;
        font-weight: 600;
        margin-top: 1.25rem;
        margin-bottom: 0.5rem;
        color: rgba(var(--v-theme-on-surface), 0.9);
    }

    .briefing-body :deep(h3) {
        font-size: 0.9375rem;
        font-weight: 600;
        margin-top: 1rem;
        margin-bottom: 0.4rem;
    }

    .briefing-body :deep(p) {
        margin-bottom: 0.75rem;
        line-height: 1.65;
    }

    .briefing-body :deep(ul),
    .briefing-body :deep(ol) {
        margin-bottom: 1rem;
        padding-left: 1.5rem;
    }

    .briefing-body :deep(li) {
        margin-bottom: 0.5rem;
        line-height: 1.65;
    }

    .briefing-body :deep(strong) {
        font-weight: 600;
    }

    .briefing-body :deep(em) {
        font-style: italic;
        font-size: 0.875em;
        opacity: 0.8;
    }

    .briefing-body :deep(a.entity-highlight:hover) {
        opacity: 0.85;
        text-decoration: underline;
    }

    /* History sidebar */
    .history-sidebar {
        width: 240px;
    }

    .history-list {
        max-height: calc(100vh - 200px);
    }

    /* Config */
    .config-section .w-100 {
        width: 100%;
    }

    .gap-2 {
        gap: 8px;
    }
    .gap-3 {
        gap: 12px;
    }

    @media print {
        .portfolio-summary-tab {
            display: block !important;
            overflow: visible !important;
            height: auto !important;
        }
    }
</style>
