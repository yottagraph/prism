<template>
    <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-1">
            Adversarial Capital Screening (ACS) Settings
        </v-card-title>
        <v-card-subtitle>
            Sub-weights controlling how each screening layer contributes to the compliance
            composite, plus OFAC override and hop decay settings.
        </v-card-subtitle>
        <v-card-text>
            <v-row>
                <v-col cols="12" md="6">
                    <div class="text-subtitle-2 mb-3">Sub-weights</div>
                    <v-text-field
                        v-for="field in weightFields"
                        :key="field.key"
                        :model-value="(acs as any)[field.key]"
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
                        @update:model-value="update(field.key, $event)"
                    />
                    <v-alert
                        v-if="Math.abs(subWeightTotal - 1) > 0.02"
                        type="warning"
                        variant="tonal"
                        density="compact"
                        class="mt-2"
                    >
                        Sub-weight total is {{ subWeightTotal.toFixed(2) }}. Should sum near 1.0.
                    </v-alert>
                </v-col>
                <v-col cols="12" md="6">
                    <div class="text-subtitle-2 mb-3">Overrides &amp; Decay</div>
                    <v-text-field
                        v-for="field in overrideFields"
                        :key="field.key"
                        :model-value="(acs as any)[field.key]"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        :label="field.label"
                        :hint="field.hint"
                        persistent-hint
                        :step="field.step"
                        :min="field.min"
                        :max="field.max"
                        class="mb-2"
                        @update:model-value="update(field.key, $event)"
                    />
                </v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { AcsThresholds } from '~/composables/useFusedScoring';

    const props = defineProps<{ acs: AcsThresholds }>();
    const emit = defineEmits<{ 'update:acs': [value: AcsThresholds] }>();

    const weightFields = [
        {
            key: 'directWeight',
            label: 'Direct screening weight',
            hint: 'Sanctions list direct match',
        },
        {
            key: 'pathWeight',
            label: 'Ownership path weight',
            hint: 'Multi-hop ownership proximity',
        },
        {
            key: 'governanceWeight',
            label: 'Governance weight',
            hint: 'Officer/director graph traversal',
        },
        {
            key: 'jurisdictionWeight',
            label: 'Jurisdiction weight',
            hint: 'High-risk jurisdiction exposure',
        },
        { key: 'fociWeight', label: 'FOCI weight', hint: 'Foreign ownership/control indicators' },
    ];

    const overrideFields = [
        {
            key: 'ofacExactOverride',
            label: 'OFAC exact match override',
            hint: 'Minimum score on OFAC SDN exact match',
            step: 1,
            min: 50,
            max: 100,
        },
        {
            key: 'hopDecay',
            label: 'Hop decay factor',
            hint: 'Risk decay per ownership hop (0–1)',
            step: 0.05,
            min: 0,
            max: 1,
        },
    ];

    const subWeightTotal = computed(() => {
        return (
            props.acs.directWeight +
            props.acs.pathWeight +
            props.acs.governanceWeight +
            props.acs.jurisdictionWeight +
            props.acs.fociWeight
        );
    });

    function update(key: string, raw: unknown) {
        emit('update:acs', { ...props.acs, [key]: Number(raw) || 0 });
    }
</script>
