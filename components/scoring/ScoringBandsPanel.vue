<template>
    <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-1">Tier Bands &amp; Risk Categories</v-card-title>
        <v-card-subtitle>
            Score thresholds that map fused scores to tiers (critical/high/watch/normal) and
            risk-category filters (HIGH/MEDIUM/LOW) on the Monitor table.
        </v-card-subtitle>
        <v-card-text>
            <v-row>
                <v-col cols="12" md="6">
                    <div class="text-subtitle-2 mb-3">Tier Bands (fused score cutoffs)</div>
                    <v-text-field
                        v-for="field in tierFields"
                        :key="field.key"
                        :model-value="(tiers as any)[field.key]"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        :label="field.label"
                        :hint="field.hint"
                        persistent-hint
                        step="1"
                        min="0"
                        max="100"
                        class="mb-2"
                        @update:model-value="updateTier(field.key, $event)"
                    />
                </v-col>
                <v-col cols="12" md="6">
                    <div class="text-subtitle-2 mb-3">
                        Risk-Category Bands (Monitor table filters)
                    </div>
                    <v-text-field
                        v-for="field in categoryFields"
                        :key="field.key"
                        :model-value="(categoryBands as any)[field.key]"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        :label="field.label"
                        :hint="field.hint"
                        persistent-hint
                        step="1"
                        min="0"
                        max="100"
                        class="mb-2"
                        @update:model-value="updateCategory(field.key, $event)"
                    />
                </v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
    import type { CategoryBands, TierBands } from '~/composables/useFusedScoring';

    const props = defineProps<{ tiers: TierBands; categoryBands: CategoryBands }>();
    const emit = defineEmits<{
        'update:tiers': [value: TierBands];
        'update:categoryBands': [value: CategoryBands];
    }>();

    const tierFields = [
        {
            key: 'critical',
            label: 'Critical threshold',
            hint: 'Fused score at or above → Critical tier',
        },
        {
            key: 'high',
            label: 'High threshold',
            hint: 'Fused score at or above → High tier',
        },
        {
            key: 'watch',
            label: 'Watch threshold',
            hint: 'Fused score at or above → Watch tier; below → Normal',
        },
    ];

    const categoryFields = [
        {
            key: 'high',
            label: 'HIGH category threshold',
            hint: 'Fused score at or above → HIGH risk category',
        },
        {
            key: 'medium',
            label: 'MEDIUM category threshold',
            hint: 'Fused score at or above → MEDIUM; below → LOW',
        },
    ];

    function updateTier(key: string, raw: unknown) {
        emit('update:tiers', { ...props.tiers, [key]: Number(raw) || 0 });
    }

    function updateCategory(key: string, raw: unknown) {
        emit('update:categoryBands', { ...props.categoryBands, [key]: Number(raw) || 0 });
    }
</script>
