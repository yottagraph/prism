<template>
    <v-toolbar density="compact" rounded="t" class="page-toolbar px-3">
        <v-icon v-if="icon" class="mr-2 toolbar-icon">{{ icon }}</v-icon>
        <v-toolbar-title class="toolbar-title">{{ title }}</v-toolbar-title>

        <v-spacer />

        <slot name="actions">
            <!-- Default slot for action buttons -->
        </slot>
    </v-toolbar>
</template>

<script setup lang="ts">
    interface Props {
        title: string;
        icon?: string;
    }

    defineProps<Props>();
</script>

<style scoped>
    .page-toolbar {
        background: linear-gradient(
            135deg,
            var(--dynamic-header-gradient-start),
            var(--dynamic-header-gradient-end)
        ) !important;
        color: var(--dynamic-text-primary) !important;
    }

    .toolbar-icon {
        color: var(--dynamic-text-primary) !important;
    }

    .toolbar-title {
        color: var(--dynamic-text-primary) !important;
        white-space: normal !important;
        overflow: visible !important;
        text-overflow: unset !important;
    }

    :deep(.v-toolbar__content) {
        color: var(--dynamic-text-primary);
    }

    :deep(.v-btn) {
        color: var(--dynamic-text-primary);
    }

    :deep(.v-icon) {
        color: var(--dynamic-text-primary);
    }
</style>
