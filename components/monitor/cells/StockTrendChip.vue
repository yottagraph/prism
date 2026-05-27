<template>
    <v-chip size="x-small" variant="tonal" :color="chipColor" label>
        {{ label }}
    </v-chip>
</template>

<script setup lang="ts">
    const props = defineProps<{ value?: 'bullish' | 'bearish' | 'neutral' | null }>();
    const label = computed(() => props.value || '—');
    const chipColor = computed(() =>
        props.value === 'bullish' ? 'success' : props.value === 'bearish' ? 'error' : 'default'
    );
</script>
