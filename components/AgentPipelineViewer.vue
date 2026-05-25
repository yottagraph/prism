<template>
    <v-card class="pa-4">
        <div class="d-flex align-center mb-3">
            <v-icon size="small" class="mr-2">mdi-pipe</v-icon>
            <span class="text-subtitle-2">Agent Pipeline</span>
        </div>
        <div class="pipeline-row">
            <template v-for="(step, i) in steps" :key="step.name">
                <div class="step" :class="`status-${step.status}`">
                    <div class="step-num">{{ i + 1 }}</div>
                    <div class="step-content">
                        <div class="d-flex align-center">
                            <span class="text-body-2 font-weight-medium">{{ step.label }}</span>
                            <v-progress-circular
                                v-if="step.status === 'working'"
                                indeterminate
                                size="14"
                                width="2"
                                color="primary"
                                class="ml-2"
                            />
                            <v-icon
                                v-else-if="step.status === 'completed'"
                                size="x-small"
                                color="success"
                                class="ml-2"
                            >
                                mdi-check-circle
                            </v-icon>
                            <v-icon
                                v-else-if="step.status === 'error'"
                                size="x-small"
                                color="error"
                                class="ml-2"
                            >
                                mdi-alert-circle
                            </v-icon>
                        </div>
                        <div class="text-caption text-medium-emphasis">
                            {{ step.description }}
                        </div>
                        <div
                            v-if="step.status === 'completed' && step.evidenceCount"
                            class="text-caption mt-1"
                        >
                            <v-icon size="x-small" class="mr-1">mdi-file-document-outline</v-icon>
                            {{ step.evidenceCount }} evidence items ·
                            {{
                                step.completedAt && step.startedAt
                                    ? ((step.completedAt - step.startedAt) / 1000).toFixed(1)
                                    : '–'
                            }}s
                        </div>
                    </div>
                </div>
                <div v-if="i < steps.length - 1" class="step-connector" />
            </template>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import type { PipelineStepState } from '~/composables/useAgentPipeline';

    defineProps<{ steps: PipelineStepState[] }>();
</script>

<style scoped>
    .pipeline-row {
        display: flex;
        flex-direction: column;
        gap: 0;
    }

    .step {
        display: flex;
        gap: 12px;
        padding: 12px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .step-num {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.6);
    }

    .step-content {
        flex: 1;
        min-width: 0;
    }

    .status-working {
        border-color: rgba(63, 234, 0, 0.4);
        background: rgba(63, 234, 0, 0.04);
    }

    .status-completed {
        border-color: rgba(63, 234, 0, 0.2);
    }

    .status-error {
        border-color: rgba(239, 68, 68, 0.4);
        background: rgba(239, 68, 68, 0.04);
    }

    .step-connector {
        height: 16px;
        width: 2px;
        background: rgba(255, 255, 255, 0.08);
        margin-left: 24px;
    }
</style>
