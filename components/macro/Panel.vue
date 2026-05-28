<template>
    <v-card class="pa-4">
        <MacroRegimeBanner :regime="regime" />

        <v-row dense>
            <!-- Lane: Fundamentals (lagging realized data from FRED) -->
            <v-col cols="12" md="6">
                <div class="macro-lane pa-3">
                    <MacroContext
                        :signals="fredSignals"
                        title="Fundamentals"
                        source="FRED"
                        lane-label="realized"
                    />
                </div>
            </v-col>

            <!-- Lane: Outlook (market-implied forward probabilities from Polymarket) -->
            <v-col cols="12" md="6">
                <div class="macro-lane pa-3">
                    <MacroContext
                        :signals="polySignals"
                        title="Outlook"
                        source="Polymarket"
                        lane-label="market-implied"
                    />
                </div>
            </v-col>
        </v-row>

        <MacroPortfolioOverlay :regime="regime" />
    </v-card>
</template>

<script setup lang="ts">
    import { useFredMacroContext, useMacroContext } from '~/composables/useRelationships';
    import { useMacroRegime } from '~/composables/useMacroRegime';

    const { signals: fredSignals } = useFredMacroContext();
    const { signals: polySignals } = useMacroContext();
    const { regime } = useMacroRegime();
</script>

<style scoped>
    .macro-lane {
        border-radius: 8px;
        background: rgba(var(--v-border-color), 0.04);
        height: 100%;
    }
</style>
