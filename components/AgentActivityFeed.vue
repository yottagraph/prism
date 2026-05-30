<template>
    <v-card class="pa-3 fill-height feed-card">
        <div class="d-flex align-center mb-2">
            <v-icon size="small" class="mr-2">mdi-rss</v-icon>
            <span class="text-subtitle-2">Agent Activity</span>
            <v-spacer />
            <span class="text-caption text-medium-emphasis">live</span>
            <span class="live-dot ml-2" />
        </div>
        <div class="feed-list">
            <div v-if="!entries.length" class="text-caption text-medium-emphasis pa-4 text-center">
                Waiting for agent activity… click Analyze to see the pipeline in action.
            </div>
            <div v-for="e in entries" :key="e.id" class="feed-row">
                <span class="ts text-caption text-medium-emphasis font-mono">
                    {{ formatTs(e.timestamp) }}
                </span>
                <span class="agent text-caption">{{ e.agent }}</span>
                <span class="entity text-caption text-medium-emphasis">{{ e.entity }}</span>
                <span class="detail text-caption">{{ e.detail }}</span>
            </div>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import type { ActivityFeedEntry } from '~/composables/useAgentPipeline';

    defineProps<{ entries: ActivityFeedEntry[] }>();

    function formatTs(ms: number) {
        return new Date(ms).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    }
</script>

<style scoped>
    .feed-card {
        display: flex;
        flex-direction: column;
        max-height: 300px;
    }

    .feed-list {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .feed-row {
        display: grid;
        grid-template-columns: 80px 110px 160px 1fr;
        gap: 12px;
        padding: 4px 0;
        border-bottom: 1px dashed rgba(var(--dynamic-fg-rgb), 0.04);
        align-items: baseline;
    }

    .live-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--dynamic-primary);
        box-shadow: 0 0 8px var(--dynamic-primary);
        animation: pulse 1.4s infinite;
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 0.4;
        }
        50% {
            opacity: 1;
        }
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
