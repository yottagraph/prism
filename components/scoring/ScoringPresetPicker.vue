<template>
    <v-menu>
        <template #activator="{ props: menuProps }">
            <v-btn variant="tonal" size="small" prepend-icon="mdi-auto-fix" v-bind="menuProps">
                Presets
            </v-btn>
        </template>
        <v-list density="compact" min-width="260">
            <v-list-item
                v-for="preset in presets"
                :key="preset.id"
                @click="emit('select', preset.id)"
            >
                <v-list-item-title>{{ preset.label }}</v-list-item-title>
                <v-list-item-subtitle>{{ preset.description }}</v-list-item-subtitle>
            </v-list-item>
        </v-list>
    </v-menu>
</template>

<script setup lang="ts">
    import type { PresetId } from '~/composables/useScoringSettings';

    defineProps<{
        presets: Array<{ id: PresetId; label: string; description: string }>;
    }>();
    const emit = defineEmits<{ select: [id: PresetId] }>();
</script>
