<template>
    <v-card class="pa-3 indicator-card">
        <div class="text-subtitle-2 mb-2">Volume (vs 20-day avg)</div>
        <div class="text-h5 font-mono">{{ ratioText }}x</div>
        <v-progress-linear
            :model-value="progressValue"
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

    const props = defineProps<{ ratio: number | null }>();

    const ratioText = computed(() => {
        if (props.ratio == null || !Number.isFinite(props.ratio)) return '—';
        return props.ratio.toFixed(2);
    });
    const progressValue = computed(() => {
        if (props.ratio == null || !Number.isFinite(props.ratio)) return 0;
        return Math.max(0, Math.min(100, props.ratio * 50));
    });
    const progressColor = computed(() => {
        const ratio = props.ratio ?? 1;
        if (ratio > 2) return 'warning';
        if (ratio < 0.7) return 'grey';
        return 'primary';
    });
    const statusLabel = computed(() => {
        const ratio = props.ratio;
        if (ratio == null) return 'No volume ratio available';
        if (ratio > 2) return 'Unusually high volume';
        if (ratio > 1.2) return 'Above average volume';
        if (ratio < 0.7) return 'Below average volume';
        return 'Normal volume';
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
