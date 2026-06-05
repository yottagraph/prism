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
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        min-width: 520px;
        max-width: 600px;
    }
</style>
