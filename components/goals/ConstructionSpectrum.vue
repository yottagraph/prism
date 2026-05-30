<template>
    <v-card variant="outlined" class="spectrum-card pa-4">
        <div class="d-flex align-center mb-3">
            <v-icon color="primary" size="small" class="mr-2">mdi-chart-scatter-plot</v-icon>
            <span class="text-subtitle-2 font-weight-medium">Portfolio Construction</span>
            <v-spacer />
            <span class="text-caption text-medium-emphasis">
                Where each goal sits on the conservative → aggressive spectrum
            </span>
        </div>

        <!-- Zone labels -->
        <div class="zone-labels mb-1">
            <span class="zone-label text-caption text-medium-emphasis">Conservative</span>
            <span class="zone-label text-caption text-medium-emphasis text-center">Moderate</span>
            <span class="zone-label text-caption text-medium-emphasis text-right">Aggressive</span>
        </div>

        <!-- Track -->
        <div class="spectrum-track" aria-label="Portfolio construction spectrum">
            <!-- Zone backgrounds -->
            <div class="zone zone--steady" title="Conservative: short-horizon, low-vol holdings" />
            <div class="zone zone--balanced" title="Moderate: medium-horizon holdings" />
            <div class="zone zone--growth" title="Aggressive: long-horizon, high-growth holdings" />

            <!-- Placeholder dots while analysis is not yet complete -->
            <div
                v-for="m in layout"
                :key="m.id"
                class="bucket-dot"
                :class="{ 'bucket-dot--placeholder': !ready }"
                :style="dotStyle(m)"
                :title="ready ? `${m.name}: avg risk score ${m.avgRiskScore}` : undefined"
                @click="ready ? $emit('open', m.id) : undefined"
            />
        </div>

        <!-- Label area: rows stagger to avoid overlap -->
        <div class="label-area" :style="{ height: `${labelRows * 18 + 4}px` }">
            <button
                v-for="m in layout"
                :key="`label-${m.id}`"
                type="button"
                class="bucket-label"
                :class="[labelAlignClass(m.pct), { 'bucket-label--placeholder': !ready }]"
                :style="labelStyle(m)"
                :title="ready ? `${m.name}: avg risk score ${m.avgRiskScore}` : undefined"
                @click="ready ? $emit('open', m.id) : undefined"
            >
                <span
                    class="label-swatch"
                    :style="{ background: ready ? m.color : undefined }"
                    :class="{ 'label-swatch--placeholder': !ready }"
                />
                <span class="label-text">{{ m.name }}</span>
            </button>
        </div>

        <!-- Sub-labels -->
        <div class="zone-labels mt-1">
            <span class="zone-label text-caption text-medium-emphasis" style="opacity: 0.6">
                Short horizon · low volatility
            </span>
            <span
                class="zone-label text-caption text-medium-emphasis text-right"
                style="opacity: 0.6"
            >
                Long horizon · high growth
            </span>
        </div>

        <!-- Pre-analysis caption -->
        <div
            v-if="!ready && buckets.length > 0"
            class="text-center text-caption text-medium-emphasis mt-2"
            style="opacity: 0.6"
        >
            Analyze your goals to map them by risk
        </div>

        <div v-if="buckets.length === 0" class="text-center text-medium-emphasis text-caption pa-4">
            No buckets to display.
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { BucketCardViewModel } from './BucketCard.vue';

    const props = withDefaults(
        defineProps<{
            buckets: BucketCardViewModel[];
            /** When false (pre-analysis), show muted evenly-spaced placeholder dots. */
            ready?: boolean;
        }>(),
        { ready: true }
    );

    defineEmits<{
        open: [bucketId: string];
    }>();

    interface MarkerLayout {
        id: string;
        name: string;
        avgRiskScore: number;
        /** Horizontal position on the 0–100 axis, clamped to [5, 95]. */
        pct: number;
        /** Vertical lane assigned so close markers don't overlap. */
        row: number;
        color: string;
    }

    /** Minimum horizontal gap (in %) two labels need before they can share a row. */
    const MIN_GAP_PCT = 22;

    function colorFor(fitColor: string): string {
        const token =
            fitColor === 'success'
                ? 'var(--v-theme-success)'
                : fitColor === 'error'
                  ? 'var(--v-theme-error)'
                  : fitColor === 'warning'
                    ? 'var(--v-theme-warning)'
                    : 'var(--v-theme-primary)';
        return `rgb(${token})`;
    }

    /**
     * Assign each bucket a horizontal position and a vertical row via a greedy
     * sweep. Buckets that land too close horizontally get pushed to a lower row
     * so their dots and labels never stack on top of each other.
     *
     * When !ready, evenly space all buckets across [10, 90] instead.
     */
    const layout = computed<MarkerLayout[]>(() => {
        const sorted = [...props.buckets].sort((a, b) => a.avgRiskScore - b.avgRiskScore);
        const n = sorted.length;
        if (!props.ready) {
            // Evenly spaced placeholder positions
            return sorted.map((bucket, i) => {
                const pct = n === 1 ? 50 : 10 + (i / (n - 1)) * 80;
                return {
                    id: bucket.id,
                    name: bucket.name,
                    avgRiskScore: bucket.avgRiskScore,
                    pct,
                    row: 0,
                    color: 'rgba(var(--v-theme-on-surface), 0.25)',
                };
            });
        }
        // Tracks the rightmost occupied pct per row.
        const rowEdges: number[] = [];
        return sorted.map((bucket) => {
            const pct = Math.min(95, Math.max(5, bucket.avgRiskScore));
            let row = rowEdges.findIndex((edge) => pct - edge >= MIN_GAP_PCT);
            if (row === -1) {
                row = rowEdges.length;
            }
            rowEdges[row] = pct;
            return {
                id: bucket.id,
                name: bucket.name,
                avgRiskScore: bucket.avgRiskScore,
                pct,
                row,
                color: colorFor(bucket.fitColor),
            };
        });
    });

    const labelRows = computed(() =>
        layout.value.length === 0 ? 0 : Math.max(...layout.value.map((m) => m.row)) + 1
    );

    /** Fan dots vertically within the track so identical-risk buckets stay visible. */
    function dotStyle(m: MarkerLayout): Record<string, string> {
        const offset = (m.row - (labelRows.value - 1) / 2) * 11;
        const base: Record<string, string> = {
            left: `${m.pct}%`,
            top: `calc(50% + ${offset}px)`,
        };
        if (props.ready) base.background = m.color;
        return base;
    }

    function labelStyle(m: MarkerLayout): Record<string, string> {
        return {
            left: `${m.pct}%`,
            top: `${m.row * 18}px`,
        };
    }

    /** Keep edge labels from clipping the card. */
    function labelAlignClass(pct: number): string {
        if (pct <= 15) return 'align-start';
        if (pct >= 85) return 'align-end';
        return 'align-center';
    }
