<template>
    <div class="d-flex align-center ga-1">
        <v-chip size="x-small" variant="tonal" :color="chipColor" label>{{ label }}</v-chip>
        <span class="text-caption text-medium-emphasis">{{ count }}</span>
    </div>
</template>

<script setup lang="ts">
    const props = defineProps<{
        outlook?: 'positive' | 'neutral' | 'negative' | null;
        count?: number | null;
    }>();
    const label = computed(() => props.outlook || '—');
    const count = computed(() => (props.count != null ? `${props.count}` : ''));
    const chipColor = computed(() =>
        props.outlook === 'positive'
            ? 'success'
            : props.outlook === 'negative'
              ? 'error'
              : 'default'
    );
</script>
