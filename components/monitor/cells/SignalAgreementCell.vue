<template>
    <div class="d-flex align-center ga-1">
        <v-chip size="x-small" :color="chipColor" variant="tonal" label>{{ label }}</v-chip>
    </div>
</template>

<script setup lang="ts">
    const props = defineProps<{ value?: string | null; summary?: string | null }>();

    const label = computed(() => {
        const value = props.value || 'limited';
        return value.replace('_', ' ');
    });

    const chipColor = computed(() => {
        const value = (props.value || '').toLowerCase();
        if (value === 'agreement') return 'success';
        if (value === 'conflict') return 'error';
        if (value === 'partial' || value === 'sec_only') return 'warning';
        return 'default';
    });
</script>
