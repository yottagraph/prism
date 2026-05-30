<template>
    <div class="scan-signal-lanes">
        <!-- Headline row -->
        <div class="d-flex align-center mb-1" style="gap: 8px">
            <span class="scan-live">
                <span class="scan-live-dot mr-1" />
            </span>
            <span class="text-h5 font-weight-bold text-medium-emphasis">Analyzing goals…</span>
        </div>
        <div class="text-body-2 text-medium-emphasis mb-3">
            <AnimatedNumber :value="scored" />
            of {{ total }} holdings scored · fusing signals across sources
        </div>

        <!-- Signal lanes -->
        <div class="lane-rows">
            <div v-for="lane in lanes" :key="lane.key" class="lane-row">
                <div class="lane-header">
                    <div class="d-flex align-center" style="gap: 6px">
                        <v-icon :color="lane.color" size="16">{{ lane.icon }}</v-icon>
                        <span class="text-body-2">{{ lane.label }}</span>
                    </div>
                    <span class="lane-count text-body-2 text-medium-emphasis">
                        <AnimatedNumber :value="coverage[lane.key]" />/{{ total }}
                    </span>
                </div>
                <v-progress-linear
                    :model-value="pct(coverage[lane.key])"
                    :color="lane.color"
                    height="4"
                    rounded
                    class="fusion-bar"
                    :class="{ 'fusion-bar--live': coverage[lane.key] > 0 }"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    const props = defineProps<{
        coverage: { sec: number; news: number; stock: number; screening: number };
        total: number;
        scored: number;
    }>();

    const lanes = [
        {
            key: 'sec' as const,
            label: 'SEC filings',
            icon: 'mdi-file-document-outline',
            color: 'primary',
        },
        {
            key: 'news' as const,
            label: 'News signals',
            icon: 'mdi-newspaper-variant-outline',
            color: 'info',
        },
        {
            key: 'stock' as const,
            label: 'Market data',
            icon: 'mdi-chart-line',
            color: 'success',
        },
        {
            key: 'screening' as const,
            label: 'Screening',
            icon: 'mdi-shield-alert-outline',
            color: 'error',
        },
    ];

    function pct(n: number): number {
        return (n / Math.max(1, props.total)) * 100;
    }
</script>

<style scoped>
    .scan-signal-lanes {
        width: 100%;
    }

    .lane-rows {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .lane-row {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .lane-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2px;
    }

    .lane-count {
        font-variant-numeric: tabular-nums;
        min-width: 36px;
        text-align: right;
    }

    /* Eased fill — same curve as SourceFusionBar */
    .fusion-bar :deep(.v-progress-linear__determinate) {
        transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1) !important;
        overflow: hidden;
    }

    /* Shimmer sweep while a lane has data and the scan is live */
    .fusion-bar--live :deep(.v-progress-linear__determinate)::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.55) 50%,
            transparent 100%
        );
        animation: fusion-sweep 1.5s ease-in-out infinite;
    }

    @keyframes fusion-sweep {
        0% {
            transform: translateX(-100%);
        }
        100% {
            transform: translateX(200%);
        }
    }

    /* Pulse dot — identical to SourceFusionBar */
    .scan-live {
        display: inline-flex;
        align-items: center;
        color: rgb(var(--dynamic-primary-rgb, 63, 234, 0));
    }

    .scan-live-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
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
        .fusion-bar--live :deep(.v-progress-linear__determinate)::after {
            animation: none;
        }
        .scan-live-dot {
            animation: none;
        }
    }
</style>
