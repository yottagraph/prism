<template>
    <v-card class="pa-3 indicator-card">
        <div class="text-subtitle-2 mb-2">Bollinger Position</div>
        <div class="track">
            <div class="zone lower" />
            <div class="zone middle" />
            <div class="zone upper" />
            <div class="marker" :style="{ left: `${position}%` }" />
        </div>
        <div class="d-flex justify-space-between mt-1 text-caption text-medium-emphasis">
            <span>Lower</span>
            <span>Middle</span>
            <span>Upper</span>
        </div>
        <div class="mt-2 text-body-2">
            {{ description }}
            <span class="font-mono">({{ position.toFixed(0) }}%)</span>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    const props = defineProps<{ percentB: number | null }>();

    const position = computed(() => {
        const v = props.percentB;
        if (v == null || !Number.isFinite(v)) return 50;
        return Math.max(0, Math.min(100, v * 100));
    });

    const description = computed(() => {
        if (props.percentB == null) return 'No Bollinger data';
        if (position.value < 20) return 'Near lower band - potential support';
        if (position.value > 80) return 'Near upper band - potential resistance';
        return 'Inside normal range';
    });
</script>

<style scoped>
    .indicator-card {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .track {
        position: relative;
        display: flex;
        height: 16px;
        border-radius: 999px;
        overflow: hidden;
    }
    .zone {
        flex: 1;
    }
    .zone.lower {
        background: rgba(244, 67, 54, 0.25);
    }
    .zone.middle {
        background: rgba(255, 255, 255, 0.14);
    }
    .zone.upper {
        background: rgba(76, 175, 80, 0.25);
    }
    .marker {
        position: absolute;
        top: -2px;
        width: 8px;
        height: 20px;
        margin-left: -4px;
        border-radius: 999px;
        background: rgb(var(--v-theme-primary));
    }
    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
