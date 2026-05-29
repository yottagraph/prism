<template>
    <div v-if="regime.sectorTilt.length || insightText">
        <!-- Sector tilt chips — all shown, no truncation -->
        <div
            v-if="regime.sectorTilt.length"
            class="d-flex flex-wrap align-center"
            style="gap: 6px; row-gap: 4px"
        >
            <v-chip
                v-for="tilt in regime.sectorTilt"
                :key="tilt.bucket"
                size="x-small"
                variant="tonal"
                :prepend-icon="tilt.icon"
                :color="bucketColor(tilt.bucket)"
            >
                {{ tilt.label }}
                <span class="ml-1 font-weight-medium">{{ tilt.count }}</span>
            </v-chip>
        </div>

        <!-- Gemini-generated portfolio insight -->
        <div v-if="insightText || insightLoading" class="mt-1" style="text-align: left">
            <span v-if="insightLoading" class="text-caption text-medium-emphasis">
                <v-progress-circular size="10" width="1.5" indeterminate class="mr-1" />
                Analyzing portfolio…
            </span>
            <span v-else class="text-caption text-medium-emphasis">{{ insightText }}</span>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { ref, watch } from 'vue';
    import type { MacroRegime } from '~/composables/useMacroRegime';
    import type { MacroFactorBucket } from '~/utils/macro/sectorFactors';

    const props = defineProps<{
        regime: MacroRegime;
    }>();

    const insightText = ref('');
    const insightLoading = ref(false);
    // Track which regime label the insight was generated for to avoid re-firing.
    const insightForLabel = ref('');

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

    async function fetchInsight() {
        if (!props.regime.ready || !props.regime.sectorTilt.length) return;
        // Skip if we already have an insight for this regime label.
        const cacheKey = `${props.regime.label}::${props.regime.sectorTilt.map((t) => `${t.bucket}:${t.count}`).join(',')}`;
        if (insightForLabel.value === cacheKey) return;

        insightLoading.value = true;
        insightForLabel.value = cacheKey;
        try {
            const res = await $fetch<{ insight: string }>('/api/macro/portfolio-insight', {
                method: 'POST',
                body: {
                    regimeLabel: props.regime.label,
                    synthesis: props.regime.synthesis,
                    sectorTilt: props.regime.sectorTilt.map((t) => ({
                        label: t.label,
                        count: t.count,
                        bucket: t.bucket,
                    })),
                    totalEntities: props.regime.sectorTilt.reduce((s, t) => s + t.count, 0),
                },
            });
            insightText.value = res.insight ?? '';
        } catch {
            // Silently fail — the chips still show sector composition.
            insightText.value = '';
        } finally {
            insightLoading.value = false;
        }
    }

    // Fire when regime first becomes ready, or when the regime label changes.
    watch(
        () => props.regime.ready,
        (ready) => {
            if (ready) fetchInsight();
        },
        { immediate: true }
    );
</script>
