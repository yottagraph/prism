<template>
    <div>
        <!-- Filter controls -->
        <v-card class="pa-4 mb-3">
            <div class="d-flex flex-wrap align-center ga-3">
                <v-chip-group v-model="activeSource" mandatory>
                    <v-chip value="ALL" size="small" filter>All sources</v-chip>
                    <v-chip value="SEC" size="small" color="primary" filter>SEC</v-chip>
                    <v-chip value="NEWS" size="small" color="info" filter>News</v-chip>
                    <v-chip value="STOCK" size="small" color="success" filter>Stock</v-chip>
                    <v-chip value="POLY" size="small" color="purple" filter>Polymarket</v-chip>
                </v-chip-group>
                <v-spacer />
                <v-chip-group v-model="activeSeverity" mandatory>
                    <v-chip value="ALL" size="small" filter>All severity</v-chip>
                    <v-chip value="high" size="small" color="error" filter>High</v-chip>
                    <v-chip value="medium" size="small" color="warning" filter>Medium</v-chip>
                    <v-chip value="low" size="small" filter>Low</v-chip>
                </v-chip-group>
            </div>
        </v-card>

        <!-- Events list -->
        <v-card>
            <template v-if="filteredEvents.length">
                <div class="event-list">
                    <div
                        v-for="(ev, idx) in filteredEvents"
                        :key="`${ev.date}-${ev.title}-${idx}`"
                        class="event-row pa-3"
                        :class="{ 'event-row--first': idx === 0 }"
                    >
                        <div class="d-flex align-start ga-3">
                            <div class="event-meta">
                                <div class="text-caption font-mono text-medium-emphasis">
                                    {{ ev.date || '—' }}
                                </div>
                                <SourceBadge :source="ev.source || 'SEC'" class="mt-1" />
                            </div>
                            <div class="flex-grow-1">
                                <div class="d-flex align-start ga-2">
                                    <v-chip
                                        :color="severityColor(ev.severity)"
                                        size="x-small"
                                        label
                                        variant="tonal"
                                        class="flex-shrink-0"
                                    >
                                        {{ ev.category }}
                                    </v-chip>
                                    <span class="text-body-2">{{ ev.title }}</span>
                                </div>
                                <div v-if="ev.citations?.length" class="d-flex flex-wrap ga-1 mt-2">
                                    <CitationChip
                                        v-for="(citation, cidx) in ev.citations"
                                        :key="cidx"
                                        :citation="citation"
                                    />
                                </div>
                            </div>
                            <v-icon
                                :color="severityColor(ev.severity)"
                                size="small"
                                class="flex-shrink-0 mt-1"
                            >
                                {{ severityIcon(ev.severity) }}
                            </v-icon>
                        </div>
                    </div>
                </div>
                <div class="pa-3 text-caption text-medium-emphasis text-center">
                    {{ filteredEvents.length }} event{{ filteredEvents.length !== 1 ? 's' : '' }}
                    <template v-if="activeSource !== 'ALL' || activeSeverity !== 'ALL'">
                        (filtered from {{ events.length }} total)
                    </template>
                </div>
            </template>
            <div v-else class="pa-8 text-center text-medium-emphasis">
                <v-icon size="large" class="mb-3">mdi-calendar-blank-outline</v-icon>
                <div>No events match the current filters.</div>
            </div>
        </v-card>
    </div>
</template>

<script setup lang="ts">
    import CitationChip from '~/components/CitationChip.vue';

    export interface ProfileEvent {
        date: string;
        category: string;
        title: string;
        severity: 'low' | 'medium' | 'high';
        source?: string;
        citations?: Array<{
            ref?: string;
            url?: string;
            title?: string;
            source?: string;
            date?: string;
            snippet?: string;
        }>;
    }

    const props = defineProps<{
        events: ProfileEvent[];
        loading?: boolean;
    }>();

    const activeSource = ref<'ALL' | 'SEC' | 'NEWS' | 'STOCK' | 'POLY'>('ALL');
    const activeSeverity = ref<'ALL' | 'high' | 'medium' | 'low'>('ALL');

    // Sort newest first
    const sortedEvents = computed(() =>
        [...props.events].sort((a, b) => {
            const aTs = a.date ? Date.parse(a.date) : Number.NaN;
            const bTs = b.date ? Date.parse(b.date) : Number.NaN;
            const aValid = Number.isFinite(aTs);
            const bValid = Number.isFinite(bTs);
            if (!aValid && !bValid) return 0;
            if (!aValid) return 1;
            if (!bValid) return -1;
            if (aTs === bTs) return b.date.localeCompare(a.date);
            return bTs - aTs;
        })
    );

    const filteredEvents = computed(() =>
        sortedEvents.value.filter((ev) => {
            const src = ev.source ?? 'SEC';
            if (activeSource.value !== 'ALL' && src !== activeSource.value) return false;
            if (activeSeverity.value !== 'ALL' && ev.severity !== activeSeverity.value)
                return false;
            return true;
        })
    );

    function severityColor(severity: string) {
        switch (severity) {
            case 'high':
                return 'error';
            case 'medium':
                return 'warning';
            default:
                return 'info';
        }
    }

    function severityIcon(severity: string) {
        switch (severity) {
            case 'high':
                return 'mdi-alert-circle';
            case 'medium':
                return 'mdi-alert';
            default:
                return 'mdi-information-outline';
        }
    }
</script>

<style scoped>
    .event-list {
        display: flex;
        flex-direction: column;
    }
    .event-row {
        border-bottom: 1px solid rgba(var(--dynamic-fg-rgb), 0.04);
        transition: background 0.1s;
    }
    .event-row:hover {
        background: rgba(var(--dynamic-fg-rgb), 0.02);
    }
    .event-row:last-child {
        border-bottom: none;
    }
    .event-meta {
        min-width: 80px;
        flex-shrink: 0;
    }
    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
