<template>
    <a
        v-if="citation.url"
        class="citation-chip-link"
        :href="citation.url"
        target="_blank"
        rel="noopener noreferrer"
    >
        <v-chip size="x-small" variant="tonal" color="info" label>
            <span class="chip-text">
                {{ chipLabel }}
            </span>
            <v-icon size="x-small" class="ml-1">mdi-open-in-new</v-icon>
        </v-chip>
    </a>
    <v-chip v-else size="x-small" variant="tonal" color="info" label>
        <span class="chip-text">{{ chipLabel }}</span>
    </v-chip>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    const props = defineProps<{
        citation: {
            ref?: string;
            url?: string;
            title?: string;
            source?: string;
            date?: string;
            snippet?: string;
        };
    }>();

    const chipLabel = computed(() => {
        const source = props.citation.source || props.citation.title || props.citation.ref || 'Source';
        if (props.citation.date) return `${source} · ${props.citation.date}`;
        return source;
    });
</script>

<style scoped>
    .citation-chip-link {
        text-decoration: none;
    }

    .chip-text {
        max-width: 280px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        display: inline-block;
    }
</style>
