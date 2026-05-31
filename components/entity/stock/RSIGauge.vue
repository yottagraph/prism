<template>
    <v-card class="pa-3 indicator-card">
        <div class="d-flex align-center mb-2">
            <div class="text-subtitle-2">RSI (14)</div>
            <HelpTooltip
                title="Relative Strength Index (14-day)"
                text="RSI measures the speed and magnitude of recent price changes. Below 30 = oversold (may bounce), above 70 = overbought (may pull back). Source: stock market data via Elemental."
                :size="13"
            />
            <v-spacer />
            <v-chip size="x-small" :color="statusColor" variant="tonal">{{ statusLabel }}</v-chip>
        </div>
        <svg viewBox="0 0 200 110" class="gauge">
            <path d="M20,100 A80,80 0 0 1 180,100" class="track" />
            <path d="M20,100 A80,80 0 0 1 73,30" class="zone oversold" />
            <path d="M73,30 A80,80 0 0 1 127,30" class="zone neutral" />
            <path d="M127,30 A80,80 0 0 1 180,100" class="zone overbought" />
            <line :x1="100" :y1="100" :x2="needle.x" :y2="needle.y" class="needle" />
            <circle cx="100" cy="100" r="4" class="needle-hub" />
            <text x="100" y="72" text-anchor="middle" class="value">{{ valueText }}</text>
            <text x="20" y="106" text-anchor="middle" class="tick">0</text>
            <text x="100" y="14" text-anchor="middle" class="tick">50</text>
            <text x="180" y="106" text-anchor="middle" class="tick">100</text>
        </svg>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    const props = defineProps<{ value: number | null }>();

    const clamped = computed(() => {
        if (props.value == null || !Number.isFinite(props.value)) return null;
        return Math.max(0, Math.min(100, props.value));
    });

    const valueText = computed(() => (clamped.value == null ? 'N/A' : clamped.value.toFixed(1)));

    const statusLabel = computed(() => {
        if (clamped.value == null) return 'No data';
        if (clamped.value < 30) return 'Oversold';
        if (clamped.value > 70) return 'Overbought';
        return 'Neutral';
    });

    const statusColor = computed(() => {
        if (clamped.value == null) return 'grey';
        if (clamped.value < 30) return 'info';
        if (clamped.value > 70) return 'warning';
        return 'success';
    });

    const needle = computed(() => {
        const v = clamped.value ?? 50;
        const angle = Math.PI - (v / 100) * Math.PI;
        const radius = 64;
        return {
            x: 100 + Math.cos(angle) * radius,
            y: 100 - Math.sin(angle) * radius,
        };
    });
</script>

<style scoped>
    .indicator-card {
        background: rgba(var(--dynamic-fg-rgb), 0.02);
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
    }
    .gauge {
        width: 100%;
        height: 120px;
    }
    .track {
        fill: none;
        stroke: rgba(var(--dynamic-fg-rgb), 0.08);
        stroke-width: 10;
    }
    .zone {
        fill: none;
        stroke-width: 10;
        stroke-linecap: round;
    }
    .oversold {
        stroke: rgba(33, 150, 243, 0.85);
    }
    .neutral {
        stroke: rgba(76, 175, 80, 0.85);
    }
    .overbought {
        stroke: rgba(255, 152, 0, 0.85);
    }
    .needle {
        stroke: var(--dynamic-text-primary);
        stroke-width: 2;
    }
    .needle-hub {
        fill: var(--dynamic-text-primary);
    }
    .value {
        fill: var(--dynamic-text-primary);
        font-size: 20px;
        font-family: var(--font-mono, ui-monospace, monospace);
    }
    .tick {
        fill: var(--dynamic-text-muted);
        font-size: 10px;
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
