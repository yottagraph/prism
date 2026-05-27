<template>
    <v-card class="pa-3 indicator-card">
        <div class="d-flex align-center mb-2">
            <div class="text-subtitle-2">MACD</div>
            <v-spacer />
            <v-chip size="x-small" :color="isBullish ? 'success' : 'error'" variant="tonal">
                {{ isBullish ? 'Bullish' : 'Bearish' }}
            </v-chip>
        </div>
        <svg viewBox="0 0 220 120" class="macd-svg">
            <line x1="8" y1="60" x2="212" y2="60" class="zero-line" />
            <rect
                x="102"
                :y="histY"
                width="16"
                :height="histHeight"
                :class="['hist', histogram >= 0 ? 'pos' : 'neg']"
            />
            <line x1="20" y1="80" x2="110" :y2="macdY" class="macd-line" />
            <line x1="20" y1="86" x2="110" :y2="signalY" class="signal-line" />
            <circle cx="110" :cy="macdY" r="3" class="macd-dot" />
            <circle cx="110" :cy="signalY" r="3" class="signal-dot" />
            <text x="126" y="30" class="label">MACD {{ macd.toFixed(2) }}</text>
            <text x="126" y="47" class="label">Signal {{ signal.toFixed(2) }}</text>
            <text x="126" y="64" class="label">Hist {{ histogram.toFixed(2) }}</text>
        </svg>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    const props = defineProps<{
        macd: number | null;
        signal: number | null;
        histogram: number | null;
    }>();

    const macd = computed(() => props.macd ?? 0);
    const signal = computed(() => props.signal ?? 0);
    const histogram = computed(() => props.histogram ?? 0);
    const isBullish = computed(() => macd.value >= signal.value);

    function y(v: number) {
        const clamped = Math.max(-4, Math.min(4, v));
        return 60 - clamped * 10;
    }
    const macdY = computed(() => y(macd.value));
    const signalY = computed(() => y(signal.value));
    const histY = computed(() => (histogram.value >= 0 ? y(histogram.value) : 60));
    const histHeight = computed(() => Math.max(1, Math.abs(y(histogram.value) - 60)));
</script>

<style scoped>
    .indicator-card {
        background: rgba(var(--dynamic-fg-rgb), 0.02);
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
    }
    .macd-svg {
        width: 100%;
        height: 120px;
    }
    .zero-line {
        stroke: rgba(var(--dynamic-fg-rgb), 0.2);
        stroke-dasharray: 3 3;
    }
    .hist {
        fill: rgba(var(--dynamic-fg-rgb), 0.5);
    }
    .hist.pos {
        fill: rgba(76, 175, 80, 0.65);
    }
    .hist.neg {
        fill: rgba(244, 67, 54, 0.65);
    }
    .macd-line {
        stroke: rgba(76, 175, 80, 0.95);
        stroke-width: 2;
    }
    .signal-line {
        stroke: rgba(255, 152, 0, 0.95);
        stroke-width: 2;
    }
    .macd-dot {
        fill: rgba(76, 175, 80, 0.95);
    }
    .signal-dot {
        fill: rgba(255, 152, 0, 0.95);
    }
    .label {
        fill: var(--dynamic-text-secondary);
        font-size: 10px;
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
