<template>
    <div class="regime-visuals">
        <!-- Key macro signals row -->
        <div v-if="statTiles.length" class="signal-tiles mb-3">
            <template v-for="tile in statTiles" :key="tile.label">
                <v-tooltip location="top" max-width="300" content-class="pa-2">
                    <template #activator="{ props: tp }">
                        <div
                            v-bind="tp"
                            class="signal-tile"
                            :class="{ 'poly-tile': tile.source === 'polymarket' }"
                        >
                            <div class="tile-header d-flex align-center justify-space-between">
                                <div class="tile-label text-caption text-medium-emphasis">
                                    {{ tile.label }}
                                </div>
                                <span
                                    v-if="tile.source === 'polymarket'"
                                    class="poly-badge text-caption"
                                    >PM</span
                                >
                            </div>
                            <div class="tile-value d-flex align-center" :class="tile.colorClass">
                                <span class="font-weight-medium">{{ tile.display }}</span>
                                <v-icon v-if="tile.trend === 'up'" size="14" class="ml-1"
                                    >mdi-trending-up</v-icon
                                >
                                <v-icon v-else-if="tile.trend === 'down'" size="14" class="ml-1"
                                    >mdi-trending-down</v-icon
                                >
                            </div>
                            <!-- Mini progress bar for probability signals -->
                            <div v-if="tile.pct != null" class="tile-bar mt-1">
                                <div
                                    class="tile-bar-fill"
                                    :class="tile.colorClass"
                                    :style="{ width: `${tile.pct}%` }"
                                />
                            </div>
                        </div>
                    </template>
                    <div>
                        <div class="text-caption font-weight-medium mb-1">
                            {{ tile.tooltipTitle }}
                        </div>
                        <div v-if="tile.tooltipDetail" class="text-caption text-medium-emphasis">
                            {{ tile.tooltipDetail }}
                        </div>
                    </div>
                </v-tooltip>
            </template>
        </div>

        <!-- Sector tilt bars -->
        <div v-if="props.regime.sectorTilt?.length" class="sector-tilt">
            <div class="text-caption text-medium-emphasis mb-1">Portfolio sector mix</div>
            <div
                v-for="tilt in props.regime.sectorTilt"
                :key="tilt.bucket"
                class="tilt-row d-flex align-center mb-1"
            >
                <v-icon size="13" class="mr-1 text-medium-emphasis">{{ tilt.icon }}</v-icon>
                <span class="tilt-label text-caption">{{ tilt.label }}</span>
                <div class="tilt-track flex-grow-1 mx-2">
                    <div class="tilt-fill" :style="{ width: `${tiltPct(tilt.count)}%` }" />
                </div>
                <span class="tilt-count text-caption text-medium-emphasis">{{ tilt.count }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    import type { MacroRegime } from '~/composables/useMacroRegime';
    import type { MacroSignal } from '~/composables/useRelationships';

    const props = defineProps<{
        fred: MacroSignal[];
        poly: MacroSignal[];
        regime: MacroRegime;
    }>();

    function findSignal(signals: MacroSignal[], fragment: string): MacroSignal | undefined {
        return signals.find((s) => s.label.toLowerCase().includes(fragment.toLowerCase()));
    }

    function colorClass(macroScore: number | null | undefined): string {
        if (macroScore == null) return '';
        if (macroScore > 0.2) return 'text-success';
        if (macroScore < -0.2) return 'text-error';
        return 'text-warning';
    }

    function polyTooltip(signal: MacroSignal): { title: string; detail: string } {
        const title = signal.note || signal.label;
        const detail = signal.endDate
            ? `Resolves: ${signal.endDate} · Source: Polymarket`
            : 'Source: Polymarket';
        return { title, detail };
    }

    function fredTooltip(signal: MacroSignal): { title: string; detail: string } {
        return {
            title: signal.label,
            detail: signal.note ? `${signal.note} · Source: FRED` : 'Source: FRED',
        };
    }

    interface Tile {
        label: string;
        display: string;
        trend: 'up' | 'down' | 'flat';
        colorClass: string;
        pct: number | null;
        source: 'polymarket' | 'fred';
        tooltipTitle: string;
        tooltipDetail: string;
    }

    const statTiles = computed<Tile[]>(() => {
        const tiles: Tile[] = [];

        const recession = findSignal(props.poly, 'recession');
        if (recession) {
            const tt = polyTooltip(recession);
            tiles.push({
                label: 'Recession odds',
                display: `${Math.round(recession.value)}%`,
                trend: recession.trend,
                colorClass: colorClass(recession.macroScore),
                pct: Math.min(recession.value, 100),
                source: 'polymarket',
                tooltipTitle: tt.title,
                tooltipDetail: tt.detail,
            });
        }

        const fedCut = findSignal(props.poly, 'fed rate cut');
        if (fedCut) {
            const tt = polyTooltip(fedCut);
            tiles.push({
                label: 'Fed cut prob',
                display: `${Math.round(fedCut.value)}%`,
                trend: fedCut.trend,
                colorClass: colorClass(fedCut.macroScore),
                pct: Math.min(fedCut.value, 100),
                source: 'polymarket',
                tooltipTitle: tt.title,
                tooltipDetail: tt.detail,
            });
        }

        const inflation = findSignal(props.poly, 'inflation');
        if (inflation) {
            const tt = polyTooltip(inflation);
            tiles.push({
                label: 'Elevated inflation',
                display: `${Math.round(inflation.value)}%`,
                trend: inflation.trend,
                colorClass: colorClass(inflation.macroScore),
                pct: Math.min(inflation.value, 100),
                source: 'polymarket',
                tooltipTitle: tt.title,
                tooltipDetail: tt.detail,
            });
        }

        const unrate = findSignal(props.fred, 'unemployment');
        if (unrate) {
            const tt = fredTooltip(unrate);
            tiles.push({
                label: 'Unemployment',
                display: unrate.displayValue ?? `${unrate.value}%`,
                trend: unrate.trend,
                colorClass: colorClass(unrate.macroScore),
                pct: null,
                source: 'fred',
                tooltipTitle: tt.title,
                tooltipDetail: tt.detail,
            });
        }

        const yield_ = findSignal(props.fred, 'yield spread');
        if (yield_) {
            const tt = fredTooltip(yield_);
            tiles.push({
                label: 'Yield spread',
                display: yield_.displayValue ?? `${yield_.value}`,
                trend: yield_.trend,
                colorClass: colorClass(yield_.macroScore),
                pct: null,
                source: 'fred',
                tooltipTitle: tt.title,
                tooltipDetail: tt.detail,
            });
        }

        const dff = findSignal(props.fred, 'fed funds');
        if (dff) {
            const tt = fredTooltip(dff);
            tiles.push({
                label: 'Fed funds rate',
                display: dff.displayValue ?? `${dff.value}%`,
                trend: dff.trend,
                colorClass: colorClass(dff.macroScore),
                pct: null,
                source: 'fred',
                tooltipTitle: tt.title,
                tooltipDetail: tt.detail,
            });
        }

        return tiles;
    });

    const totalEntities = computed(() =>
        (props.regime.sectorTilt ?? []).reduce((s, t) => s + t.count, 0)
    );

    function tiltPct(count: number): number {
        return totalEntities.value > 0 ? Math.round((count / totalEntities.value) * 100) : 0;
    }
</script>

<style scoped>
    .regime-visuals {
        font-size: 0.8125rem;
    }

    /* Signal tiles */
    .signal-tiles {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    .signal-tile {
        min-width: 90px;
        padding: 6px 10px;
        border-radius: 6px;
        background: rgba(var(--v-theme-surface-variant), 0.5);
        border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
        flex: 1 1 90px;
        max-width: 140px;
        cursor: default;
    }

    .poly-tile {
        border-color: rgba(var(--v-theme-primary), 0.35);
    }

    .tile-header {
        margin-bottom: 2px;
    }

    .tile-label {
        font-size: 0.7rem;
        letter-spacing: 0.02em;
    }

    .poly-badge {
        font-size: 0.6rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: rgba(var(--v-theme-primary), 0.8);
        background: rgba(var(--v-theme-primary), 0.12);
        border-radius: 3px;
        padding: 0 3px;
        line-height: 1.4;
    }

    .tile-value {
        font-size: 0.875rem;
        line-height: 1.2;
    }

    .tile-bar {
        height: 3px;
        border-radius: 2px;
        background: rgba(var(--v-border-color), 0.3);
        overflow: hidden;
    }

    .tile-bar-fill {
        height: 100%;
        border-radius: 2px;
        background: currentColor;
        opacity: 0.7;
        transition: width 0.4s ease;
    }

    /* Sector tilt */
    .tilt-row {
        font-size: 0.78rem;
    }

    .tilt-label {
        min-width: 80px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .tilt-track {
        height: 5px;
        border-radius: 3px;
        background: rgba(var(--v-border-color), 0.3);
        overflow: hidden;
        max-width: 120px;
    }

    .tilt-fill {
        height: 100%;
        border-radius: 3px;
        background: rgba(var(--dynamic-primary-rgb), 0.7);
        transition: width 0.4s ease;
    }

    .tilt-count {
        min-width: 16px;
        text-align: right;
    }
</style>
