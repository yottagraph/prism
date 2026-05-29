<template>
    <div class="agent-steps">
        <div v-for="step in steps" :key="step.agent" class="step-row d-flex align-start mb-2">
            <div class="step-icon-wrap mr-3 flex-shrink-0">
                <v-icon :color="step.color" size="20">{{ step.icon }}</v-icon>
            </div>
            <div class="flex-grow-1 min-width-0">
                <div class="d-flex align-center">
                    <span class="text-body-2 font-weight-medium">{{ step.agent }}</span>
                    <v-chip
                        v-if="step.status === 'working'"
                        size="x-small"
                        color="primary"
                        variant="tonal"
                        class="ml-2"
                    >
                        Working…
                    </v-chip>
                    <v-chip
                        v-else-if="step.status === 'completed'"
                        size="x-small"
                        color="success"
                        variant="tonal"
                        class="ml-2"
                    >
                        <v-icon start size="x-small">mdi-check</v-icon>
                        {{ step.durationMs ? formatDuration(step.durationMs) : 'Done' }}
                    </v-chip>
                    <v-chip v-else size="x-small" color="grey" variant="tonal" class="ml-2">
                        Pending
                    </v-chip>
                </div>
                <div class="text-caption text-medium-emphasis">{{ step.summary }}</div>
                <div
                    v-if="showDetails && step.detail"
                    class="text-caption text-medium-emphasis mt-1"
                    style="opacity: 0.75"
                >
                    {{ step.detail }}
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    export interface GenerationStep {
        agent: string;
        icon: string;
        color: string;
        status: 'completed' | 'working' | 'pending';
        summary: string;
        detail?: string;
        durationMs?: number;
    }

    defineProps<{
        steps: GenerationStep[];
        showDetails?: boolean;
    }>();

    function formatDuration(ms: number): string {
        if (ms < 1000) return `${Math.round(ms)}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    }
</script>
