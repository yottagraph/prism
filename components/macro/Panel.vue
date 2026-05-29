<template>
    <v-card class="pa-4 fill-height d-flex flex-column">
        <div class="d-flex align-center mb-3" style="gap: 10px">
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
            <v-chip v-else size="small" variant="tonal" color="default">
                {{ scanning ? 'Scanning…' : 'Awaiting scan' }}
            </v-chip>
        </div>

        <!-- Empty / awaiting state -->
        <div
            v-if="!regime.ready && !scanning"
            class="macro-empty flex-grow-1 d-flex flex-column align-center justify-center text-center pa-6"
        >
            <v-progress-circular
                v-if="hasScored"
                size="28"
                width="2"
                indeterminate
                class="mb-3 text-medium-emphasis"
            />
            <v-icon v-else size="32" class="mb-2 text-medium-emphasis">mdi-earth</v-icon>
            <div class="text-body-2 text-medium-emphasis">
                {{ hasScored ? 'Loading macro data…' : 'Run a scan to load the macro regime.' }}
            </div>
        </div>

        <!-- Content shown once signals are loaded -->
        <div v-else class="flex-grow-1 d-flex flex-column" style="gap: 12px">
            <!-- 2-3 sentence narrative -->
            <div v-if="summaryLoading" class="text-body-2 text-medium-emphasis d-flex align-center">
                <v-progress-circular size="16" width="2" indeterminate class="mr-2" />
                Synthesizing macro summary…
            </div>
            <p v-else-if="summaryText" class="macro-summary text-body-1 mb-0">
                {{ summaryText }}
            </p>
            <div v-else-if="scanning" class="text-body-2 text-medium-emphasis">
                Macro summary available once the scan completes.
            </div>

            <!-- Visual indicators (stat tiles + sector tilt) -->
            <MacroRegimeVisuals
                v-if="regime.ready"
                :fred="fredSignals"
                :poly="polySignals"
                :regime="regime"
            />
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { computed, onMounted, ref, watch } from 'vue';

    import { useFredMacroContext, useMacroContext } from '~/composables/useRelationships';
    import { useMacroRegime } from '~/composables/useMacroRegime';
    import { usePortfolio } from '~/composables/usePortfolio';

    const { signals: fredSignals, refresh: refreshFred } = useFredMacroContext();
    const { signals: polySignals, refresh: refreshPoly } = useMacroContext();
    const { regime } = useMacroRegime();
    const { scanning, scanStartedAt, scanCompletedAt, activePortfolio } = usePortfolio();

    const hasScored = computed(
        () => activePortfolio.value?.entities?.some((e: any) => e.scores != null) ?? false
    );

    const summaryText = ref('');
    const summaryLoading = ref(false);
    const summaryForKey = ref('');

    // On mount: if the portfolio already has scored entities but signals haven't
    // been loaded yet (e.g. page refresh after a previous scan), auto-load them.
    onMounted(() => {
        if (hasScored.value && fredSignals.value.length === 0) {
            void refreshFred();
            void refreshPoly();
        }
    });

    watch(
        scanStartedAt,
        (started) => {
            if (started) {
                summaryText.value = '';
                summaryForKey.value = '';
                void refreshFred();
                void refreshPoly();
            }
        },
        { immediate: true }
    );

    async function fetchSummary(retry = true) {
        const fred = fredSignals.value;
        const poly = polySignals.value;
        if (!fred.length && !poly.length) return;

        const sectorTilt = regime.value.sectorTilt;
        const totalEntities = sectorTilt.reduce((sum, t) => sum + t.count, 0);

        const key = `${scanCompletedAt.value ?? 0}::${regime.value.label}`;
        if (summaryForKey.value === key) return;
        summaryForKey.value = key;

        summaryLoading.value = true;
        try {
            const res = await $fetch<{ summary: string }>('/api/macro/summary', {
                method: 'POST',
                body: {
                    regimeLabel: regime.value.label,
                    fred: fred.map((s) => ({
                        label: s.label,
                        displayValue: s.displayValue ?? String(s.value),
                        trend: s.trend,
                        note: s.note,
                    })),
                    poly: poly.map((s) => ({
                        label: s.label,
                        displayValue: s.displayValue ?? `${s.value}%`,
                        trend: s.trend,
                        note: s.note,
                    })),
                    sectorTilt: sectorTilt.map((t) => ({
                        label: t.label,
                        count: t.count,
                        bucket: t.bucket,
                    })),
                    totalEntities,
                },
            });
            summaryText.value = res.summary ?? '';
        } catch {
            // Retry once after a short delay; on second failure stay silent so
            // the visual indicators still render even without the paragraph.
            summaryText.value = '';
            summaryForKey.value = '';
            if (retry) {
                setTimeout(() => void fetchSummary(false), 8_000);
            }
        } finally {
            summaryLoading.value = false;
        }
    }

    watch(
        [scanCompletedAt, fredSignals, polySignals],
        ([completedAt]) => {
            if (completedAt && !scanning.value) {
                void fetchSummary();
            }
        },
        { immediate: true }
    );
</script>

<style scoped>
    .macro-summary {
        line-height: 1.6;
        max-width: 70ch;
        margin: 0;
    }

    .macro-empty {
        min-height: 120px;
    }
</style>
