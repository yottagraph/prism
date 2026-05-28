<template>
    <div class="d-flex align-center flex-wrap mb-3" style="gap: 10px">
        <v-icon size="small">mdi-earth</v-icon>
        <span class="text-subtitle-2">Macro Regime</span>
        <v-chip
            v-if="regime.ready"
            :color="regime.color"
            size="small"
            variant="tonal"
            class="font-weight-medium"
        >
            {{ regime.label }}
        </v-chip>
        <v-chip v-else size="small" variant="tonal" color="default"> Loading… </v-chip>
        <span
            v-if="regime.ready && regime.synthesis"
            class="text-caption text-medium-emphasis"
            style="flex: 1; min-width: 0"
        >
            {{ regime.synthesis }}
        </span>
    </div>
</template>

<script setup lang="ts">
    import type { MacroRegime } from '~/composables/useMacroRegime';

    defineProps<{
        regime: MacroRegime;
    }>();
</script>
