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

        <!-- 2-3 sentence narrative summary (replaces the metric chip lanes) -->
        <div class="flex-grow-1 d-flex flex-column">
            <div v-if="summaryLoading" class="text-body-2 text-medium-emphasis d-flex align-center">
                <v-progress-circular size="16" width="2" indeterminate class="mr-2" />
                Synthesizing macro summary…
            </div>

            <p v-else-if="summaryText" class="macro-summary text-body-1">
                {{ summaryText }}
            </p>

            <div
                v-else
                class="macro-empty flex-grow-1 d-flex flex-column align-center justify-center text-center pa-6"
            >
                <v-icon size="32" class="mb-2 text-medium-emphasis">mdi-earth</v-icon>
                <div class="text-body-2 text-medium-emphasis">
                    {{
                        scanning
                            ? 'Macro summary available once the scan completes.'
                            : 'Run a scan to load the macro regime summary.'
                    }}
                </div>
            </div>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { ref, watch } from 'vue';

    import { useFredMacroContext, useMacroContext } from '~/composables/useRelationships';
    import { useMacroRegime } from '~/composables/useMacroRegime';
    import { usePortfolio } from '~/composables/usePortfolio';

    const { signals: fredSignals, refresh: refreshFred } = useFredMacroContext();
    const { signals: polySignals, refresh: refreshPoly } = useMacroContext();
    const { regime } = useMacroRegime();
    const { scanning, scanStartedAt, scanCompletedAt } = usePortfolio();

    const summaryText = ref('');
    const summaryLoading = ref(false);
    // Track what the summary was generated for so we don't re-fire needlessly.
    const summaryForKey = ref('');

    // Pull the portfolio-wide macro signals once a scan begins so the regime
    // and summary have data to work with. (The signals themselves are not shown
    // as chips anymore — they feed the narrative below.)
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

    async function fetchSummary() {
        const fred = fredSignals.value;
        const poly = polySignals.value;
        if (!fred.length && !poly.length) return;

        const sectorTilt = regime.value.sectorTilt;
        const totalEntities = sectorTilt.reduce((sum, t) => sum + t.count, 0);

        // Cache key: regime + completion timestamp so each finished scan refreshes.
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
            // Fail silently — the empty state covers the no-summary case.
            summaryText.value = '';
            summaryForKey.value = '';
        } finally {
            summaryLoading.value = false;
        }
    }

    // The Gemini summary should only be generated AFTER a scan completes, so it
    // reflects the fully-scored portfolio rather than a half-finished run.
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
