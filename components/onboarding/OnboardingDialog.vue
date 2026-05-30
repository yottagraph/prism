<template>
    <v-dialog v-model="open" max-width="540" persistent>
        <v-card>
            <v-card-title class="d-flex align-center pt-6 px-6">
                <v-icon color="primary" class="mr-3">mdi-account-heart-outline</v-icon>
                <span class="text-h6">Tell us about yourself</span>
            </v-card-title>

            <v-card-text class="px-6 pb-0">
                <p class="text-body-2 text-medium-emphasis mb-5">
                    Answer a few quick questions so we can tailor your goals dashboard.
                </p>

                <v-text-field
                    v-model="form.name"
                    label="Your name"
                    variant="outlined"
                    density="comfortable"
                    class="mb-3"
                />

                <div class="d-flex" style="gap: 12px">
                    <v-text-field
                        v-model.number="form.age"
                        label="Current age"
                        type="number"
                        variant="outlined"
                        density="comfortable"
                        class="flex-1-1"
                        :rules="[ageRule]"
                    />
                    <v-text-field
                        v-model.number="form.retirementAge"
                        label="Target retirement age"
                        type="number"
                        variant="outlined"
                        density="comfortable"
                        class="flex-1-1"
                        :rules="[retireRule]"
                    />
                </div>

                <div class="mb-3">
                    <p class="text-body-2 mb-2">Risk tolerance</p>
                    <div class="d-flex align-center" style="gap: 8px">
                        <span class="text-caption text-medium-emphasis">Conservative</span>
                        <v-btn-toggle
                            v-model="form.riskTolerance"
                            mandatory
                            variant="outlined"
                            color="primary"
                            density="compact"
                        >
                            <v-btn :value="1">1</v-btn>
                            <v-btn :value="2">2</v-btn>
                            <v-btn :value="3">3</v-btn>
                            <v-btn :value="4">4</v-btn>
                            <v-btn :value="5">5</v-btn>
                        </v-btn-toggle>
                        <span class="text-caption text-medium-emphasis">Aggressive</span>
                    </div>
                    <p class="text-caption text-medium-emphasis mt-1">{{ riskLabel }}</p>
                </div>
            </v-card-text>

            <v-card-actions class="px-6 pb-6">
                <v-spacer />
                <v-btn color="primary" variant="flat" :disabled="!canSubmit" @click="onSubmit">
                    Get started
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
    import { computed, reactive } from 'vue';
    import type { DemoUser, RiskTolerance } from '~/composables/useUser';
    import { riskDescription } from '~/utils/goals/riskLabels';

    const props = defineProps<{
        modelValue: boolean;
        /** If provided, pre-fills the form for editing an existing user. */
        user?: DemoUser | null;
    }>();

    const emit = defineEmits<{
        (e: 'update:modelValue', v: boolean): void;
        (e: 'submit', user: Omit<DemoUser, 'id' | 'createdAt' | 'onboarded'>): void;
    }>();

    const open = computed({
        get: () => props.modelValue,
        set: (v) => emit('update:modelValue', v),
    });

    const form = reactive({
        name: props.user?.name ?? '',
        age: props.user?.age ?? 30,
        retirementAge: props.user?.retirementAge ?? 65,
        riskTolerance: (props.user?.riskTolerance ?? 3) as RiskTolerance,
    });

    const ageRule = (v: number) => (v > 0 && v < 120) || 'Enter a valid age';
    const retireRule = (v: number) =>
        (v > form.age && v < 120) || 'Must be greater than current age';

    const canSubmit = computed(
        () => form.name.trim().length > 0 && form.age > 0 && form.retirementAge > form.age
    );

    const riskLabel = computed(() => riskDescription(form.riskTolerance));

    function onSubmit() {
        emit('submit', {
            name: form.name.trim(),
            age: form.age,
            retirementAge: form.retirementAge,
            riskTolerance: form.riskTolerance,
        });
        open.value = false;
    }
</script>
