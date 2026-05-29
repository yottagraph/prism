<template>
    <!-- Gemini-generated portfolio insight replaces the sector tilt chips -->
    <div v-if="insightText || insightLoading" style="text-align: left">
        <span v-if="insightLoading" class="text-caption text-medium-emphasis">
            <v-progress-circular size="10" width="1.5" indeterminate class="mr-1" />
            Analyzing portfolio…
        </span>
        <span v-else class="text-caption text-medium-emphasis">{{ insightText }}</span>
    </div>
</template>

<script setup lang="ts">
    import { ref, watch } from 'vue';
    import type { MacroRegime } from '~/composables/useMacroRegime';

    const props = defineProps<{
        regime: MacroRegime;
    }>();

    const insightText = ref('');
    const insightLoading = ref(false);
    // Track which regime label the insight was generated for to avoid re-firing.
    const insightForLabel = ref('');

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
