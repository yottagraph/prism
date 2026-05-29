<template>
    <div class="mb-3">
        <div class="d-flex align-center" style="gap: 10px">
            <v-icon size="small">mdi-earth</v-icon>
            <span class="text-subtitle-2">Macro Regime</span>
            <span
                v-if="regime.ready && regime.synthesis"
                class="text-caption text-medium-emphasis"
                style="flex: 1; min-width: 0"
            >
                {{ regime.synthesis }}
            </span>
        </div>
        <div class="d-flex flex-wrap align-start mt-2" style="gap: 12px">
            <v-chip
                v-if="regime.ready"
                :color="regime.color"
                size="small"
                variant="tonal"
                class="font-weight-medium"
            >
                {{ regime.label }}
            </v-chip>
            <v-chip v-else size="small" variant="tonal" color="default">
                {{ loading ? 'Loading…' : 'Awaiting scan' }}
            </v-chip>
            <MacroPortfolioOverlay
                v-if="regime.ready"
                :regime="regime"
                class="flex-grow-1"
                style="min-width: 0"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
    import type { MacroRegime } from '~/composables/useMacroRegime';

    withDefaults(
        defineProps<{
            regime: MacroRegime;
            loading?: boolean;
        }>(),
        { loading: false }
    );
</script>
