<template>
    <v-row dense>
        <v-col v-for="(d, i) in drivers" :key="i" cols="12" md="6">
            <v-card class="pa-3 driver-card" :class="{ top: i === 0 }">
                <div class="d-flex justify-space-between align-start mb-2">
                    <div>
                        <v-chip
                            size="x-small"
                            variant="tonal"
                            :color="sourceColor(d.source)"
                            label
                            class="mr-2"
                        >
                            {{ d.source }}
                        </v-chip>
                        <span class="text-overline text-medium-emphasis">{{ d.lens }}</span>
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
    } from '~/composables/useFusedScoring';

    defineProps<{ drivers: RiskDriver[] }>();

    function sourceColor(src: string) {
        switch (src) {
            case 'SEC':
                return 'primary';
            case 'NEWS':
                return 'info';
            case 'STOCK':
                return 'success';
            case 'POLY':
                return 'warning';
            case 'CSL':
            case 'OFAC':
                return 'error';
            case 'GLEIF':
                return 'primary';
            case 'ownership_graph':
                return 'deep-purple';
            case 'jurisdiction':
                return 'orange';
            default:
                return 'grey';
        }
    }
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
