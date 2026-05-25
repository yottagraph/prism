<template>
    <v-card class="pa-4">
        <div class="d-flex align-center mb-3">
            <v-icon size="small" class="mr-2">mdi-layers-triple-outline</v-icon>
            <span class="text-subtitle-2">Source Fusion Coverage</span>
        </div>
        <v-row dense>
            <v-col v-for="src in sources" :key="src.key" cols="6" sm="3">
                <div class="source-row">
                    <div class="d-flex justify-space-between align-center mb-1">
                        <span class="text-caption text-uppercase letter-spaced">{{
                            src.label
                        }}</span>
                        <span class="text-caption text-medium-emphasis">
                            {{ src.coverage }}/{{ total }}
                        </span>
                    </div>
                    <v-progress-linear
                        :model-value="(src.coverage / Math.max(1, total)) * 100"
                        :color="src.color"
                        height="6"
                        rounded
                    />
                </div>
            </v-col>
        </v-row>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    const props = defineProps<{
        total: number;
        coverage: { sec: number; news: number; stock: number; poly: number };
    }>();

    const sources = computed(() => [
        { key: 'sec', label: 'SEC', coverage: props.coverage.sec, color: 'primary' },
        { key: 'news', label: 'News', coverage: props.coverage.news, color: 'info' },
        { key: 'stock', label: 'Stock', coverage: props.coverage.stock, color: 'success' },
        { key: 'poly', label: 'Polymarket', coverage: props.coverage.poly, color: 'warning' },
    ]);
</script>

<style scoped>
    .letter-spaced {
        letter-spacing: 0.08em;
    }
</style>
