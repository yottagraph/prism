<template>
    <div>
        <!-- Score header -->
        <v-card class="pa-4 mb-3">
            <div class="d-flex align-center mb-3">
                <v-chip size="x-small" color="primary" label class="mr-2">SEC</v-chip>
                <span class="text-subtitle-2">Executive Risk Score (ERS)</span>
                <v-spacer />
                <v-chip
                    v-if="scores?.executive != null"
                    :color="scoreLabelColor(scores.executive)"
                    label
                    class="mr-2"
                >
                    {{ tierLabel(scoreToLabel(scores.executive)) }} risk
                </v-chip>
            </div>
            <div class="text-body-2 text-medium-emphasis">
                Governance and key-person stability derived from officer/director relationships,
                departure signals, C-suite coverage, and 8-K Item 5.02 filings.
            </div>
        </v-card>

        <!-- Governance snapshot -->
        <v-card class="pa-4 mb-3" v-if="ersMonitor">
            <div class="text-subtitle-2 mb-3">Governance Snapshot</div>
            <v-row dense>
                <v-col cols="6" sm="3">
                    <div class="text-caption text-medium-emphasis text-uppercase">Officers</div>
                    <div class="text-h6 font-mono mt-1">{{ ersMonitor.officerCount }}</div>
                </v-col>
                <v-col cols="6" sm="3">
                    <div class="text-caption text-medium-emphasis text-uppercase">Directors</div>
                    <div class="text-h6 font-mono mt-1">{{ ersMonitor.directorCount }}</div>
                </v-col>
                <v-col cols="6" sm="3">
                    <div class="text-caption text-medium-emphasis text-uppercase">C-suite</div>
                    <div class="text-h6 font-mono mt-1">{{ ersMonitor.cSuiteCount }}</div>
                </v-col>
                <v-col cols="6" sm="3">
                    <div class="text-caption text-medium-emphasis text-uppercase">
                        Key person risk
                    </div>
                    <div class="mt-1">
                        <v-chip
                            :color="riskColor(ersMonitor.keyPersonRisk)"
                            size="small"
                            label
                            variant="tonal"
                        >
                            {{ ersMonitor.keyPersonRisk }}
                        </v-chip>
                    </div>
                </v-col>
            </v-row>

            <div v-if="ersMonitor.cSuiteRoles.length" class="mt-3">
                <div class="text-caption text-medium-emphasis text-uppercase mb-1">
                    C-suite roles
                </div>
                <div class="d-flex flex-wrap ga-1">
                    <v-chip
                        v-for="role in ersMonitor.cSuiteRoles"
                        :key="role"
                        size="x-small"
                        variant="tonal"
                        label
                    >
                        {{ role }}
                    </v-chip>
                </div>
            </div>
        </v-card>

        <!-- Departures -->
        <v-card class="pa-4 mb-3">
            <div class="text-subtitle-2 mb-3">
                Executive Departures
                <v-chip
                    v-if="ersMonitor?.departures12m"
                    size="x-small"
                    :color="ersMonitor.isSystemic ? 'error' : 'warning'"
                    label
                    class="ml-2"
                >
                    {{ ersMonitor.departures12m }} in 12m
                </v-chip>
                <v-chip
                    v-if="ersMonitor?.isSystemic"
                    size="x-small"
                    color="error"
                    label
                    class="ml-1"
                >
                    Systemic
                </v-chip>
            </div>
            <v-row dense v-if="ersMonitor">
                <v-col cols="12" sm="4">
                    <div class="text-caption text-medium-emphasis text-uppercase">Last 90 days</div>
                    <div
                        class="text-h6 font-mono mt-1"
                        :class="ersMonitor.departures90d > 0 ? 'text-error' : ''"
                    >
                        {{ ersMonitor.departures90d }}
                    </div>
                </v-col>
                <v-col cols="12" sm="4">
                    <div class="text-caption text-medium-emphasis text-uppercase">
                        Last 12 months
                    </div>
                    <div
                        class="text-h6 font-mono mt-1"
                        :class="ersMonitor.departures12m > 1 ? 'text-warning' : ''"
                    >
                        {{ ersMonitor.departures12m }}
                    </div>
                </v-col>
                <v-col cols="12" sm="4">
                    <div class="text-caption text-medium-emphasis text-uppercase">
                        Auditor changes
                    </div>
                    <div
                        class="text-h6 font-mono mt-1"
                        :class="ersMonitor.auditorChanges12m > 0 ? 'text-error' : ''"
                    >
                        {{ ersMonitor.auditorChanges12m }}
                    </div>
                </v-col>
            </v-row>
            <v-alert
                v-if="!ersMonitor?.departures12m && !ersMonitor?.departures90d"
                density="compact"
                variant="tonal"
                type="success"
                class="mt-2"
            >
                No officer or director departures detected in the last 12 months.
            </v-alert>
        </v-card>

        <!-- Governance flags -->
        <v-card class="pa-4 mb-3" v-if="ersMonitor?.governanceFlags?.length">
            <div class="text-subtitle-2 mb-2">Governance Flags</div>
            <div class="d-flex flex-wrap ga-2">
                <v-chip
                    v-for="flag in ersMonitor.governanceFlags"
                    :key="flag"
                    size="small"
                    color="warning"
                    label
                    variant="tonal"
                >
                    <v-icon start size="small">mdi-flag</v-icon>
                    {{ flag }}
                </v-chip>
            </div>
        </v-card>

        <!-- Evidence findings -->
        <v-card class="pa-4" v-if="executiveDetail?.findings?.length">
            <div class="text-subtitle-2 mb-3">Evidence</div>
            <div class="finding-list">
                <v-card
                    v-for="(finding, idx) in executiveDetail.findings"
                    :key="idx"
                    class="finding-card mb-2 pa-3"
                    variant="flat"
                >
                    <div class="text-body-2">{{ finding.text }}</div>
                    <div v-if="finding.citations?.length" class="d-flex flex-wrap ga-2 mt-2">
                        <CitationChip
                            v-for="(citation, cidx) in finding.citations"
                            :key="cidx"
                            :citation="citation"
                        />
                    </div>
                </v-card>
            </div>
        </v-card>
    </div>
</template>

<script setup lang="ts">
    import { scoreToLabel, scoreLabelColor, tierLabel } from '~/composables/useFusedScoring';
    import type { EntityRiskScore } from '~/composables/useFusedScoring';
    import CitationChip from '~/components/CitationChip.vue';

    const props = defineProps<{
        scores?: EntityRiskScore | null;
        lensDetails?: Record<
            string,
            {
                metrics: Array<{ label: string; value: string }>;
                findings: Array<{ text: string; date?: string; citations: any[] }>;
            }
        >;
        ersMonitor?: {
            departures12m: number;
            departures90d: number;
            officerCount: number;
            directorCount: number;
            cSuiteCount: number;
            cSuiteRoles: string[];
            auditorChanges12m: number;
            isSystemic: boolean;
            governanceFlags: string[];
            keyPersonRisk: string;
        } | null;
    }>();

    const executiveDetail = computed(() => props.lensDetails?.executive);

    function riskColor(level: string) {
        switch (level) {
            case 'critical':
                return 'error';
            case 'high':
                return 'warning';
            case 'medium':
                return 'info';
            default:
                return 'success';
        }
    }
</script>

<style scoped>
    .finding-card {
        background: rgba(var(--dynamic-fg-rgb), 0.02);
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
    }
    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
