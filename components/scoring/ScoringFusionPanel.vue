<template>
    <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-1 d-flex align-center ga-2 flex-wrap">
            Source Fusion Weights
            <HelpTooltip
                title="How fusion weights work"
                text="Each lens score is multiplied by its weight, then summed to produce the Overall risk score (0–100). Weights should sum to 1.0. Lenses backed by different sources (SEC, News, Stock) can be tuned independently."
            />
        </v-card-title>
        <v-card-subtitle>
            How much each lens contributes to the fused risk score. Values should sum close to 1.0.
        </v-card-subtitle>
        <v-card-text>
            <v-row>
                <v-col v-for="field in fields" :key="field.key" cols="12" sm="6" md="4">
                    <v-text-field
                        :model-value="weights[field.key as keyof SourceFusionWeights]"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        :label="field.label"
                        :hint="field.hint"
                        persistent-hint
                        min="0"
                        max="1"
                        step="0.05"
                        @update:model-value="update(field.key, $event)"
                    />
                </v-col>
            </v-row>
            <v-alert
                v-if="Math.abs(weightTotal - 1) > 0.02"
                type="warning"
                variant="tonal"
                density="compact"
                class="mt-2"
            >
                Current weight total is {{ weightTotal.toFixed(2) }}. A total near 1.0 keeps
                interpretation clear.
            </v-alert>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { SourceFusionWeights } from '~/composables/useFusedScoring';

    const props = defineProps<{ weights: SourceFusionWeights }>();
    const emit = defineEmits<{ 'update:weights': [value: SourceFusionWeights] }>();

    const fields = [
        { key: 'solvency', label: 'Solvency (FHS)', hint: 'Financial health from XBRL + events' },
        { key: 'executive', label: 'Executive (ERS)', hint: 'Governance stability signals' },
        { key: 'news', label: 'News', hint: 'Sentiment and narrative pressure' },
        { key: 'market', label: 'Market', hint: 'Price, volatility, technical signals' },
        { key: 'eventPressure', label: 'Event Pressure', hint: 'Weighted 8-K distress events' },
        { key: 'compliance', label: 'Compliance (ACS)', hint: 'Sanctions / FOCI screening' },
    ];

    const weightTotal = computed(() => {
        const w = props.weights;
        return (
            w.solvency +
            w.executive +
            w.news +
            w.market +
            (w.eventPressure ?? 0) +
            (w.compliance ?? 0)
        );
    });

    function update(key: string, raw: unknown) {
        const value = Number(raw) || 0;
        emit('update:weights', { ...props.weights, [key]: value });
    }
</script>
