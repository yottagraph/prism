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
        if (normalized.value.includes('critical')) return 'error';
        if (normalized.value.includes('high')) return 'warning';
        if (normalized.value.includes('medium')) return 'info';
        if (normalized.value === '—') return 'default';
        return 'success';
    });
</script>
