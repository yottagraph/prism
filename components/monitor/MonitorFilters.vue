<template>
    <div class="d-flex flex-wrap align-center ga-2 mb-3">
        <v-btn-toggle
            :model-value="category"
            density="comfortable"
            mandatory
            @update:model-value="emit('update:category', $event)"
        >
            <v-btn value="ALL" size="small">ALL</v-btn>
            <v-btn value="HIGH" size="small">HIGH</v-btn>
            <v-btn value="MEDIUM" size="small">MEDIUM</v-btn>
            <v-btn value="LOW" size="small">LOW</v-btn>
            <v-btn value="IGNORE" size="small">IGNORE</v-btn>
        </v-btn-toggle>
        <v-text-field
            :model-value="search"
            prepend-inner-icon="mdi-magnify"
            density="compact"
            variant="outlined"
            hide-details
            label="Search"
            style="max-width: 260px"
            @update:model-value="emit('update:search', String($event || ''))"
        />
        <v-select
            :model-value="rowsPerPage"
            :items="[25, 50, 100, -1]"
            density="compact"
            variant="outlined"
            hide-details
            label="Rows"
            style="max-width: 130px"
            @update:model-value="emit('update:rowsPerPage', Number($event))"
        />
    </div>
</template>

<script setup lang="ts">
    defineProps<{ category: string; search: string; rowsPerPage: number }>();
    const emit = defineEmits<{
        'update:category': [value: string];
        'update:search': [value: string];
        'update:rowsPerPage': [value: number];
    }>();
</script>
