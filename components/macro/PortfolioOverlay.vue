<template>
    <div class="mt-3 pt-3" style="border-top: 1px solid rgba(var(--v-border-color), 0.15)">
        <div class="d-flex align-center mb-2" style="gap: 8px">
            <v-icon size="small">mdi-briefcase-outline</v-icon>
            <span class="text-subtitle-2">Portfolio Alignment</span>
        </div>

        <!-- Sector tilt chips -->
        <div
            v-if="regime.sectorTilt.length"
            class="d-flex flex-wrap align-center mb-2"
            style="gap: 6px"
        >
            <v-chip
                v-for="tilt in visibleTilt"
                :key="tilt.bucket"
                size="x-small"
                variant="tonal"
                :prepend-icon="tilt.icon"
                :color="bucketColor(tilt.bucket)"
            >
                {{ tilt.label }}
                <span class="ml-1 font-weight-medium">{{ tilt.count }}</span>
            </v-chip>
            <span
                v-if="regime.sectorTilt.length > MAX_VISIBLE"
                class="text-caption text-medium-emphasis"
            >
                +{{ regime.sectorTilt.length - MAX_VISIBLE }} more
            </span>
        </div>

        <!-- Portfolio implication -->
        <div class="text-caption" :class="implicationColor">
            <v-icon size="x-small" class="mr-1">{{ implicationIcon }}</v-icon>
            {{ regime.portfolioImplication }}
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { MacroRegime } from '~/composables/useMacroRegime';
    import type { MacroFactorBucket } from '~/utils/macro/sectorFactors';

    const props = defineProps<{
        regime: MacroRegime;
    }>();

    const MAX_VISIBLE = 5;

    const visibleTilt = computed(() => props.regime.sectorTilt.slice(0, MAX_VISIBLE));

    const BUCKET_COLORS: Record<MacroFactorBucket, string> = {
        rate_sensitive: 'blue',
        defensive: 'teal',
        cyclical: 'orange',
        growth_tech: 'purple',
        energy: 'amber',
        unclassified: 'default',
    };

    function bucketColor(bucket: MacroFactorBucket): string {
        return BUCKET_COLORS[bucket] ?? 'default';
    }

    const implicationColor = computed(() => {
        if (props.regime.color === 'success') return 'text-success';
        if (props.regime.color === 'error') return 'text-error';
        if (props.regime.color === 'warning') return 'text-warning';
        return 'text-medium-emphasis';
    });

    const implicationIcon = computed(() => {
        if (props.regime.color === 'success') return 'mdi-arrow-up-circle-outline';
        if (props.regime.color === 'error') return 'mdi-alert-circle-outline';
        if (props.regime.color === 'warning') return 'mdi-alert-outline';
        return 'mdi-information-outline';
    });
</script>
