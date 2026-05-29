<template>
    <div>
        <!-- Score header -->
        <v-card class="pa-4 mb-3">
            <div class="d-flex align-center mb-3">
                <v-chip size="x-small" color="error" label class="mr-2">CSL</v-chip>
                <span class="text-subtitle-2">Adversarial Capital Screening (ACS)</span>
                <v-spacer />
                <v-chip
                    v-if="scores?.compliance != null"
                    :color="scoreLabelColor(scores.compliance)"
                    label
                    class="mr-2"
                >
                    {{ tierLabel(scoreToLabel(scores.compliance)) }} risk
                </v-chip>
            </div>
            <div class="text-body-2 text-medium-emphasis">
                Ownership-path and screening-list exposure with FOCI-oriented jurisdiction
                breakdown. Covers OFAC, OpenSanctions, CSL direct and graph-traversal matching.
            </div>
        </v-card>

        <!-- Sanctions alert -->
        <v-alert v-if="sanctionData?.listed" type="error" variant="tonal" class="mb-3" prominent>
            <template #title>Sanctions listing detected</template>
            <div class="mt-1">
                <span v-if="sanctionData.authority">Listed by {{ sanctionData.authority }}.</span>
                <span v-if="sanctionData.sector"> Sector: {{ sanctionData.sector }}.</span>
                <span v-if="sanctionData.since"> Since {{ sanctionData.since }}.</span>
                <span v-if="sanctionData.listId"> Ref: {{ sanctionData.listId }}.</span>
            </div>
            <div v-if="sanctionData.url" class="mt-2">
                <a :href="sanctionData.url" target="_blank" rel="noopener" class="text-error">
                    View source listing →
                </a>
            </div>
        </v-alert>
        <v-alert v-else type="success" variant="tonal" density="compact" class="mb-3">
            No direct sanctions or screening-list match found.
        </v-alert>

        <!-- Ownership graph -->
        <v-card class="pa-4 mb-3" v-if="acsDetailData">
            <div class="text-subtitle-2 mb-3">Ownership Graph</div>
            <v-row dense>
                <v-col cols="6" sm="3">
                    <div class="text-caption text-medium-emphasis text-uppercase">
                        Nodes screened
                    </div>
                    <div class="text-h6 font-mono mt-1">{{ acsDetailData.graphNodesScreened }}</div>
                </v-col>
                <v-col cols="6" sm="3">
                    <div class="text-caption text-medium-emphasis text-uppercase">
                        Direct matches
                    </div>
                    <div
                        class="text-h6 font-mono mt-1"
                        :class="acsDetailData.directMatchCount > 0 ? 'text-error' : ''"
                    >
                        {{ acsDetailData.directMatchCount }}
                    </div>
                </v-col>
                <v-col cols="6" sm="3">
                    <div class="text-caption text-medium-emphasis text-uppercase">Path matches</div>
                    <div
                        class="text-h6 font-mono mt-1"
                        :class="acsDetailData.pathMatchCount > 0 ? 'text-warning' : ''"
                    >
                        {{ acsDetailData.pathMatchCount }}
                    </div>
                </v-col>
                <v-col cols="6" sm="3">
                    <div class="text-caption text-medium-emphasis text-uppercase">FOCI risk</div>
                    <div class="mt-1">
                        <v-chip
                            :color="riskColor(acsDetailData.foci.overallRisk)"
                            size="small"
                            label
                            variant="tonal"
                        >
                            {{ acsDetailData.foci.overallRisk }}
                        </v-chip>
                    </div>
                </v-col>
            </v-row>
        </v-card>

        <!-- FOCI breakdown -->
        <v-card class="pa-4 mb-3" v-if="acsDetailData?.foci">
            <div class="text-subtitle-2 mb-3">FOCI — Foreign Ownership, Control, Influence</div>
            <v-row dense>
                <v-col cols="12" sm="4">
                    <div class="text-caption text-medium-emphasis text-uppercase">
                        Foreign ownership
                    </div>
                    <div class="text-h6 font-mono mt-1">
                        {{ acsDetailData.foci.foreignOwnershipPct.toFixed(1) }}%
                    </div>
                </v-col>
                <v-col cols="12" sm="4">
                    <div class="text-caption text-medium-emphasis text-uppercase">
                        Foreign board seats
                    </div>
                    <div class="text-h6 font-mono mt-1">
                        {{ acsDetailData.foci.foreignBoardPct.toFixed(1) }}%
                    </div>
                </v-col>
                <v-col cols="12" sm="4">
                    <div class="text-caption text-medium-emphasis text-uppercase">
                        Foreign officers
                    </div>
                    <div class="text-h6 font-mono mt-1">
                        {{ acsDetailData.foci.foreignOfficerPct.toFixed(1) }}%
                    </div>
                </v-col>
            </v-row>
        </v-card>

        <!-- Jurisdiction hits -->
        <v-card class="pa-4 mb-3">
            <div class="text-subtitle-2 mb-3">High-Risk Jurisdiction Exposure</div>
            <template v-if="acsDetailData?.jurisdictionHits?.length">
                <div class="d-flex flex-column ga-2">
                    <div
                        v-for="hit in acsDetailData.jurisdictionHits"
                        :key="hit.name"
                        class="d-flex align-center ga-2 jurisdiction-row pa-2"
                    >
                        <v-chip :color="hit.tier === 1 ? 'error' : 'warning'" size="x-small" label>
                            Tier {{ hit.tier }}
                        </v-chip>
                        <span class="text-body-2">{{ hit.name }}</span>
                        <span class="text-caption text-medium-emphasis"
                            >({{ hit.jurisdiction }})</span
                        >
                        <v-spacer />
                        <span class="text-caption text-medium-emphasis"
                            >{{ hit.hopDistance }} hop{{ hit.hopDistance !== 1 ? 's' : '' }}</span
                        >
                    </div>
                </div>
            </template>
            <v-alert v-else density="compact" variant="tonal" type="success">
                No tier 1 or tier 2 jurisdiction exposure detected in ownership graph.
            </v-alert>
        </v-card>

        <!-- Evidence findings -->
        <v-card class="pa-4" v-if="complianceDetail?.findings?.length">
            <div class="text-subtitle-2 mb-3">Evidence</div>
            <div class="finding-list">
                <v-card
                    v-for="(finding, idx) in complianceDetail.findings"
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
        sanctionData?: {
            listed: boolean;
            authority: string | null;
            sector: string | null;
            topic: string | null;
            since: string | null;
            listId: string | null;
            url: string | null;
        } | null;
        acsDetailData?: {
            directMatchCount: number;
            pathMatchCount: number;
            graphNodesScreened: number;
            foci: {
                foreignOwnershipPct: number;
                foreignBoardPct: number;
                foreignOfficerPct: number;
                overallRisk: 'critical' | 'high' | 'medium' | 'low';
            };
            jurisdictionHits: Array<{
                name: string;
                jurisdiction: string | null;
                tier: 1 | 2 | 3 | 4;
                hopDistance: number;
            }>;
        } | null;
    }>();

    const complianceDetail = computed(() => props.lensDetails?.compliance);

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
    .jurisdiction-row {
        background: rgba(var(--dynamic-fg-rgb), 0.02);
        border-radius: 6px;
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.04);
    }
    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
