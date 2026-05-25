<template>
    <v-card class="pa-4 fill-height">
        <div class="d-flex align-center mb-3">
            <v-icon size="small" class="mr-2">mdi-chart-bar</v-icon>
            <span class="text-subtitle-2">Risk Distribution</span>
        </div>
        <div class="dist-grid">
            <div v-for="row in rows" :key="row.tier" class="dist-row">
                <div class="d-flex justify-space-between align-center mb-1">
                    <v-chip :color="row.color" size="x-small" variant="tonal" label>
                        {{ row.label }}
                    </v-chip>
                    <span class="text-caption text-medium-emphasis">{{ row.count }}</span>
                </div>
                <v-progress-linear
                    :model-value="(row.count / Math.max(1, total)) * 100"
                    :color="row.color"
                    height="6"
                    rounded
                />
            </div>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { RiskTier } from '~/composables/useFusedScoring';
    import { tierColor, tierLabel } from '~/composables/useFusedScoring';

    const props = defineProps<{
        counts: Record<RiskTier, number>;
    }>();

    const tiers: RiskTier[] = ['critical', 'high', 'watch', 'normal'];
    const total = computed(() => tiers.reduce((s, t) => s + (props.counts[t] || 0), 0));
    const rows = computed(() =>
        tiers.map((t) => ({
            tier: t,
            label: tierLabel(t),
            color: tierColor(t),
            count: props.counts[t] || 0,
        }))
    );
</script>

<style scoped>
    .dist-grid {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
</style>
