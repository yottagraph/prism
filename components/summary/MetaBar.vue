<template>
    <div class="summary-meta-bar d-flex align-center flex-wrap gap-3 pa-3">
        <div class="d-flex align-center gap-2 text-caption text-medium-emphasis">
            <v-icon size="x-small">mdi-domain</v-icon>
            <span>{{ entityCount }} entities</span>
        </div>
        <v-divider vertical class="mx-1" />
        <div v-if="readTime" class="d-flex align-center gap-2 text-caption text-medium-emphasis">
            <v-icon size="x-small">mdi-clock-outline</v-icon>
            <span>{{ readTime }}</span>
        </div>
        <div v-if="model" class="d-flex align-center gap-2 text-caption text-medium-emphasis">
            <v-icon size="x-small">mdi-brain</v-icon>
            <span>{{ model }}</span>
        </div>
        <v-spacer />
        <div v-if="usage" class="d-flex align-center gap-2 text-caption text-medium-emphasis">
            <v-icon size="x-small">mdi-lightning-bolt</v-icon>
            <span
                >{{ usage.prompt_tokens.toLocaleString() }} in<template
                    v-if="usage.thinking_tokens"
                >
                    &middot; {{ usage.thinking_tokens.toLocaleString() }} thinking</template
                >
                &middot; {{ usage.completion_tokens.toLocaleString() }} out</span
            >
            <span v-if="usage.cost_usd">&middot; ${{ usage.cost_usd.toFixed(4) }}</span>
        </div>
        <v-btn
            v-if="agentSteps?.length"
            size="x-small"
            variant="text"
            :color="showAgentDetails ? 'primary' : 'grey'"
            @click="$emit('update:showAgentDetails', !showAgentDetails)"
        >
            <v-icon start size="x-small">mdi-robot-outline</v-icon>
            Agent trace
        </v-btn>
        <div v-if="feedback !== undefined" class="d-flex align-center gap-1">
            <v-btn
                size="x-small"
                icon
                variant="text"
                :color="feedback === 'positive' ? 'success' : 'grey'"
                :loading="feedbackLoading"
                @click="$emit('feedback', 'positive')"
            >
                <v-icon size="small">mdi-thumb-up-outline</v-icon>
            </v-btn>
            <v-btn
                size="x-small"
                icon
                variant="text"
                :color="feedback === 'negative' ? 'error' : 'grey'"
                :loading="feedbackLoading"
                @click="$emit('feedback', 'negative')"
            >
                <v-icon size="small">mdi-thumb-down-outline</v-icon>
            </v-btn>
        </div>
    </div>
</template>

<script setup lang="ts">
    defineProps<{
        entityCount: number;
        readTime?: string;
        model?: string;
        usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            thinking_tokens?: number;
            total_tokens: number;
            cost_usd?: number;
        } | null;
        agentSteps?: any[];
        showAgentDetails?: boolean;
        feedback?: 'positive' | 'negative' | null;
        feedbackLoading?: boolean;
    }>();

    defineEmits<{
        'update:showAgentDetails': [value: boolean];
        feedback: [type: 'positive' | 'negative'];
    }>();
</script>

<style scoped>
    .summary-meta-bar {
        border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
        background: rgba(var(--v-theme-surface-variant), 0.3);
    }
    .gap-1 {
        gap: 4px;
    }
    .gap-2 {
        gap: 8px;
    }
    .gap-3 {
        gap: 12px;
    }
</style>