</script>

<style scoped>
    .spectrum-card {
        border-radius: 8px;
    }

    .zone-labels {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
    }

    .zone-label {
        display: block;
    }

    .spectrum-track {
        position: relative;
        height: 48px;
        border-radius: 6px;
        display: flex;
        overflow: visible;
    }

    .zone {
        flex: 1;
        height: 100%;
        border-radius: 0;
    }

    .zone--steady {
        background: rgba(var(--v-theme-success), 0.12);
        border-radius: 6px 0 0 6px;
        border-right: 1px dashed rgba(var(--v-theme-on-surface), 0.1);
    }

    .zone--balanced {
        background: rgba(var(--v-theme-warning), 0.1);
        border-right: 1px dashed rgba(var(--v-theme-on-surface), 0.1);
    }

    .zone--growth {
        background: rgba(var(--v-theme-error), 0.1);
        border-radius: 0 6px 6px 0;
    }

    .bucket-dot {
        position: absolute;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid rgba(var(--v-theme-surface), 0.9);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
        transform: translate(-50%, -50%);
        cursor: pointer;
        z-index: 1;
        transition:
            left 0.8s cubic-bezier(0.22, 1, 0.36, 1),
            background 0.6s ease,
            transform 0.15s;
    }

    .bucket-dot:hover {
        transform: translate(-50%, -50%) scale(1.25);
        z-index: 2;
    }

    .bucket-dot--placeholder {
        background: rgba(var(--v-theme-on-surface), 0.18) !important;
        box-shadow: none;
        border-color: rgba(var(--v-theme-on-surface), 0.1);
        cursor: default;
        animation: dot-pulse 1.8s ease-in-out infinite;
    }

    .bucket-dot--placeholder:hover {
        transform: translate(-50%, -50%);
    }

    .label-swatch--placeholder {
        background: rgba(var(--v-theme-on-surface), 0.2) !important;
    }

    .bucket-label--placeholder {
        cursor: default;
        opacity: 0.5;
    }

    .bucket-label--placeholder:hover {
        color: rgba(var(--v-theme-on-surface), 0.85);
    }

    @keyframes dot-pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.4;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .bucket-dot--placeholder {
            animation: none;
        }
        .bucket-dot {
            transition: none;
        }
    }

    .label-area {
        position: relative;
        margin-top: 6px;
    }

    .bucket-label {
        position: absolute;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0;
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 10px;
        line-height: 1.3;
        color: rgba(var(--v-theme-on-surface), 0.85);
        max-width: 120px;
        white-space: nowrap;
    }

    .bucket-label.align-center {
        transform: translateX(-50%);
    }

    .bucket-label.align-start {
        transform: translateX(0);
    }

    .bucket-label.align-end {
        transform: translateX(-100%);
    }

    .bucket-label:hover {
        color: rgb(var(--v-theme-primary));
    }

    .label-swatch {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .label-text {
        overflow: hidden;
        text-overflow: ellipsis;
    }
</style>
