<template>
    <v-card class="pa-4">
        <div class="d-flex align-center mb-3">
            <v-icon size="small" class="mr-2">mdi-account-edit-outline</v-icon>
            <span class="text-subtitle-2">Analyst Assessment</span>
            <v-spacer />
            <span v-if="modelValue?.savedAt" class="text-caption text-medium-emphasis">
                Last saved {{ formatDate(modelValue.savedAt) }}
            </span>
        </div>
        <v-select
            v-model="tier"
            :items="tierOptions"
            label="Severity"
            density="comfortable"
            hide-details
            class="mb-3"
        />
        <v-textarea
            v-model="justification"
            label="Justification"
            rows="3"
            auto-grow
            density="comfortable"
            placeholder="Why does this entity deserve this severity?"
            hide-details
            class="mb-3"
        />
        <div class="d-flex justify-end">
            <v-btn color="primary" :disabled="!tier" @click="save">Save assessment</v-btn>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { ref, watch } from 'vue';

    import type { RiskTier } from '~/composables/useFusedScoring';

    interface Assessment {
        tier: RiskTier;
        justification: string;
        savedAt: number;
    }

    const props = defineProps<{
        modelValue?: Assessment;
    }>();
    const emit = defineEmits<{
        save: [assessment: { tier: RiskTier; justification: string }];
    }>();

    const tier = ref<RiskTier | null>(props.modelValue?.tier ?? null);
    const justification = ref(props.modelValue?.justification ?? '');

    watch(
        () => props.modelValue,
        (val) => {
            tier.value = val?.tier ?? null;
            justification.value = val?.justification ?? '';
        }
    );

    const tierOptions: { title: string; value: RiskTier }[] = [
        { title: 'Critical', value: 'critical' },
        { title: 'High', value: 'high' },
        { title: 'Medium', value: 'medium' },
        { title: 'Low', value: 'low' },
    ];

    function save() {
        if (!tier.value) return;
        emit('save', { tier: tier.value, justification: justification.value });
    }

    function formatDate(ms: number) {
        return new Date(ms).toLocaleString();
    }
</script>
