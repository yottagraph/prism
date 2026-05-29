<template>
    <v-dialog
        :model-value="modelValue"
        max-width="640"
        scrollable
        @update:model-value="$emit('update:modelValue', $event)"
    >
        <v-card>
            <v-card-title class="d-flex align-center pa-4 pb-0">
                <v-icon start color="primary" class="mr-2">
                    {{
                        mode === 'create'
                            ? 'mdi-briefcase-plus-outline'
                            : 'mdi-account-multiple-plus-outline'
                    }}
                </v-icon>
                {{ mode === 'create' ? 'New portfolio' : 'Add entities' }}
                <v-spacer />
                <v-btn icon="mdi-close" variant="text" density="compact" @click="close" />
            </v-card-title>

            <!-- Portfolio name (create mode only) -->
            <div v-if="mode === 'create'" class="px-4 pt-4">
                <v-text-field
                    v-model="portfolioName"
                    label="Portfolio name"
                    variant="outlined"
                    density="comfortable"
                    autofocus
                    hide-details="auto"
                    placeholder="e.g. CLO Mid-Market Q3"
                />
            </div>

            <!-- Staged entities -->
            <div v-if="staged.length > 0" class="px-4 pt-3">
                <div class="d-flex align-center mb-1">
                    <span class="text-caption text-medium-emphasis">
                        {{ staged.length }} staged
                    </span>
                    <v-btn
                        size="x-small"
                        variant="text"
                        color="error"
                        class="ml-2"
                        @click="staged = []"
                    >
                        Clear all
                    </v-btn>
                </div>
                <div class="staged-chips">
                    <v-chip
                        v-for="(e, i) in staged"
                        :key="i"
                        size="small"
                        closable
                        :color="e.neid ? 'primary' : 'default'"
                        variant="tonal"
                        class="ma-1"
                        @click:close="removeStaged(i)"
                    >
                        {{ e.resolvedName || e.inputName }}
                    </v-chip>
                </div>
            </div>

            <!-- Tabs -->
            <v-card-text class="pa-4 pt-3">
                <v-tabs v-model="activeTab" class="mb-4">
                    <v-tab value="search">
                        <v-icon start>mdi-magnify</v-icon>
                        Search
                    </v-tab>
                    <v-tab value="csv">
                        <v-icon start>mdi-file-delimited-outline</v-icon>
                        Upload CSV
                    </v-tab>
                    <v-tab value="paste">
                        <v-icon start>mdi-text-box-outline</v-icon>
                        Paste names
                    </v-tab>
                </v-tabs>

                <v-window v-model="activeTab">
                    <v-window-item value="search">
                        <PortfolioEntitySearchAdd @add="onAdd" />
                    </v-window-item>

                    <v-window-item value="csv">
                        <PortfolioCsvImport @add="onAdd" />
                    </v-window-item>

                    <v-window-item value="paste">
                        <v-textarea
                            v-model="pastedNames"
                            label="Entity names (one per line)"
                            variant="outlined"
                            density="comfortable"
                            rows="8"
                            placeholder="Ford Motor Company&#10;General Motors&#10;Carnival Corporation"
                            hide-details="auto"
                        />
                        <v-btn
                            color="primary"
                            variant="tonal"
                            class="mt-3"
                            :disabled="!pastedNames.trim()"
                            @click="addPasted"
                        >
                            Stage names
                        </v-btn>
                    </v-window-item>
                </v-window>
            </v-card-text>

            <v-divider />

            <v-card-actions class="pa-4">
                <v-btn variant="text" @click="close">Cancel</v-btn>
                <v-spacer />
                <v-btn color="primary" :disabled="!canSubmit" @click="submit">
                    {{ mode === 'create' ? 'Create portfolio' : 'Add to portfolio' }}
                    <template v-if="staged.length > 0"> ({{ staged.length }}) </template>
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
    import { ref, computed, watch } from 'vue';
    import type { ResolvedEntityInput } from '~/composables/usePortfolio';

    interface Props {
        modelValue: boolean;
        mode: 'create' | 'add';
    }

    interface SubmitPayload {
        name?: string;
        entities: ResolvedEntityInput[];
    }

    const props = defineProps<Props>();
    const emit = defineEmits<{
        'update:modelValue': [value: boolean];
        submit: [payload: SubmitPayload];
    }>();

    const activeTab = ref<'search' | 'csv' | 'paste'>('search');
    const portfolioName = ref('');
    const staged = ref<ResolvedEntityInput[]>([]);
    const pastedNames = ref('');

    const canSubmit = computed(() => {
        if (staged.value.length === 0) return false;
        if (props.mode === 'create' && !portfolioName.value.trim()) return false;
        return true;
    });

    function onAdd(entities: ResolvedEntityInput[]) {
        const existingNeids = new Set(staged.value.map((e) => e.neid).filter(Boolean));
        const existingNames = new Set(staged.value.map((e) => e.inputName.toLowerCase()));
        for (const e of entities) {
            if (e.neid && existingNeids.has(e.neid)) continue;
            if (existingNames.has(e.inputName.toLowerCase())) continue;
            staged.value.push(e);
            if (e.neid) existingNeids.add(e.neid);
            existingNames.add(e.inputName.toLowerCase());
        }
    }

    function addPasted() {
        const lines = pastedNames.value
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
        onAdd(lines.map((name) => ({ inputName: name, resolvedName: name, neid: null })));
        pastedNames.value = '';
    }

    function removeStaged(index: number) {
        staged.value.splice(index, 1);
    }

    function submit() {
        if (!canSubmit.value) return;
        emit('submit', {
            name: props.mode === 'create' ? portfolioName.value.trim() : undefined,
            entities: [...staged.value],
        });
        reset();
    }

    function close() {
        emit('update:modelValue', false);
    }

    function reset() {
        staged.value = [];
        portfolioName.value = '';
        pastedNames.value = '';
        activeTab.value = 'search';
        emit('update:modelValue', false);
    }

    // Reset staged list when dialog is opened
    watch(
        () => props.modelValue,
        (open) => {
            if (open) {
                staged.value = [];
                pastedNames.value = '';
                activeTab.value = 'search';
            }
        }
    );
</script>

<style scoped>
    .staged-chips {
        display: flex;
        flex-wrap: wrap;
        max-height: 100px;
        overflow-y: auto;
        border: 1px solid rgba(var(--dynamic-fg-rgb, 0 0 0), 0.12);
        border-radius: 8px;
        padding: 4px;
    }
</style>
