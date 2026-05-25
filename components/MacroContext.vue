<template>
    <v-card class="pa-4 fill-height">
        <div class="d-flex align-center mb-3">
            <v-icon size="small" class="mr-2">mdi-earth</v-icon>
            <span class="text-subtitle-2">Macro Context</span>
            <span class="text-caption text-medium-emphasis ml-2">via Polymarket</span>
        </div>
        <div class="macro-grid">
            <div v-for="m in signals" :key="m.label" class="macro-row">
                <div class="d-flex justify-space-between align-center mb-1">
                    <span class="text-body-2">{{ m.label }}</span>
                    <span class="d-flex align-center text-caption">
                        <strong class="mr-1">{{ m.value }}%</strong>
                        <v-icon
                            size="x-small"
                            :color="
                                m.trend === 'up' ? 'error' : m.trend === 'down' ? 'success' : 'grey'
                            "
                        >
                            {{
                                m.trend === 'up'
                                    ? 'mdi-arrow-up-thick'
                                    : m.trend === 'down'
                                      ? 'mdi-arrow-down-thick'
                                      : 'mdi-minus-thick'
                            }}
                        </v-icon>
                    </span>
                </div>
                <v-progress-linear
                    :model-value="m.value"
                    :color="m.trend === 'up' ? 'warning' : 'info'"
                    height="4"
                    rounded
                />
                <div class="text-caption text-medium-emphasis mt-1">{{ m.note }}</div>
            </div>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import type { MacroSignal } from '~/composables/useRelationships';
    defineProps<{ signals: MacroSignal[] }>();
</script>

<style scoped>
    .macro-grid {
        display: flex;
        flex-direction: column;
        gap: 14px;
    }
</style>
