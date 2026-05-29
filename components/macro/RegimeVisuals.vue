<template>
    <div class="regime-visuals">
        <!-- Tiles grouped by source: Polymarket on one row, FRED on the next -->
        <div v-if="statTiles.length" class="tile-groups mb-4">
            <div
                v-for="group in tileGroups"
                :key="group.source"
                class="signal-tiles"
                :class="{ 'poly-row': group.source === 'polymarket' }"
            >
                <template v-for="tile in group.tiles" :key="tile.label">
                    <v-tooltip location="top" max-width="320" theme="dark" :open-delay="200">
                        <template #activator="{ props: tp }">
                            <div
                                v-bind="tp"
                                class="signal-tile"
                                :class="{ 'poly-tile': tile.source === 'polymarket' }"
                            >
                                <!-- Row 1: label only -->
                                <div class="tile-header">
                                    <span class="tile-label">{{ tile.label }}</span>
                                </div>

                                <!-- Row 2: value (left) + trend icon (right) — baseline-aligned -->
                                <div class="tile-value-row">
                                    <span class="tile-value" :class="tile.colorClass">{{
                                        tile.display
                                    }}</span>
                                    <v-icon
                                        v-if="tile.trend === 'up'"
                                        size="13"
                                        class="tile-trend"
                                        :class="tile.colorClass"
                                        >mdi-trending-up</v-icon
                                    >
                                    <v-icon
                                        v-else-if="tile.trend === 'down'"
                                        size="13"
                                        class="tile-trend"
                                        :class="tile.colorClass"
                                        >mdi-trending-down</v-icon
                                    >
                                    <span v-else class="tile-trend-placeholder" />
                                </div>

                                <!-- Row 3: probability bar (PM) or sparkline (FRED) -->
                                <div class="tile-bottom">
                                    <!-- PM probability bar -->
                                    <div v-if="tile.pct != null" class="tile-bar">
                                        <div
                                            class="tile-bar-fill"
                                            :class="tile.colorClass"
                                            :style="{ width: `${tile.pct}%` }"
                                        />
                                    </div>
                                    <!-- FRED sparkline -->
                                    <svg
                                        v-else-if="tile.sparkline"
                                        class="sparkline"
                                        :viewBox="`0 0 ${SPARK_W} ${SPARK_H}`"
                                        preserveAspectRatio="none"
                                    >
                                        <polyline
                                            :points="tile.sparkline"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="1.5"
                                            stroke-linejoin="round"
                                            stroke-linecap="round"
                                            :class="tile.colorClass"
                                            style="opacity: 0.65"
                                        />
                                    </svg>
                                    <div v-else class="tile-bar-placeholder" />
                                </div>
                                <!-- PM badge — absolutely anchored bottom-right -->
                                <span v-if="tile.source === 'polymarket'" class="poly-badge"
                                    >PM</span
                                >
                            </div>
                        </template>
                        <!-- Tooltip content -->
                        <div class="tooltip-inner">
                            <div class="font-weight-medium mb-1" style="font-size: 0.78rem">
                                {{ tile.tooltipTitle }}
                            </div>
                            <div v-if="tile.tooltipDetail" style="font-size: 0.73rem; opacity: 0.8">
                                {{ tile.tooltipDetail }}
                            </div>
                        </div>
                    </v-tooltip>
                </template>
            </div>
        </div>

        <!-- Sector mix stacked bar -->
        <div v-if="props.regime.sectorTilt?.length" class="sector-tilt">
            <div class="text-caption text-medium-emphasis mb-2">Portfolio sector mix</div>
            <!-- Stacked bar -->
            <div class="stacked-bar mb-2">
                <v-tooltip
                    v-for="tilt in props.regime.sectorTilt"
                    :key="tilt.bucket"
                    location="top"
                    theme="dark"
                >
                    <template #activator="{ props: tp }">
                        <div
                            v-bind="tp"
                            class="stacked-segment"
                            :style="{
                                width: `${tiltPct(tilt.count)}%`,
                                background: BUCKET_COLOR[tilt.bucket],
                            }"
                        />
                    </template>
                    <span>{{ tilt.label }}: {{ tilt.count }} ({{ tiltPct(tilt.count) }}%)</span>
                </v-tooltip>
            </div>
            <!-- Legend -->
            <div class="stacked-legend">
                <div v-for="tilt in props.regime.sectorTilt" :key="tilt.bucket" class="legend-item">
                    <span
                        class="legend-swatch"
                        :style="{ background: BUCKET_COLOR[tilt.bucket] }"
                    />
                    <span class="legend-label text-caption">{{ tilt.label }}</span>
                    <span class="legend-pct text-caption text-medium-emphasis"
                        >{{ tiltPct(tilt.count) }}%</span
                    >
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    import type { MacroRegime } from '~/composables/useMacroRegime';
    import type { MacroSignal } from '~/composables/useRelationships';
    import type { MacroFactorBucket } from '~/utils/macro/sectorFactors';

    const BUCKET_COLOR: Record<MacroFactorBucket, string> = {
        rate_sensitive: '#5C6BC0', // indigo-400
        defensive: '#42A5F5', // blue-400
        cyclical: '#26A69A', // teal-400
        growth_tech: '#AB47BC', // purple-400
        energy: '#FFA726', // orange-400
        unclassified: '#78909C', // blue-grey-400
    };

    const props = defineProps<{
        fred: MacroSignal[];
        poly: MacroSignal[];
        regime: MacroRegime;
    }>();

    const SPARK_W = 60;
    const SPARK_H = 14;

    function findSignal(signals: MacroSignal[], fragment: string): MacroSignal | undefined {
        return signals.find((s) => s.label.toLowerCase().includes(fragment.toLowerCase()));
    }

    function colorClass(macroScore: number | null | undefined): string {
        if (macroScore == null) return 'text-medium-emphasis';
        if (macroScore > 0.2) return 'text-success';
        if (macroScore < -0.2) return 'text-error';
        return 'text-warning';
    }

    /** Build polyline points string from a history array for the SVG sparkline */
    function toSparkline(history: number[] | undefined): string | null {
        if (!history || history.length < 3) return null;
        const min = Math.min(...history);
        const max = Math.max(...history);
        const range = max - min || 0.001;
        const pts = history
            .map((v, i) => {
                const x = (i / (history.length - 1)) * SPARK_W;
                const y = SPARK_H - ((v - min) / range) * (SPARK_H - 2) - 1;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
        return pts;
    }

    function polyTooltip(signal: MacroSignal): { title: string; detail: string } {
        const title = signal.note || signal.label;
        const parts: string[] = [];
        if (signal.endDate) parts.push(`Resolves: ${signal.endDate}`);
        parts.push('Source: Polymarket');
        return { title, detail: parts.join(' · ') };
    }

    function fredTooltip(signal: MacroSignal): { title: string; detail: string } {
        const parts: string[] = [];
        if (signal.note) parts.push(signal.note);
        parts.push('Source: FRED');
        return { title: signal.label, detail: parts.join(' · ') };
    }

    interface Tile {
        label: string;
        display: string;
        trend: 'up' | 'down' | 'flat';
        colorClass: string;
        pct: number | null;
        sparkline: string | null;
        source: 'polymarket' | 'fred';
        tooltipTitle: string;
        tooltipDetail: string;
    }

    const statTiles = computed<Tile[]>(() => {
        const tiles: Tile[] = [];

        // --- Polymarket signals (probability bars) ---
        const recession = findSignal(props.poly, 'recession');
        if (recession) {
            const tt = polyTooltip(recession);
            tiles.push({
                label: 'Recession odds',
                display: `${Math.round(recession.value)}%`,
                trend: recession.trend,
                colorClass: colorClass(recession.macroScore),
                pct: Math.min(recession.value, 100),
                sparkline: null,
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
                sparkline: null,
                source: 'polymarket',
                tooltipTitle: tt.title,
                tooltipDetail: tt.detail,
            });
        }

        const inflation = findSignal(props.poly, 'inflation');
        if (inflation) {
            const tt = polyTooltip(inflation);
            tiles.push({
                label: 'Inflation outlook',
                display: `${Math.round(inflation.value)}%`,
                trend: inflation.trend,
                colorClass: colorClass(inflation.macroScore),
                pct: Math.min(inflation.value, 100),
                sparkline: null,
                source: 'polymarket',
                tooltipTitle: tt.title,
                tooltipDetail: tt.detail,
            });
        }

        // --- Polymarket: Unemployment risk ---
        const polyUnrate = findSignal(props.poly, 'unemployment');
        if (polyUnrate) {
            const tt = polyTooltip(polyUnrate);
            tiles.push({
                label: 'Unemp. risk',
                display: `${Math.round(polyUnrate.value)}%`,
                trend: polyUnrate.trend,
                colorClass: colorClass(polyUnrate.macroScore),
                pct: Math.min(polyUnrate.value, 100),
                sparkline: null,
                source: 'polymarket',
                tooltipTitle: tt.title,
                tooltipDetail: tt.detail,
            });
        }

        // --- FRED signals (sparklines) ---
        const unrate = findSignal(props.fred, 'unemployment');
        if (unrate) {
            const tt = fredTooltip(unrate);
            tiles.push({
                label: 'Unemployment',
                display: unrate.displayValue ?? `${unrate.value}%`,
                trend: unrate.trend,
                colorClass: colorClass(unrate.macroScore),
                pct: null,
                sparkline: toSparkline(unrate.history),
                source: 'fred',
                tooltipTitle: tt.title,
                tooltipDetail: tt.detail,
            });
        }

        const cpi = findSignal(props.fred, 'cpi');
        if (cpi) {
            const tt = fredTooltip(cpi);
            tiles.push({
                label: 'CPI (inflation)',
                display: cpi.displayValue ?? `${cpi.value}`,
                trend: cpi.trend,
                colorClass: colorClass(cpi.macroScore),
                pct: null,
                sparkline: toSparkline(cpi.history),
                source: 'fred',
                tooltipTitle: tt.title,
                tooltipDetail: tt.detail,
            });
        }

        const gs10 = findSignal(props.fred, '10y treasury');
        if (gs10) {
            const tt = fredTooltip(gs10);
            tiles.push({
                label: '10Y Bond rate',
                display: gs10.displayValue ?? `${gs10.value}%`,
                trend: gs10.trend,
                colorClass: colorClass(gs10.macroScore),
                pct: null,
                sparkline: toSparkline(gs10.history),
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
                sparkline: toSparkline(yield_.history),
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
                sparkline: toSparkline(dff.history),
                source: 'fred',
                tooltipTitle: tt.title,
                tooltipDetail: tt.detail,
            });
        }

        return tiles;
    });

    /** Group tiles by source so Polymarket and FRED each get their own row. */
    const tileGroups = computed<{ source: Tile['source']; tiles: Tile[] }[]>(() => {
        const poly = statTiles.value.filter((t) => t.source === 'polymarket');
        const fred = statTiles.value.filter((t) => t.source === 'fred');
        return [
            { source: 'polymarket' as const, tiles: poly },
            { source: 'fred' as const, tiles: fred },
        ].filter((g) => g.tiles.length > 0);
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

    /* ── Signal tiles ────────────────────────────────── */
    .tile-groups {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .signal-tiles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 8px;
    }

    .signal-tile {
        /* 3-row grid: header | value+trend | bar/sparkline */
        display: grid;
        grid-template-rows: auto auto 14px;
        gap: 3px;
        padding: 7px 10px 12px; /* extra bottom padding for the PM badge */
        border-radius: 7px;
        background: rgba(var(--v-theme-surface-variant), 0.45);
        border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
        cursor: default;
        min-width: 0;
        position: relative;
    }

    .poly-tile {
        border-color: rgba(var(--v-theme-primary), 0.35);
    }

    /* Row 1: label + PM badge */
    .tile-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 4px;
    }

    .tile-label {
        font-size: 0.68rem;
        letter-spacing: 0.02em;
        color: rgba(var(--v-theme-on-surface), 0.6);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .poly-badge {
        position: absolute;
        bottom: 4px;
        right: 6px;
        font-size: 0.55rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        color: rgba(var(--v-theme-primary), 0.85);
        background: rgba(var(--v-theme-primary), 0.12);
        border-radius: 3px;
        padding: 1px 4px;
        line-height: 1.4;
    }

    /* Row 2: value + trend — baseline aligned, trend always right */
    .tile-value-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 4px;
    }

    .tile-value {
        font-size: 0.9rem;
        font-weight: 600;
        line-height: 1;
    }

    .tile-trend {
        flex-shrink: 0;
        /* nudge up slightly so the icon optical baseline matches text */
        position: relative;
        top: -1px;
    }

    /* invisible spacer so tiles without a trend icon still align */
    .tile-trend-placeholder {
        display: inline-block;
        width: 13px;
        flex-shrink: 0;
    }

    /* Row 3: probability bar (PM) */
    .tile-bar {
        height: 3px;
        border-radius: 2px;
        background: rgba(var(--v-border-color), 0.25);
        overflow: hidden;
        align-self: end;
    }

    .tile-bar-fill {
        height: 100%;
        border-radius: 2px;
        background: currentColor;
        opacity: 0.7;
        transition: width 0.4s ease;
    }

    /* Row 3: sparkline (FRED) */
    .sparkline {
        display: block;
        width: 100%;
        height: 14px;
        overflow: visible;
    }

    /* Empty spacer for tiles that have neither bar nor sparkline */
    .tile-bar-placeholder {
        height: 3px;
    }

    /* ── Tooltip ─────────────────────────────────────── */
    .tooltip-inner {
        padding: 2px 0;
    }

    /* ── Sector mix stacked bar ──────────────────────── */
    .stacked-bar {
        display: flex;
        height: 8px;
        border-radius: 4px;
        overflow: hidden;
        background: rgba(var(--v-border-color), 0.2);
        gap: 1px;
    }

    .stacked-segment {
        height: 100%;
        transition: width 0.4s ease;
        cursor: default;
        min-width: 2px;
    }

    .stacked-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 12px;
    }

    .legend-item {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.72rem;
    }

    .legend-swatch {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 2px;
        flex-shrink: 0;
    }

    .legend-label {
        white-space: nowrap;
    }

    .legend-pct {
        font-size: 0.68rem;
    }
</style>
