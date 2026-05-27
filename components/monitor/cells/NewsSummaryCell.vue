<template>
    <div class="summary text-caption">
        {{ value || 'No summary' }}
    </div>
</template>

<script setup lang="ts">
    defineProps<{ value?: string | null }>();
</script>

<style scoped>
    .summary {
        display: -webkit-box;
        overflow: hidden;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        max-width: 360px;
    }
</style>
