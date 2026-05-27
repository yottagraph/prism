<template>
    <v-card class="pa-3 indicator-card">
        <div class="text-subtitle-2 mb-2">Volatility (20-day annualized)</div>
        <div class="text-h5 font-mono" :class="valueClass">{{ valueText }}</div>
        <v-progress-linear
            :model-value="Math.min(100, Math.max(0, value ?? 0))"
            :color="progressColor"
            height="8"
            rounded
            class="mt-2"
        />
        <div class="text-caption text-medium-emphasis mt-1">{{ statusLabel }}</div>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    const props = defineProps<{ value: number | null }>();

    const value = computed(() =>
        props.value != null && Number.isFinite(props.value) ? props.value : null
    );
    const valueText = computed(() => (value.value == null ? '—' : `${value.value.toFixed(1)}%`));
    const progressColor = computed(() => {
        if (value.value == null) return 'grey';
        if (value.value > 50) return 'error';
        if (value.value > 30) return 'warning';
        return 'success';
    });
    const valueClass = computed(() =>
        value.value == null
            ? ''
            : value.value > 50
              ? 'text-error'
              : value.value > 30
                ? 'text-warning'
                : ''
    );
    const statusLabel = computed(() => {
        if (value.value == null) return 'No volatility data';
        if (value.value > 50) return 'High volatility';
        if (value.value > 30) return 'Elevated volatility';
        return 'Normal volatility';
    });
</script>

<style scoped>
    .indicator-card {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
