<template>
    <v-select
        :model-value="modelValue"
        :items="items"
        density="compact"
        hide-details
        variant="outlined"
        style="max-width: 120px"
        @update:model-value="(value) => emit('update:modelValue', value)"
    />
</template>

<script setup lang="ts">
    defineProps<{ modelValue?: 'HIGH' | 'MEDIUM' | 'LOW' | 'IGNORE' | null }>();
    const emit = defineEmits<{
        'update:modelValue': [value: 'HIGH' | 'MEDIUM' | 'LOW' | 'IGNORE' | null];
    }>();
    const items = ['HIGH', 'MEDIUM', 'LOW', 'IGNORE'];
</script>
