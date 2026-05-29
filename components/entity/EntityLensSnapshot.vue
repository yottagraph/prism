<template>
    <v-card
        class="pa-3 lens-snapshot cursor-pointer"
        variant="outlined"
        :color="chipColor"
        @click="emit('navigate')"
    >
        <div class="d-flex align-center mb-2">
            <v-chip size="x-small" :color="chipColor" label class="mr-2">{{ sourceTag }}</v-chip>
            <span class="text-body-2 font-weight-medium">{{ title }}</span>
            <v-spacer />
            <v-chip v-if="score != null" :color="scoreLabelColor(score)" size="small" label>
                {{ tierLabel(scoreToLabel(score)) }}
            </v-chip>
            <span v-else class="text-caption text-medium-emphasis">No data</span>
        </div>
        <div v-if="highlights.length" class="highlight-list">
            <div
                v-for="(h, i) in highlights.slice(0, 2)"
                :key="i"
                class="text-caption text-medium-emphasis d-flex align-start ga-1 mb-1"
            >
                <v-icon size="x-small" color="warning" class="mt-0_5"
                    >mdi-alert-circle-outline</v-icon
                >
                <span>{{ h }}</span>
            </div>
        </div>
        <div v-else class="text-caption text-medium-emphasis">No significant findings.</div>
        <div class="text-right mt-1">
            <span class="text-caption text-primary">View details →</span>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { scoreToLabel, scoreLabelColor, tierLabel } from '~/composables/useFusedScoring';

    defineProps<{
        title: string;
        sourceTag: string;
        chipColor: string;
        score?: number | null;
        highlights: string[];
    }>();

    const emit = defineEmits<{ navigate: [] }>();
</script>

<style scoped>
    .lens-snapshot {
        transition: background 0.15s;
    }
    .lens-snapshot:hover {
        background: rgba(var(--v-theme-surface-variant), 0.04);
    }
    .mt-0_5 {
        margin-top: 2px;
    }
</style>
