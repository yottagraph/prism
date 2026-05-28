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
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { FhsThresholds } from '~/composables/useFusedScoring';

    const props = defineProps<{ fhs: FhsThresholds }>();
    const emit = defineEmits<{ 'update:fhs': [value: FhsThresholds] }>();

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

    function updateField(key: string, raw: unknown) {
        emit('update:fhs', { ...props.fhs, [key]: Number(raw) || 0 });
    }

    function updateTierWeight(key: string, raw: unknown) {
        emit('update:fhs', {
            ...props.fhs,
            tierWeights: { ...props.fhs.tierWeights, [key]: Number(raw) || 0 },
        });
    }
</script>
