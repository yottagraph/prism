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
                    <span class="font-mono" :style="`color: var(--v-theme-${scoreColor(d.score)})`">
                        {{ d.score }}
                    </span>
                </div>
                <div class="text-body-1 font-weight-medium mb-1">{{ d.label }}</div>
                <div class="text-body-2 text-medium-emphasis mb-2">{{ d.explanation }}</div>
                <div class="text-caption text-medium-emphasis">
                    <v-icon size="x-small" class="mr-1">mdi-file-document-outline</v-icon>
                    {{ d.evidence }}
                </div>
            </v-card>
        </v-col>
    </v-row>
</template>

<script setup lang="ts">
    import type { RiskDriver } from '~/composables/useFusedScoring';

    defineProps<{ drivers: RiskDriver[] }>();

    function scoreColor(v: number) {
        if (v >= 80) return 'error';
        if (v >= 65) return 'warning';
        if (v >= 50) return 'info';
        return 'success';
    }

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
            default:
                return 'grey';
        }
    }
</script>

<style scoped>
    .driver-card {
        height: 100%;
        background: rgba(255, 255, 255, 0.02);
    }

    .driver-card.top {
        border-left: 3px solid rgb(var(--v-theme-warning));
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
