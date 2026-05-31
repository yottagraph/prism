<template>
    <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-1 d-flex align-center ga-2">
            Leadership stability (ERS) Thresholds
            <SourceBadge source="SEC" :show-icon="true" :clickable="true" />
        </v-card-title>
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

            <v-divider class="my-4" />

            <div class="text-subtitle-2 mb-3">Signal 8 — 8-K Item 5.02 (Executive Departures)</div>
            <v-row>
                <v-col cols="12" sm="4">
                    <v-text-field
                        :model-value="ers.signal8.baseScore"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        label="Base score per event"
                        hint="Score contribution before recency/premium"
                        persistent-hint
                        step="1"
                        min="1"
                        max="50"
                        @update:model-value="updateSignal8('baseScore', $event)"
                    />
                </v-col>
                <v-col cols="12" sm="4">
                    <v-text-field
                        :model-value="ers.signal8.cSuitePremium"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        label="C-suite premium (×)"
                        hint="Multiplier for C-suite departure events"
                        persistent-hint
                        step="0.1"
                        min="1"
                        max="3"
                        @update:model-value="updateSignal8('cSuitePremium', $event)"
                    />
                </v-col>
                <v-col cols="12" sm="4">
                    <v-text-field
                        :model-value="ers.signal8.cap"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        label="Score cap"
                        hint="Maximum total Signal 8 contribution"
                        persistent-hint
                        step="5"
                        min="10"
                        max="100"
                        @update:model-value="updateSignal8('cap', $event)"
                    />
                </v-col>
            </v-row>

            <v-alert type="info" variant="tonal" density="compact" class="mt-2">
                <strong>leadershipSentimentLow</strong> is reserved for a future
                leadership-sentiment signal. The field is saved but has no effect on scoring until
                the server signal is implemented.
            </v-alert>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
    import type { ScoringSettings, ErsSignal8Settings } from '~/composables/useFusedScoring';

    type ErsWithSignal8 = ScoringSettings['ers'];

    const props = defineProps<{ ers: ErsWithSignal8 }>();
    const emit = defineEmits<{ 'update:ers': [value: ErsWithSignal8] }>();

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
            hint: 'Controls the slope of the departure-score formula',
            step: 1,
            min: 1,
            max: 12,
        },
        {
            key: 'cSuiteCoverageLow',
            label: 'C-suite coverage low (%)',
            hint: 'C-suite / total officers ratio below this raises concern',
            step: 5,
            min: 10,
            max: 100,
        },
        {
            key: 'leadershipSentimentLow',
            label: 'Leadership sentiment low (reserved)',
            hint: 'Saved but not yet wired to a server signal',
            step: 0.05,
            min: 0,
            max: 1,
        },
    ];

    function update(key: string, raw: unknown) {
        emit('update:ers', { ...props.ers, [key]: Number(raw) || 0 });
    }

    function updateSignal8(key: keyof ErsSignal8Settings, raw: unknown) {
        emit('update:ers', {
            ...props.ers,
            signal8: { ...props.ers.signal8, [key]: Number(raw) || 0 },
        });
    }
</script>
