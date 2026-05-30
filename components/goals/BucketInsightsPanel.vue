<template>
    <v-card variant="outlined" class="pa-4 fill-height d-flex flex-column">
        <div class="d-flex align-center mb-3">
            <v-icon size="small" class="mr-2" color="primary">mdi-text-search</v-icon>
            <span class="text-subtitle-2 font-weight-medium">Key Findings</span>
        </div>

        <!-- Not yet analyzed -->
        <div
            v-if="!analyzed"
            class="flex-grow-1 d-flex flex-column align-center justify-center text-center pa-4"
        >
            <v-icon size="32" class="mb-2 text-medium-emphasis">mdi-radar</v-icon>
            <div class="text-body-2 text-medium-emphasis">
                Analyze this bucket to see key findings
            </div>
        </div>

        <!-- No usable findings after analysis -->
        <div
            v-else-if="topFindings.length === 0"
            class="flex-grow-1 d-flex align-center justify-center text-center pa-4"
        >
            <div class="text-body-2 text-medium-emphasis">No findings available yet.</div>
        </div>

        <!-- Findings list -->
        <div v-else class="flex-grow-1">
            <div v-for="f in topFindings" :key="f.name" class="finding-row pb-3 mb-3">
                <!-- Entity name + risk tier chip -->
                <div class="d-flex align-center mb-1" style="gap: 8px; flex-wrap: wrap">
                    <v-chip
                        :color="tierColor(f.tier as RiskTier)"
                        size="x-small"
                        variant="flat"
                        label
                    >
                        {{ tierLabel(f.tier as RiskTier) }}
                    </v-chip>
                    <span class="text-body-2 font-weight-medium">{{ f.name }}</span>
                    <span v-if="f.ticker" class="text-caption text-medium-emphasis"
                        >({{ f.ticker }})</span
                    >
                </div>
                <!-- Finding text (clamped to 3 lines) -->
                <p class="text-body-2 mb-1 finding-text">{{ f.finding }}</p>
                <!-- Citation -->
                <span
                    v-if="f.citation"
                    class="text-caption text-medium-emphasis"
                    style="font-style: italic"
                    >{{ f.citation }}</span
                >
            </div>
        </div>

        <!-- Footer: link to full analysis -->
        <div class="mt-2 pt-2 footer-divider">
            <v-btn
                size="small"
                variant="text"
                color="primary"
                append-icon="mdi-arrow-right"
                class="px-0"
                @click="$emit('open')"
            >
                Full analysis
            </v-btn>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { RiskTier } from '~/composables/useFusedScoring';
    import { tierColor, tierLabel } from '~/composables/useFusedScoring';

    interface CitationRef {
        source?: string;
        date?: string;
        title?: string;
    }

    interface Driver {
        lens: string;
        source: string;
        score: number;
        finding: {
            text: string;
            date?: string;
            citations: CitationRef[];
        };
    }

    interface EntityInput {
        resolvedName?: string;
        inputName?: string;
        ticker?: string;
        scores: { fused: number; tier: string } | null;
        drivers?: Driver[];
        monitor?: { headlineSummary?: string | null };
    }

    const props = defineProps<{
        entities: EntityInput[];
        analyzed: boolean;
    }>();

    defineEmits<{ open: [] }>();

    interface Finding {
        name: string;
        ticker?: string;
        tier: string;
        finding: string;
        citation: string | null;
    }

    const topFindings = computed<Finding[]>(() => {
        const scored = [...props.entities]
            .filter((e) => e.scores != null)
            .sort((a, b) => (b.scores?.fused ?? 0) - (a.scores?.fused ?? 0))
            .slice(0, 3);

        return scored
            .map((e): Finding | null => {
                const name = e.resolvedName || e.inputName || 'Unknown';
                const tier = e.scores?.tier ?? 'low';
                const topDriver = [...(e.drivers ?? [])].sort((a, b) => b.score - a.score)[0];

                let finding = '';
                let citation: string | null = null;

                if (topDriver?.finding.text) {
                    finding = topDriver.finding.text;
                    const cite = topDriver.finding.citations?.[0];
                    if (cite) {
                        const parts: string[] = [];
                        if (cite.source) parts.push(cite.source);
                        if (cite.date) parts.push(cite.date);
                        if (parts.length) citation = `(${parts.join(', ')})`;
                    }
                } else if (e.monitor?.headlineSummary) {
                    finding = e.monitor.headlineSummary;
                }

                if (!finding) return null;
                return { name, ticker: e.ticker, tier, finding, citation };
            })
            .filter((f): f is Finding => f !== null);
    });
</script>

<style scoped>
    .finding-row:not(:last-child) {
        border-bottom: 1px solid rgba(var(--dynamic-fg-rgb, 128, 128, 128), 0.08);
    }

    .finding-text {
        line-height: 1.45;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .footer-divider {
        border-top: 1px solid rgba(var(--dynamic-fg-rgb, 128, 128, 128), 0.08);
    }
</style>
