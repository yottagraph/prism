<template>
    <div class="d-flex align-center ga-1">
        <v-icon size="x-small" :color="iconColor">{{ icon }}</v-icon>
        <span class="text-caption font-mono">
            {{ value != null ? `${value.toFixed(1)}%` : '—' }}
        </span>
    </div>
</template>

<script setup lang="ts">
    const props = defineProps<{ value?: number | null }>();

    const icon = computed(() => {
        if ((props.value ?? 0) > 15) return 'mdi-trending-up';
        if ((props.value ?? 0) < -15) return 'mdi-trending-down';
        return 'mdi-trending-neutral';
    });
    const iconColor = computed(() => {
        if ((props.value ?? 0) > 15) return 'success';
        if ((props.value ?? 0) < -15) return 'error';
        return 'medium-emphasis';
    });
</script>
