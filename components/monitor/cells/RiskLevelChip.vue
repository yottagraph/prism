<template>
    <v-chip :color="chipColor" size="x-small" variant="tonal" label>
        {{ label }}
    </v-chip>
</template>

<script setup lang="ts">
    const props = defineProps<{ value?: string | null }>();

    const normalized = computed(() => String(props.value || '—').toLowerCase());
    const label = computed(() =>
        normalized.value === '—'
            ? '—'
            : normalized.value.charAt(0).toUpperCase() + normalized.value.slice(1)
    );
    const chipColor = computed(() => {
        if (normalized.value.includes('critical') || normalized.value.includes('high'))
            return 'error';
        if (normalized.value.includes('medium') || normalized.value.includes('watch'))
            return 'warning';
        if (normalized.value === '—') return 'default';
        return 'success';
    });
</script>
