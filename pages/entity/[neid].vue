<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-4 page-header">
            <div class="d-flex align-center">
                <v-btn
                    icon="mdi-arrow-left"
                    variant="text"
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
                    {{ tierLabel(data.scores.tier) }} risk · {{ data.scores.fused }}
                </v-chip>
                <v-btn
                    variant="text"
                    prepend-icon="mdi-refresh"
                    :loading="loading"
                    @click="refresh(weights)"
                >
                    Refresh
                </v-btn>
            </div>
        </div>

        <div class="flex-grow-1 overflow-y-auto pa-4">
            <v-progress-linear v-if="loading" indeterminate class="mb-4" />
            <v-alert v-if="error" type="error" variant="tonal" class="mb-3">
                {{ error }}
            </v-alert>

            <template v-if="data">
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
                        <v-card class="pa-4 mb-3">
                            <div class="text-subtitle-2 mb-3">Lens Detail</div>
                            <LensDetailPanel
                                :scores="data.scores"
                                :seed="data.neid"
                                :lens-details="data.lensDetails"
                            />
                        </v-card>

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
                                        <div class="text-h6 font-mono">{{ signal.value }}%</div>
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
                                                <span class="text-caption text-medium-emphasis">
                                                    · {{ r.relationship }}
                                                </span>
                                            </li>
                                        </ul>
                                    </v-card>
                                </v-col>
                            </v-row>
                        </v-card>

                        <v-card class="pa-4">
                            <div class="text-subtitle-2 mb-3">Events Timeline</div>
                            <div class="timeline">
                                <div
                                    v-for="ev in data.events"
                                    :key="ev.date + ev.title"
                                    class="timeline-row"
                                >
                                    <span class="ts font-mono text-caption text-medium-emphasis">
                                        {{ ev.date }}
                                    </span>
                                    <v-chip
                                        size="x-small"
                                        :color="severityColor(ev.severity)"
                                        variant="tonal"
                                        label
                                    >
                                        {{ ev.category }}
                                    </v-chip>
                                    <span class="title-text text-body-2">{{ ev.title }}</span>
                                </div>
                            </div>
                        </v-card>
                    </v-col>
                </v-row>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue';

    import { useEntityProfile } from '~/composables/useEntityProfile';
    import { usePortfolio } from '~/composables/usePortfolio';
    import { tierColor, tierLabel } from '~/composables/useFusedScoring';
    import { useMacroContext } from '~/composables/useRelationships';

    const route = useRoute();
    const neid = computed(() => route.params.neid as string);

    const { activePortfolio, weights, saveAssessment } = usePortfolio();

    const entityFromPortfolio = computed(() =>
        activePortfolio.value?.entities.find((e) => e.neid === neid.value)
    );

    const neidRef = ref(neid.value);
    watch(neid, (v) => (neidRef.value = v));
    const { data, loading, error, refresh } = useEntityProfile(neidRef);
    const { signals: macroSignals } = useMacroContext();

    function severityColor(s: 'low' | 'medium' | 'high') {
        return s === 'high' ? 'error' : s === 'medium' ? 'warning' : 'info';
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

    function onSaveAssessment(a: { tier: any; justification: string }) {
        if (!activePortfolio.value || !neid.value) return;
        saveAssessment(activePortfolio.value.id, neid.value, a.tier, a.justification);
    }
</script>

<style scoped>
    .page-header {
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(0, 0, 0, 0.3);
    }

    .relation-card {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.04);
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

    .timeline {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .timeline-row {
        display: grid;
        grid-template-columns: 100px 130px 1fr;
        gap: 12px;
        align-items: center;
        padding: 6px 0;
        border-bottom: 1px dashed rgba(255, 255, 255, 0.04);
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
