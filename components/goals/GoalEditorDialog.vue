<template>
    <v-dialog v-model="open" max-width="480">
        <v-card>
            <v-card-title class="d-flex align-center pt-5 px-6">
                <v-icon color="primary" class="mr-2">mdi-target</v-icon>
                <span class="text-h6">{{ existingGoal ? 'Edit goal' : 'Set a goal' }}</span>
            </v-card-title>

            <v-card-subtitle class="px-6 pb-0 text-medium-emphasis text-caption">
                {{ bucketName }}
            </v-card-subtitle>

            <v-card-text class="px-6 pb-0 pt-4">
                <v-text-field
                    v-model="form.purpose"
                    label="Goal name"
                    placeholder="e.g. Retirement, House down payment"
                    variant="outlined"
                    density="comfortable"
                    class="mb-3"
                />

                <div class="d-flex align-center mb-3" style="gap: 12px">
                    <v-text-field
                        v-model.number="form.horizonYears"
                        label="Time horizon (years)"
                        type="number"
                        variant="outlined"
                        density="comfortable"
                        style="flex: 1"
                        :rules="[horizonRule]"
                    />
                    <v-select
                        v-model="form.priority"
                        :items="priorityItems"
                        label="Priority"
                        variant="outlined"
                        density="comfortable"
                        style="flex: 1"
                    />
                </div>

                <v-text-field
                    v-model.number="form.targetAmount"
                    label="Target amount ($) — optional"
                    type="number"
                    variant="outlined"
                    density="comfortable"
                    class="mb-1"
                    prefix="$"
                />

                <div
                    v-if="form.horizonYears > 0"
                    class="rounded pa-3 mb-3"
                    :class="targetBandClass"
                >
                    <span class="text-caption">
                        <v-icon size="x-small" class="mr-1">mdi-information-outline</v-icon>
                        Target risk band for a
                        <strong>{{ form.horizonYears }}-year</strong> horizon with your risk
                        tolerance: <strong>{{ targetBand }}</strong>
                    </span>
                </div>
            </v-card-text>

            <v-card-actions class="px-6 pb-5">
                <v-btn v-if="existingGoal" variant="text" color="error" @click="onClear">
                    Remove goal
                </v-btn>
                <v-spacer />
                <v-btn variant="text" @click="open = false">Cancel</v-btn>
                <v-btn color="primary" variant="flat" :disabled="!canSubmit" @click="onSubmit">
                    Save
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
    import { computed, reactive, watch } from 'vue';
    import type { GoalMeta } from '~/composables/usePortfolio';
    import type { RiskTolerance } from '~/composables/useUser';
    import { targetRiskBand } from '~/utils/goals/riskFit';

    const props = defineProps<{
        modelValue: boolean;
        bucketName?: string;
        existingGoal?: GoalMeta | null;
        userRiskTolerance?: RiskTolerance;
    }>();

    const emit = defineEmits<{
        (e: 'update:modelValue', v: boolean): void;
        (e: 'submit', goal: GoalMeta): void;
        (e: 'clear'): void;
    }>();

    const open = computed({
        get: () => props.modelValue,
        set: (v) => emit('update:modelValue', v),
    });

    const form = reactive<{
        purpose: string;
        horizonYears: number;
        targetAmount: number | null;
        priority: GoalMeta['priority'];
    }>({
        purpose: '',
        horizonYears: 10,
        targetAmount: null,
        priority: 'important',
    });

    watch(
        () => props.existingGoal,
        (g) => {
            if (g) {
                form.purpose = g.purpose;
                form.horizonYears = g.horizonYears;
                form.targetAmount = g.targetAmount ?? null;
                form.priority = g.priority ?? 'important';
            }
        },
        { immediate: true }
    );

    watch(
        () => props.modelValue,
        (open) => {
            if (open && props.existingGoal) {
                form.purpose = props.existingGoal.purpose;
                form.horizonYears = props.existingGoal.horizonYears;
                form.targetAmount = props.existingGoal.targetAmount ?? null;
                form.priority = props.existingGoal.priority ?? 'important';
            }
        }
    );

    const priorityItems = [
        { title: 'Essential', value: 'essential' },
        { title: 'Important', value: 'important' },
        { title: 'Aspirational', value: 'aspirational' },
    ];

    const horizonRule = (v: number) => v > 0 || 'Enter a positive number';
    const canSubmit = computed(() => form.purpose.trim().length > 0 && form.horizonYears > 0);

    const targetBand = computed(() => {
        const tolerance = props.userRiskTolerance ?? 3;
        const band = targetRiskBand(form.horizonYears, tolerance);
        return band.charAt(0).toUpperCase() + band.slice(1);
    });

    const targetBandClass = computed(() => {
        switch (targetBand.value.toLowerCase()) {
            case 'aggressive':
                return 'bg-error-lighten-4 text-error-darken-2';
            case 'moderate':
                return 'bg-warning-lighten-4 text-warning-darken-2';
            default:
                return 'bg-success-lighten-4 text-success-darken-2';
        }
    });

    function onSubmit() {
        const goal: GoalMeta = {
            purpose: form.purpose.trim(),
            horizonYears: form.horizonYears,
            priority: form.priority,
            ...(form.targetAmount ? { targetAmount: form.targetAmount } : {}),
        };
        emit('submit', goal);
        open.value = false;
    }

    function onClear() {
        emit('clear');
        open.value = false;
    }
</script>
