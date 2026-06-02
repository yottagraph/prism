<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-4 page-header">
            <div class="d-flex align-center">
                <v-btn
                    icon="mdi-arrow-left"
                    variant="text"
                    aria-label="Back to portfolio"
                    @click="$router.push('/')"
                    class="mr-2"
                />
                <div>
                    <div class="text-h5">
                        {{ data?.name || entityFromPortfolio?.resolvedName || 'Loading…' }}
                    </div>
                    <div class="text-caption text-medium-emphasis font-mono">{{ neid }}</div>
                </div>
                <v-spacer />
                <v-chip v-if="data?.ticker" size="small" variant="tonal" class="mr-2">
                    {{ data.ticker }}
                </v-chip>
                <v-chip v-if="data?.cik" size="small" variant="tonal" class="mr-2">
                    CIK {{ data.cik }}
                </v-chip>
                <v-chip v-if="data?.sector" size="small" variant="tonal" class="mr-2">
                    {{ data.sector }}
                </v-chip>
                <v-chip v-if="data?.entityType" size="small" variant="tonal" class="mr-2">
                    {{ data.entityType }}
                </v-chip>
                <v-chip v-if="data?.scores" :color="tierColor(data.scores.tier)" label class="mr-2">
                    {{ tierLabel(data.scores.tier) }} risk
                </v-chip>
                <v-btn
                    variant="text"
                    prepend-icon="mdi-refresh"
                    :loading="loading || stockLoading"
                    @click="onRefresh"
                >
                    Refresh
                </v-btn>
            </div>
            <div
                v-if="loading || stockLoading"
                class="d-inline-flex align-center text-caption text-medium-emphasis mt-2"
            >
                <v-progress-circular
                    size="12"
                    width="2"
                    indeterminate
                    color="primary"
                    class="mr-2"
                />
                {{ activeTab === 'stock' ? stockStatusMessage : overviewStatusMessage }}
                <span v-if="entityElapsedText" class="ml-2 font-mono">
                    · {{ entityElapsedText }}
                </span>
            </div>
        </div>

        <div class="flex-grow-1 overflow-y-auto pa-4">
            <v-tabs v-model="activeTab" class="mb-3">
                <v-tab value="overview">Overview</v-tab>
                <v-tab value="fhs">
                    <v-chip
                        v-if="data?.scores?.solvency != null"
                        :color="scoreLabelColor(data.scores.solvency)"
                        size="x-small"
                        label
                        class="mr-1"
                        >{{ scoreToLabel(data.scores.solvency).charAt(0).toUpperCase() }}</v-chip
                    >
                    FHS
                </v-tab>
                <v-tab value="ers">
                    <v-chip
                        v-if="data?.scores?.executive != null"
                        :color="scoreLabelColor(data.scores.executive)"
                        size="x-small"
                        label
                        class="mr-1"
                        >{{ scoreToLabel(data.scores.executive).charAt(0).toUpperCase() }}</v-chip
                    >
                    ERS
                </v-tab>
                <v-tab value="acs">
                    <v-chip
                        v-if="data?.scores?.compliance != null"
                        :color="scoreLabelColor(data.scores.compliance)"
                        size="x-small"
                        label
                        class="mr-1"
                        >{{ scoreToLabel(data.scores.compliance).charAt(0).toUpperCase() }}</v-chip
                    >
                    ACS
                </v-tab>
                <v-tab value="events">Events</v-tab>
                <v-tab value="stock">Stock</v-tab>
            </v-tabs>

            <v-progress-linear v-if="loading" indeterminate class="mb-4" />
            <v-alert v-if="error" type="error" variant="tonal" class="mb-3">{{ error }}</v-alert>
            <v-alert
                v-if="stockError && activeTab === 'stock'"
                type="warning"
                variant="tonal"
                class="mb-3"
            >
                {{ stockError }}
            </v-alert>

            <v-window v-model="activeTab">
                <!-- ===== OVERVIEW TAB ===== -->
                <v-window-item value="overview">
                    <v-alert
                        v-if="!loading && !data && !error"
                        type="info"
                        variant="tonal"
                        density="compact"
                        class="mb-3"
                        text="No profile data available for this entity. Analyze to populate scores."
                    />
                    <template v-if="data">
                        <!-- Descriptive card -->
                        <EntityDescriptiveCard :data="data" />

                        <v-row dense>
                            <v-col cols="12" md="5">
                                <v-card class="pa-4 mb-3">
                                    <div class="text-subtitle-2 mb-3">Score Strip</div>
                                    <EntityScoreStrip
                                        :scores="data.scores"
                                        :conflicts="data.conflicts"
                                        :confidence-level="data.confidenceLevel"
                                    />
                                </v-card>

                                <v-card class="pa-4 mb-3">
                                    <div class="text-subtitle-2 mb-3">Top Risk Drivers</div>
                                    <RiskDriverCards :drivers="data.drivers" />
                                </v-card>

                                <AssessmentBlock
                                    :model-value="entityFromPortfolio?.assessment"
                                    @save="onSaveAssessment"
                                />
                            </v-col>

                            <v-col cols="12" md="7">
                                <!-- Lens snapshot cards -->
                                <div class="text-subtitle-2 mb-2">Lens Highlights</div>
                                <v-row dense class="mb-3">
                                    <v-col cols="12" sm="4">
                                        <EntityLensSnapshot
                                            title="Financial Health"
                                            source-tag="FHS"
                                            chip-color="primary"
                                            :score="data.scores?.solvency"
                                            :highlights="fhsHighlights"
                                            @navigate="activeTab = 'fhs'"
                                        />
                                    </v-col>
                                    <v-col cols="12" sm="4">
                                        <EntityLensSnapshot
                                            title="Executive Risk"
                                            source-tag="ERS"
                                            chip-color="secondary"
                                            :score="data.scores?.executive"
                                            :highlights="ersHighlights"
                                            @navigate="activeTab = 'ers'"
                                        />
                                    </v-col>
                                    <v-col cols="12" sm="4">
                                        <EntityLensSnapshot
                                            title="Adversarial Capital"
                                            source-tag="ACS"
                                            chip-color="error"
                                            :score="data.scores?.compliance"
                                            :highlights="acsHighlights"
                                            @navigate="activeTab = 'acs'"
                                        />
                                    </v-col>
                                </v-row>

                                <v-card class="pa-4 mb-3">
                                    <div class="text-subtitle-2 mb-3">Macro Context</div>
                                    <v-row dense>
                                        <v-col
                                            v-for="signal in macroSignals"
                                            :key="signal.label"
                                            cols="12"
                                            sm="6"
                                        >
                                            <v-sheet class="pa-3 relation-card">
                                                <div class="text-caption text-medium-emphasis">
                                                    {{ signal.label }}
                                                </div>
                                                <div class="text-h6 font-mono">
                                                    {{ signal.value }}%
                                                </div>
                                                <div class="text-caption">{{ signal.note }}</div>
                                            </v-sheet>
                                        </v-col>
                                    </v-row>
                                </v-card>

                                <v-card class="pa-4 mb-3">
                                    <div class="d-flex align-center mb-3">
                                        <div class="text-subtitle-2">Relationships Summary</div>
                                        <v-spacer />
                                        <v-btn
                                            size="small"
                                            variant="text"
                                            append-icon="mdi-arrow-right"
                                            @click="$router.push('/relationships')"
                                        >
                                            Explore all
                                        </v-btn>
                                    </div>
                                    <v-row dense>
                                        <v-col
                                            v-for="(group, key) in data.relationships"
                                            :key="key"
                                            cols="12"
                                            sm="6"
                                        >
                                            <v-card variant="flat" class="pa-3 relation-card">
                                                <div class="d-flex align-center mb-2">
                                                    <v-icon
                                                        size="small"
                                                        :color="relationColor(String(key))"
                                                        class="mr-2"
                                                    >
                                                        {{ relationIcon(String(key)) }}
                                                    </v-icon>
                                                    <span class="text-overline">{{ key }}</span>
                                                    <v-spacer />
                                                    <span class="text-caption text-medium-emphasis">
                                                        {{ (group as any[]).length }}
                                                    </span>
                                                </div>
                                                <ul class="rel-list">
                                                    <li
                                                        v-for="r in (group as any[]).slice(0, 4)"
                                                        :key="r.neid"
                                                    >
                                                        {{ r.name }}
                                                        <span
                                                            class="text-caption text-medium-emphasis"
                                                        >
                                                            · {{ r.relationship }}
                                                        </span>
                                                    </li>
                                                </ul>
                                            </v-card>
                                        </v-col>
                                    </v-row>
                                </v-card>
                            </v-col>
                        </v-row>
                    </template>
                </v-window-item>

                <!-- ===== FHS TAB ===== -->
                <v-window-item value="fhs">
                    <v-alert
                        v-if="!loading && !data"
                        type="info"
                        variant="tonal"
                        density="compact"
                        class="mb-3"
                        text="Analyze to populate FHS data."
                    />
                    <EntityFhsSection
                        v-if="data"
                        :scores="data.scores"
                        :lens-details="data.lensDetails"
                        :fhs-monitor="
                            (data as any).monitor?.fhs ?? entityFromPortfolio?.monitor?.fhs
                        "
                    />
                </v-window-item>

                <!-- ===== ERS TAB ===== -->
                <v-window-item value="ers">
                    <v-alert
                        v-if="!loading && !data"
                        type="info"
                        variant="tonal"
                        density="compact"
                        class="mb-3"
                        text="Analyze to populate ERS data."
                    />
                    <EntityErsSection
                        v-if="data"
                        :scores="data.scores"
                        :lens-details="data.lensDetails"
                        :ers-monitor="
                            (data as any).monitor?.ers ?? entityFromPortfolio?.monitor?.ers
                        "
                    />
                </v-window-item>

                <!-- ===== ACS TAB ===== -->
                <v-window-item value="acs">
                    <v-alert
                        v-if="!loading && !data"
                        type="info"
                        variant="tonal"
                        density="compact"
                        class="mb-3"
                        text="Analyze to populate ACS data."
                    />
                    <EntityAcsSection
                        v-if="data"
                        :scores="data.scores"
                        :lens-details="data.lensDetails"
                        :sanction-data="
                            (data as any).monitor?.sanctions ??
                            entityFromPortfolio?.monitor?.sanctions
                        "
                        :acs-detail-data="
                            (data as any).monitor?.acsDetail ??
                            entityFromPortfolio?.monitor?.acsDetail
                        "
                    />
                </v-window-item>

                <!-- ===== EVENTS TAB ===== -->
                <v-window-item value="events">
                    <EntityEventsView :events="profileEvents" :loading="loading" />
                </v-window-item>

                <!-- ===== STOCK TAB ===== -->
                <v-window-item value="stock">
                    <StockEntityTab
                        :stock="stockData"
                        :loading="stockLoading"
                        :error="stockError"
                        :events="data?.events || []"
                        @refresh="loadStock(true)"
                    />
                </v-window-item>
            </v-window>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

    import { useEntityProfile } from '~/composables/useEntityProfile';
    import { useEntityStockProfile } from '~/composables/useEntityStockProfile';
    import { usePortfolio } from '~/composables/usePortfolio';
    import {
        tierColor,
        tierLabel,
        scoreToLabel,
        scoreLabelColor,
    } from '~/composables/useFusedScoring';
    import { useMacroContext } from '~/composables/useRelationships';
    import CitationChip from '~/components/CitationChip.vue';
    import StockEntityTab from '~/components/entity/StockEntityTab.vue';
    import EntityDescriptiveCard from '~/components/entity/EntityDescriptiveCard.vue';
    import EntityLensSnapshot from '~/components/entity/EntityLensSnapshot.vue';
    import EntityFhsSection from '~/components/entity/EntityFhsSection.vue';
    import EntityErsSection from '~/components/entity/EntityErsSection.vue';
    import EntityAcsSection from '~/components/entity/EntityAcsSection.vue';
    import EntityEventsView from '~/components/entity/EntityEventsView.vue';

    const route = useRoute();
    const router = useRouter();
    const neid = computed(() => route.params.neid as string);

    const { activePortfolio, weights, saveAssessment } = usePortfolio();

    const entityFromPortfolio = computed(() =>
        activePortfolio.value?.entities.find((e) => e.neid === neid.value)
    );

    const neidRef = ref(neid.value);
    watch(neid, (v) => (neidRef.value = v));
    const {
        data,
        loading,
        error,
        refresh,
        statusMessage: overviewStatusMessage,
    } = useEntityProfile(neidRef);
    const {
        data: stockData,
        loading: stockLoading,
        error: stockError,
        statusMessage: stockStatusMessage,
        load: loadStockProfile,
        clear: clearStockCache,
    } = useEntityStockProfile();
    const { signals: macroSignals } = useMacroContext();

    // Sync tab with ?tab= query param
    const activeTab = ref<'overview' | 'fhs' | 'ers' | 'acs' | 'events' | 'stock'>(
        (route.query.tab as any) || 'overview'
    );
    watch(activeTab, (tab) => {
        router.replace({ query: { ...route.query, tab: tab === 'overview' ? undefined : tab } });
    });
    watch(
        () => route.query.tab,
        (tab) => {
            if (tab && tab !== activeTab.value) {
                activeTab.value = (tab as any) || 'overview';
            }
        }
    );

    // Elapsed timer
    const nowMs = ref(Date.now());
    const loadStartedAt = ref<number | null>(null);
    const loadEndedAt = ref<number | null>(null);
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

    const isLoading = computed(() => loading.value || stockLoading.value);
    watch(isLoading, (val) => {
        if (val) {
            loadStartedAt.value = Date.now();
            loadEndedAt.value = null;
        } else {
            loadEndedAt.value = Date.now();
        }
    });

    const entityElapsedText = computed(() => {
        const start = loadStartedAt.value;
        if (!start) return null;
        const end = isLoading.value ? nowMs.value : (loadEndedAt.value ?? nowMs.value);
        const elapsedSec = Math.max(0, Math.floor((end - start) / 1000));
        const minutes = Math.floor(elapsedSec / 60);
        const seconds = elapsedSec % 60;
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    });

    async function loadStock(force = false) {
        const portfolioId = activePortfolio.value?.id;
        if (!portfolioId || !neid.value) return;
        const hint =
            data.value?.name ||
            entityFromPortfolio.value?.resolvedName ||
            entityFromPortfolio.value?.inputName ||
            undefined;
        await loadStockProfile(portfolioId, neid.value, force, hint).catch(() => undefined);
    }

    watch(activeTab, async (value) => {
        if (value === 'stock') await loadStock(false);
    });

    watch(neid, () => {
        activeTab.value = 'overview';
        const portfolioId = activePortfolio.value?.id;
        if (portfolioId) clearStockCache(portfolioId, neid.value);
    });

    function onSaveAssessment(a: { tier: any; justification: string }) {
        if (!activePortfolio.value || !neid.value) return;
        saveAssessment(activePortfolio.value.id, neid.value, a.tier, a.justification);
    }

    async function onRefresh() {
        if (activeTab.value === 'stock') {
            await loadStock(true);
            return;
        }
        refresh(weights.value);
    }

    // Lens highlights for overview snapshot cards (pull from lensDetails findings)
    const fhsHighlights = computed(() => {
        const findings = data.value?.lensDetails?.solvency?.findings ?? [];
        const fhs = (data.value as any)?.monitor?.fhs ?? entityFromPortfolio.value?.monitor?.fhs;
        const items: string[] = [];
        if (fhs?.trendDirection === 'worsening') items.push('Leverage trending upward');
        if (fhs?.totalDistressEvents)
            items.push(`${fhs.totalDistressEvents} distress event(s) detected`);
        if (!items.length && findings.length) items.push(findings[0].text.slice(0, 80));
        return items;
    });

    const ersHighlights = computed(() => {
        const ers = (data.value as any)?.monitor?.ers ?? entityFromPortfolio.value?.monitor?.ers;
        const items: string[] = [];
        if (ers?.departures12m) items.push(`${ers.departures12m} departure(s) in last 12 months`);
        if (ers?.auditorChanges12m) items.push(`${ers.auditorChanges12m} auditor change(s)`);
        if (ers?.isSystemic) items.push('Systemic departure pattern detected');
        if (!items.length) {
            const findings = data.value?.lensDetails?.executive?.findings ?? [];
            if (findings.length) items.push(findings[0].text.slice(0, 80));
        }
        return items;
    });

    const acsHighlights = computed(() => {
        const sanctions =
            (data.value as any)?.monitor?.sanctions ??
            entityFromPortfolio.value?.monitor?.sanctions;
        const acsD =
            (data.value as any)?.monitor?.acsDetail ??
            entityFromPortfolio.value?.monitor?.acsDetail;
        const items: string[] = [];
        if (sanctions?.listed)
            items.push(
                `Sanctions listed${sanctions.authority ? ` by ${sanctions.authority}` : ''}`
            );
        if (acsD?.pathMatchCount) items.push(`${acsD.pathMatchCount} ownership-path match(es)`);
        if (acsD?.jurisdictionHits?.length)
            items.push(`${acsD.jurisdictionHits.length} high-risk jurisdiction(s)`);
        if (!items.length) {
            const findings = data.value?.lensDetails?.compliance?.findings ?? [];
            if (findings.length) items.push(findings[0].text.slice(0, 80));
        }
        return items;
    });

    // Events tab — annotate events with source tag
    const profileEvents = computed(() => {
        const raw = data.value?.events ?? [];
        return raw.map((ev) => ({
            ...ev,
            source: ev.source ?? inferSource(ev.category, ev.title),
        }));
    });

    function inferSource(category: string, title = ''): string {
        const upper = `${category || ''} ${title || ''}`.toUpperCase();
        if (
            upper.includes('STOCK') ||
            upper.includes('PRICE') ||
            upper.includes('MARKET') ||
            upper.includes('TRADING')
        )
            return 'STOCK';
        if (upper.includes('NEWS') || upper.includes('PRESS') || upper.includes('MEDIA'))
            return 'NEWS';
        if (upper.includes('POLYMARKET') || upper.includes('PREDICTION')) return 'POLY';
        // Default — SEC/EDGAR covers most corporate events
        return 'SEC';
    }

    function relationIcon(k: string) {
        switch (k) {
            case 'companies':
                return 'mdi-domain';
            case 'people':
                return 'mdi-account';
            case 'instruments':
                return 'mdi-bank';
            case 'locations':
                return 'mdi-map-marker';
            default:
                return 'mdi-link-variant';
        }
    }

    function relationColor(k: string) {
        switch (k) {
            case 'companies':
                return 'info';
            case 'people':
                return 'success';
            case 'instruments':
                return 'warning';
            case 'locations':
                return 'error';
            default:
                return 'grey';
        }
    }
</script>

<style scoped>
    .page-header {
        border-bottom: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
        background: rgba(var(--dynamic-bg-rgb), 0.3);
    }
    .relation-card {
        background: rgba(var(--dynamic-fg-rgb), 0.02);
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.04);
    }
    .rel-list {
        list-style: none;
        padding-left: 0;
        margin: 0;
    }
    .rel-list li {
        padding: 2px 0;
        font-size: 0.875rem;
    }
    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
