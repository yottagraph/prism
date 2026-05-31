<template>
    <v-row dense>
        <v-col v-for="(d, i) in drivers" :key="i" cols="12" md="6">
            <v-card class="pa-3 driver-card" :class="{ top: i === 0 }">
                <div class="d-flex justify-space-between align-start mb-2">
                    <div class="d-flex align-center">
                        <SourceBadge :source="d.source" class="mr-2" />
                        <span class="text-overline text-medium-emphasis">{{
                            LENS_META[d.lens]?.label ?? d.lens
                        }}</span>
                    </div>
                    <v-chip :color="scoreLabelColor(d.score)" size="small" label>{{
                        tierLabel(scoreToLabel(d.score))
                    }}</v-chip>
                </div>
                <div class="text-body-2 mb-2">{{ d.finding.text }}</div>
                <div v-if="d.finding.citations?.length" class="d-flex flex-wrap ga-2">
                    <CitationChip
                        v-for="(citation, idx) in d.finding.citations"
                        :key="`driver-${i}-${idx}`"
                        :citation="citation"
                    />
                </div>
            </v-card>
        </v-col>
    </v-row>
</template>

<script setup lang="ts">
    import CitationChip from '~/components/CitationChip.vue';
    import {
        type RiskDriver,
        scoreToLabel,
        scoreLabelColor,
        tierLabel,
        LENS_META,
    } from '~/composables/useFusedScoring';

    defineProps<{ drivers: RiskDriver[] }>();
</script>

<style scoped>
    .driver-card {
        height: 100%;
        background: rgba(var(--dynamic-fg-rgb), 0.02);
    }

    .driver-card.top {
        border-left: 3px solid rgb(var(--v-theme-warning));
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
