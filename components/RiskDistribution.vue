<template>
    <v-card class="pa-4">
        <div class="d-flex align-center mb-3">
            <v-icon size="small" class="mr-2">mdi-chart-bar</v-icon>
            <span class="text-subtitle-2">Risk Distribution</span>
            <v-spacer />
            <span v-if="scanning" class="d-inline-flex align-center scan-live">
                <span class="scan-live-dot mr-1" />
                <span class="text-caption">Scoring</span>
            </span>
            <span v-else-if="total > 0" class="text-caption text-medium-emphasis">
                {{ total }} scored
            </span>
        </div>
        <div class="dist-grid">
            <div v-for="row in rows" :key="row.tier" class="dist-row">
                <div class="dist-header">
                    <div class="d-flex align-center dist-label">
                        <span
                            class="dist-dot mr-2"
                            :style="{ backgroundColor: `rgb(var(--v-theme-${row.color}))` }"
                        />
                        <span class="text-body-2">{{ row.label }}</span>
                    </div>
                    <span class="text-body-2 text-medium-emphasis dist-count">
                        <AnimatedNumber :value="row.count" />
                    </span>
                </div>
                <v-progress-linear
                    :model-value="(row.count / Math.max(1, total)) * 100"
                    :color="row.color"
                    height="6"
                    rounded
                    class="dist-bar mb-1"
                    :class="{ 'dist-bar--live': scanning && row.count > 0 }"
                />
                <div class="text-caption text-medium-emphasis dist-detail">{{ row.detail }}</div>
            </div>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { RiskTier } from '~/composables/useFusedScoring';
    import { tierColor, tierLabel } from '~/composables/useFusedScoring';

    const props = withDefaults(
        defineProps<{
            counts: Record<RiskTier, number>;
            /** Per-tier key drivers/events summary (e.g. "Solvency · News"). */
            details?: Partial<Record<RiskTier, string>>;
            scanning?: boolean;
        }>(),
        { scanning: false }
    );

    const tiers: RiskTier[] = ['critical', 'high', 'medium', 'low'];
    const total = computed(() => tiers.reduce((s, t) => s + (props.counts[t] || 0), 0));
    const rows = computed(() =>
        tiers.map((t) => {
            const count = props.counts[t] || 0;
            const drivers = props.details?.[t]?.trim();
            return {
                tier: t,
                label: tierLabel(t),
                color: tierColor(t),
                count,
                detail: count === 0 ? 'No entities' : drivers || '—',
            };
        })
    );
</script>

<style scoped>
    .dist-grid {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .dist-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 3px;
    }

    .dist-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .dist-count {
        font-variant-numeric: tabular-nums;
        text-align: right;
    }

    .dist-detail {
        line-height: 1.3;
        min-height: 16px;
    }

    /* Smooth eased fill so tier counts animate as entities are scored. */
    .dist-bar :deep(.v-progress-linear__determinate) {
        transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1) !important;
        overflow: hidden;
    }

    .dist-bar--live :deep(.v-progress-linear__determinate)::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.55) 50%,
            transparent 100%
        );
        animation: dist-sweep 1.5s ease-in-out infinite;
    }

    @keyframes dist-sweep {
        0% {
            transform: translateX(-100%);
        }
        100% {
            transform: translateX(200%);
        }
    }

    .scan-live {
        color: rgb(var(--dynamic-primary-rgb, 63, 234, 0));
    }

    .scan-live-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: rgb(var(--dynamic-primary-rgb, 63, 234, 0));
        animation: scan-pulse 1.2s ease-in-out infinite;
    }

    @keyframes scan-pulse {
        0%,
        100% {
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(var(--dynamic-primary-rgb, 63, 234, 0), 0.5);
        }
        50% {
            opacity: 0.5;
            box-shadow: 0 0 0 4px rgba(var(--dynamic-primary-rgb, 63, 234, 0), 0);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .dist-bar--live :deep(.v-progress-linear__determinate)::after {
            animation: none;
        }
        .scan-live-dot {
            animation: none;
        }
    }
</style>
