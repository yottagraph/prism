<template>
    <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-1">Financial Health (FHS) Thresholds</v-card-title>
        <v-card-subtitle>
            Metric thresholds that determine when financial signals trigger elevated concern, plus
            tier sub-weights controlling how much each FHS tier contributes.
        </v-card-subtitle>
        <v-card-text>
            <v-row>
                <v-col cols="12" md="6">
                    <div class="text-subtitle-2 mb-3">Metric Thresholds</div>
                    <v-text-field
                        v-for="field in metricFields"
                        :key="field.key"
                        :model-value="(fhs as any)[field.key]"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        :label="field.label"
                        :hint="field.hint"
                        persistent-hint
                        :step="field.step"
                        class="mb-2"
                        @update:model-value="updateField(field.key, $event)"
                    />
                </v-col>
                <v-col cols="12" md="6">
                    <div class="text-subtitle-2 mb-3">Tier Sub-weights</div>
                    <v-text-field
                        v-for="field in tierFields"
                        :key="field.key"
                        :model-value="fhs.tierWeights[field.key as keyof typeof fhs.tierWeights]"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        :label="field.label"
                        :hint="field.hint"
                        persistent-hint
                        step="0.01"
                        min="0"
                        max="1"
                        class="mb-2"
                        @update:model-value="updateTierWeight(field.key, $event)"
                    />
                    <v-alert
                        v-if="Math.abs(tierWeightTotal - 1) > 0.02"
                        type="warning"
                        variant="tonal"
                        density="compact"
                        class="mt-2"
                    >
                        Tier weight total is {{ tierWeightTotal.toFixed(2) }}. Should sum near 1.0.
                    </v-alert>
                </v-col>
            </v-row>

            <v-divider class="my-4" />

            <div class="text-subtitle-2 mb-3">Distress Events (Tier 2)</div>
            <v-row>
                <v-col v-for="field in distressFields" :key="field.key" cols="12" sm="6" md="4">
                    <div class="text-caption font-weight-medium mb-1">{{ field.label }}</div>
                    <v-row dense>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="
                                    fhs.distressEvents[field.key as keyof typeof fhs.distressEvents]
                                        .baseScore
                                "
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="Base score"
                                step="5"
                                min="0"
                                max="100"
                                @update:model-value="
                                    updateDistressEntry(field.key, 'baseScore', $event)
                                "
                            />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="
                                    fhs.distressEvents[field.key as keyof typeof fhs.distressEvents]
                                        .weight
                                "
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="Signal weight"
                                step="0.1"
                                min="0"
                                max="5"
                                @update:model-value="
                                    updateDistressEntry(field.key, 'weight', $event)
                                "
                            />
                        </v-col>
                    </v-row>
                </v-col>
            </v-row>
            <v-text-field
                :model-value="fhs.distressEvents.recencyWindowDays"
                type="number"
                density="comfortable"
                variant="outlined"
                label="Recency window (days)"
                hint="Linear decay denominator — events older than this get 0.25x weight"
                persistent-hint
                step="30"
                min="30"
                max="2555"
                style="max-width: 320px"
                @update:model-value="updateDistressWindow($event)"
            />
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type {
        ScoringSettings,
        DistressEventConfig,
        DistressEventEntry,
    } from '~/composables/useFusedScoring';

    type FhsWithDistress = ScoringSettings['fhs'];

    const props = defineProps<{ fhs: FhsWithDistress }>();
    const emit = defineEmits<{ 'update:fhs': [value: FhsWithDistress] }>();

    const metricFields = [
        {
            key: 'leverageHighThreshold',
            label: 'Leverage high threshold (x)',
            hint: 'Debt/equity above this triggers concern',
            step: 0.1,
        },
        {
            key: 'equityLowThreshold',
            label: 'Equity low threshold (ratio)',
            hint: 'Equity/assets below this triggers concern',
            step: 0.01,
        },
        {
            key: 'currentRatioLowThreshold',
            label: 'Current ratio low threshold (x)',
            hint: 'Liquidity below this triggers concern',
            step: 0.1,
        },
        {
            key: 'interestCoverageLowThreshold',
            label: 'Interest coverage low threshold (x)',
            hint: 'Debt-service coverage below this triggers concern',
            step: 0.1,
        },
        {
            key: 'stockDeclineThreshold',
            label: 'Stock decline threshold (%)',
            hint: '30-day decline considered elevated risk',
            step: 1,
        },
        {
            key: 'stockVolatilityThreshold',
            label: 'Stock volatility threshold (%)',
            hint: 'Volatility considered elevated risk',
            step: 0.5,
        },
    ];

    const tierFields = [
        { key: 't1', label: 'Tier 1 — Hard Financials', hint: 'XBRL ratios and filing data' },
        { key: 't2', label: 'Tier 2 — Distress Events', hint: '8-K distress event signals' },
        { key: 't3', label: 'Tier 3 — Behavioral', hint: 'Filing behaviour patterns' },
        { key: 't4', label: 'Tier 4 — Stakes', hint: 'Ownership stake changes' },
        { key: 't5', label: 'Tier 5 — Instruments', hint: 'Credit facilities and indentures' },
    ];

    const tierWeightTotal = computed(() => {
        const tw = props.fhs.tierWeights;
        return tw.t1 + tw.t2 + tw.t3 + tw.t4 + tw.t5;
    });

    const distressFields = [
        { key: 'bankruptcy', label: 'Bankruptcy' },
        { key: 'delisting', label: 'Delisting' },
        { key: 'nonReliance', label: 'Non-reliance' },
        { key: 'triggering', label: 'Triggering events' },
        { key: 'impairment', label: 'Impairment' },
        { key: 'termination', label: 'Termination' },
    ];

    function updateField(key: string, raw: unknown) {
        emit('update:fhs', { ...props.fhs, [key]: Number(raw) || 0 });
    }

    function updateTierWeight(key: string, raw: unknown) {
        emit('update:fhs', {
            ...props.fhs,
            tierWeights: { ...props.fhs.tierWeights, [key]: Number(raw) || 0 },
        });
    }

    function updateDistressEntry(key: string, field: keyof DistressEventEntry, raw: unknown) {
        const current = props.fhs.distressEvents[
            key as keyof Omit<DistressEventConfig, 'recencyWindowDays'>
        ] as DistressEventEntry;
        emit('update:fhs', {
            ...props.fhs,
            distressEvents: {
                ...props.fhs.distressEvents,
                [key]: { ...current, [field]: Number(raw) || 0 },
            },
        });
    }

    function updateDistressWindow(raw: unknown) {
        emit('update:fhs', {
            ...props.fhs,
            distressEvents: { ...props.fhs.distressEvents, recencyWindowDays: Number(raw) || 730 },
        });
    }
</script>
