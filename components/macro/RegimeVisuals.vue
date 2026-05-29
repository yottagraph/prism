<template>
    <div class="regime-visuals">
        <!-- Key macro signals row -->
        <div v-if="statTiles.length" class="signal-tiles mb-3">
            <div v-for="tile in statTiles" :key="tile.label" class="signal-tile">
                <div class="tile-label text-caption text-medium-emphasis">{{ tile.label }}</div>
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

    function colorClass(macroScore: number | null | undefined, invert = false): string {
        if (macroScore == null) return '';
        const score = invert ? -macroScore : macroScore;
        if (score > 0.2) return 'text-success';
        if (score < -0.2) return 'text-error';
        return 'text-warning';
    }

    interface Tile {
        label: string;
        display: string;
        trend: 'up' | 'down' | 'flat';
        colorClass: string;
        pct: number | null;
    }

    const statTiles = computed<Tile[]>(() => {
        const tiles: Tile[] = [];

        const recession = findSignal(props.poly, 'recession');
        if (recession) {
            tiles.push({
                label: 'Recession odds',
                display: `${Math.round(recession.value)}%`,
                trend: recession.trend,
                colorClass: colorClass(recession.macroScore),
                pct: Math.min(recession.value, 100),
            });
        }

        const fedCut = findSignal(props.poly, 'fed rate cut');
        if (fedCut) {
            tiles.push({
                label: 'Fed cut prob',
                display: `${Math.round(fedCut.value)}%`,
                trend: fedCut.trend,
                colorClass: colorClass(fedCut.macroScore),
                pct: Math.min(fedCut.value, 100),
            });
        }

        const inflation = findSignal(props.poly, 'inflation');
        if (inflation) {
            tiles.push({
                label: 'Elevated inflation',
                display: `${Math.round(inflation.value)}%`,
                trend: inflation.trend,
                colorClass: colorClass(inflation.macroScore),
                pct: Math.min(inflation.value, 100),
            });
        }

        const unrate = findSignal(props.fred, 'unemployment');
        if (unrate) {
            tiles.push({
                label: 'Unemployment',
                display: unrate.displayValue ?? `${unrate.value}%`,
                trend: unrate.trend,
                colorClass: colorClass(unrate.macroScore),
                pct: null,
            });
        }

        const yield_ = findSignal(props.fred, 'yield spread');
        if (yield_) {
            tiles.push({
                label: 'Yield spread',
                display: yield_.displayValue ?? `${yield_.value}`,
                trend: yield_.trend,
                colorClass: colorClass(yield_.macroScore),
                pct: null,
            });
        }

        const dff = findSignal(props.fred, 'fed funds');
        if (dff) {
            tiles.push({
                label: 'Fed funds rate',
                display: dff.displayValue ?? `${dff.value}%`,
                trend: dff.trend,
                colorClass: colorClass(dff.macroScore),
                pct: null,
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
    }

    .tile-label {
        font-size: 0.7rem;
        letter-spacing: 0.02em;
        margin-bottom: 2px;
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
