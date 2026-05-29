<template>
    <v-card class="pa-4 fill-height d-flex flex-column">
        <MacroRegimeBanner :regime="regime" :loading="scanning" />

        <v-row v-if="hasMacroData" dense>
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

        <div
            v-else
            class="macro-empty flex-grow-1 d-flex flex-column align-center justify-center text-center pa-6"
        >
            <v-icon size="32" class="mb-2 text-medium-emphasis">mdi-earth</v-icon>
            <div class="text-body-2 text-medium-emphasis">
                {{
                    scanning ? 'Loading macro context…' : 'Run a scan to load macro regime context.'
                }}
            </div>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { computed, watch } from 'vue';

    import { useFredMacroContext, useMacroContext } from '~/composables/useRelationships';
    import { useMacroRegime } from '~/composables/useMacroRegime';
    import { usePortfolio } from '~/composables/usePortfolio';

    const { signals: fredSignals, refresh: refreshFred } = useFredMacroContext({
        autoRefresh: false,
    });
    const { signals: polySignals, refresh: refreshPoly } = useMacroContext({ autoRefresh: false });
    const { regime } = useMacroRegime();
    const { scanning, scanStartedAt } = usePortfolio();

    const hasMacroData = computed(
        () => fredSignals.value.length > 0 || polySignals.value.length > 0
    );

    // Macro context is portfolio-wide, but we hold off fetching it until the
    // analyst kicks off a scan so the dashboard reads as "empty until scanned".
    watch(
        scanStartedAt,
        (started) => {
            if (started) {
                void refreshFred();
                void refreshPoly();
            }
        },
        { immediate: true }
    );
</script>

<style scoped>
    .macro-lane {
        border-radius: 8px;
        background: rgba(var(--v-border-color), 0.04);
        height: 100%;
    }
</style>
