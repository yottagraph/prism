<template>
    <v-card variant="outlined" class="spectrum-card pa-4">
        <div class="d-flex align-center mb-3">
            <v-icon color="primary" size="small" class="mr-2">mdi-chart-scatter-plot</v-icon>
            <span class="text-subtitle-2 font-weight-medium">Portfolio Construction</span>
            <v-spacer />
            <span class="text-caption text-medium-emphasis">
                Steady → Growth spectrum by risk profile
            </span>
        </div>

        <!-- Zone labels -->
        <div class="zone-labels mb-1">
            <span class="zone-label text-caption text-medium-emphasis">Steady</span>
            <span class="zone-label text-caption text-medium-emphasis text-center">Balanced</span>
            <span class="zone-label text-caption text-medium-emphasis text-right">Growth</span>
        </div>

        <!-- Track -->
        <div class="spectrum-track" aria-label="Portfolio construction spectrum">
            <!-- Zone backgrounds -->
            <div class="zone zone--steady" title="Conservative: short-horizon, low-vol holdings" />
            <div class="zone zone--balanced" title="Moderate: medium-horizon holdings" />
            <div class="zone zone--growth" title="Aggressive: long-horizon, high-growth holdings" />

            <!-- Bucket markers -->
            <div
                v-for="bucket in buckets"
                :key="bucket.id"
                class="bucket-marker"
                :style="markerStyle(bucket)"
                :title="`${bucket.name}: avg risk score ${bucket.avgRiskScore}`"
                @click="$emit('open', bucket.id)"
            >
                <div class="marker-dot" :style="dotStyle(bucket)" />
                <div class="marker-label text-caption">{{ bucket.name }}</div>
            </div>
        </div>

        <!-- Sub-labels -->
        <div class="zone-labels mt-1">
            <span class="zone-label text-caption text-medium-emphasis" style="opacity: 0.6">
                Short horizon · low vol
            </span>
            <span
                class="zone-label text-caption text-medium-emphasis text-right"
                style="opacity: 0.6"
            >
                Long horizon · high growth
            </span>
        </div>

        <div v-if="buckets.length === 0" class="text-center text-medium-emphasis text-caption pa-4">
            No buckets to display.
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import type { BucketCardViewModel } from './BucketCard.vue';

    defineProps<{
        buckets: BucketCardViewModel[];
    }>();

    defineEmits<{
        open: [bucketId: string];
    }>();

    /**
     * Position the marker horizontally on the 0-100 axis.
     * avgRiskScore: conservative~25, moderate~50, aggressive~75.
     * We clamp to [5, 95] so labels always stay visible inside the track.
     */
    function markerStyle(bucket: BucketCardViewModel): Record<string, string> {
        const pct = Math.min(95, Math.max(5, bucket.avgRiskScore));
        return {
            left: `${pct}%`,
        };
    }

    function dotStyle(bucket: BucketCardViewModel): Record<string, string> {
        const color =
            bucket.fitColor === 'success'
                ? 'var(--v-theme-success)'
                : bucket.fitColor === 'error'
                  ? 'var(--v-theme-error)'
                  : bucket.fitColor === 'warning'
                    ? 'var(--v-theme-warning)'
                    : 'var(--v-theme-primary)';
        return {
            background: `rgb(${color})`,
        };
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
        height: 56px;
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

    .bucket-marker {
        position: absolute;
        top: 0;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        z-index: 1;
        height: 100%;
        justify-content: center;
        gap: 4px;
    }

    .bucket-marker:hover .marker-label {
        opacity: 1;
    }

    .marker-dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid rgba(var(--v-theme-surface), 0.8);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
        flex-shrink: 0;
    }

    .marker-label {
        white-space: nowrap;
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        opacity: 0.85;
        text-align: center;
        line-height: 1.2;
        transition: opacity 0.15s;
    }
</style>
