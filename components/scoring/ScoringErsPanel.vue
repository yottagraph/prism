<template>
    <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-1">Executive Risk (ERS) Thresholds</v-card-title>
        <v-card-subtitle>
            Governance stability thresholds that determine when leadership signals trigger elevated
            concern.
        </v-card-subtitle>
        <v-card-text>
            <v-row>
                <v-col v-for="field in fields" :key="field.key" cols="12" sm="6">
                    <v-text-field
                        :model-value="(ers as any)[field.key]"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        :label="field.label"
                        :hint="field.hint"
                        persistent-hint
                        :step="field.step"
                        :min="field.min"
                        :max="field.max"
                        @update:model-value="update(field.key, $event)"
                    />
                </v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
    import type { ErsThresholds } from '~/composables/useFusedScoring';

    const props = defineProps<{ ers: ErsThresholds }>();
    const emit = defineEmits<{ 'update:ers': [value: ErsThresholds] }>();

    const fields = [
        {
            key: 'minOfficers',
            label: 'Min officers',
            hint: 'Below this count triggers concern',
            step: 1,
            min: 0,
            max: 20,
        },
        {
            key: 'minCSuite',
            label: 'Min C-suite roles',
            hint: 'Below this count triggers concern',
            step: 1,
            min: 0,
            max: 10,
        },
        {
            key: 'departures12mHigh',
            label: 'Departures threshold (12m count)',
            hint: 'Departures at or above this treated as elevated',
            step: 1,
            min: 1,
            max: 12,
        },
        {
            key: 'cSuiteCoverageLow',
            label: 'C-suite coverage low (%)',
            hint: 'Leadership bench below this raises concern',
            step: 5,
            min: 10,
            max: 100,
        },
        {
            key: 'leadershipSentimentLow',
            label: 'Leadership sentiment low',
            hint: 'Sentiment below this raises concern',
            step: 0.05,
            min: 0,
            max: 1,
        },
    ];

    function update(key: string, raw: unknown) {
        emit('update:ers', { ...props.ers, [key]: Number(raw) || 0 });
    }
</script>
