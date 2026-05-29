<template>
    <v-chip size="x-small" variant="tonal" :color="chipColor" label>
        {{ label }}
    </v-chip>
</template>

<script setup lang="ts">
    const props = defineProps<{ value?: string | null }>();

    const label = computed(() => {
        if (!props.value) return 'low data';
        if (props.value === 'insufficient_data') return 'low volume';
        return props.value.replaceAll('_', ' ');
    });
    const chipColor = computed(() => {
        const value = (props.value || '').toLowerCase();
        if (value.includes('high_negative') || value.includes('crisis')) return 'error';
        if (value.includes('high_positive')) return 'success';
        if (value.includes('low_negative') || value.includes('concern')) return 'warning';
        return 'default';
    });
</script>
