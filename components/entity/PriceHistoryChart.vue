<template>
    <div class="price-chart-card">
        <div class="chart-header d-flex flex-wrap align-center mb-3 ga-3">
            <div>
                <div class="text-subtitle-2 font-weight-medium">
                    {{ ticker || 'Price History' }}
                </div>
                <div class="text-caption text-medium-emphasis">
                    {{ headerSubtitle }}
                </div>
            </div>
            <v-spacer />
            <v-btn-toggle
                v-model="period"
                mandatory
                density="compact"
                variant="outlined"
                rounded="lg"
                color="primary"
            >
                <v-btn v-for="opt in periods" :key="opt.value" :value="opt.value" size="small">
                    {{ opt.label }}
                </v-btn>
            </v-btn-toggle>
        </div>

        <div v-if="!visiblePoints.length" class="text-center pa-6 text-medium-emphasis empty-state">
            <v-icon size="48" class="mb-2">mdi-chart-timeline-variant</v-icon>
            <div class="text-body-2">No price samples in this window</div>
        </div>

        <div
            v-else
            ref="containerRef"
            class="chart-wrap"
            @pointerleave="
                hoverIdx = null;
                hoverX = null;
            "
        >
            <svg
                :viewBox="`0 0 ${width} ${height}`"
                :width="width"
                :height="height"
                preserveAspectRatio="none"
                class="chart-svg"
                @pointermove="onPointerMove"
                @pointerdown="onPointerMove"
            >
                <!-- Y axis gridlines + labels -->
                <g class="grid">
                    <line
                        v-for="(t, i) in yTicks"
                        :key="`gy-${i}`"
                        :x1="padding.left"
                        :y1="t.y"
                        :x2="width - padding.right"
                        :y2="t.y"
                        class="grid-line"
                    />
                </g>
                <g class="y-labels">
                    <text
                        v-for="(t, i) in yTicks"
                        :key="`yl-${i}`"
                        :x="padding.left - 8"
                        :y="t.y + 3"
                        class="axis-label"
                        text-anchor="end"
                    >
                        {{ formatPrice(t.value) }}
                    </text>
                </g>

                <!-- X axis line + labels -->
                <line
                    :x1="padding.left"
                    :y1="priceArea.bottom"
                    :x2="width - padding.right"
                    :y2="priceArea.bottom"
                    class="axis-line"
                />
                <g class="x-labels">
                    <text
                        v-for="(t, i) in xTicks"
                        :key="`xl-${i}`"
                        :x="t.x"
                        :y="height - padding.bottom + 14"
                        class="axis-label"
                        text-anchor="middle"
                    >
                        {{ t.label }}
                    </text>
                </g>

                <!-- Area fill under the price line -->
                <path :d="areaPath" :class="['area', isPositive ? 'pos' : 'neg']" />

                <!-- Event overlays -->
                <g class="event-overlays">
                    <line
                        v-for="event in visibleEvents"
                        :key="`ev-line-${event.id}`"
                        :x1="event.x"
                        :y1="padding.top"
                        :x2="event.x"
                        :y2="priceArea.bottom"
                        :class="['event-line', `sev-${event.severity}`]"
                    />
                    <circle
                        v-for="event in visibleEvents"
                        :key="`ev-dot-${event.id}`"
                        :cx="event.x"
                        :cy="padding.top + 6"
                        r="3"
                        :class="['event-dot', `sev-${event.severity}`]"
                    />
                </g>

                <!-- Price line -->
                <path :d="linePath" :class="['line', isPositive ? 'pos' : 'neg']" />

                <!-- Volume bars (bottom strip) -->
                <g v-if="hasVolume" class="volume">
                    <rect
                        v-for="(p, i) in visiblePoints"
                        :key="`v-${i}`"
                        :x="xFor(i) - barWidth / 2"
                        :y="volumeY(p.volume)"
                        :width="barWidth"
                        :height="
                            Math.max(0, priceArea.bottom + volumeArea.height - volumeY(p.volume))
                        "
                        class="volume-bar"
                    />
                </g>

                <!-- Hover crosshair -->
                <g v-if="hoverPoint" class="crosshair">
                    <line
                        :x1="hoverPoint.x"
                        :y1="padding.top"
                        :x2="hoverPoint.x"
                        :y2="height - padding.bottom"
                        class="crosshair-line"
                    />
                    <circle
                        :cx="hoverPoint.x"
                        :cy="hoverPoint.y"
                        r="4"
                        :class="['hover-dot', isPositive ? 'pos' : 'neg']"
                    />
                </g>
            </svg>

            <div v-if="activeTooltip" class="tooltip" :style="activeTooltip.tooltipStyle">
                <template v-if="activeTooltip.kind === 'event'">
                    <div class="tt-date">{{ activeTooltip.dateLabel }}</div>
                    <div class="tt-price">{{ activeTooltip.label }}</div>
                    <div class="tt-row">
                        <span>Severity</span
                        ><span class="text-capitalize">{{ activeTooltip.severity }}</span>
                    </div>
                </template>
                <template v-else-if="priceTooltip">
                    <div class="tt-date">{{ priceTooltip.dateLabel }}</div>
                    <div class="tt-price">{{ formatPrice(priceTooltip.point.close) }}</div>
                    <div
                        v-if="priceTooltip.changeText"
                        :class="['tt-change', priceTooltip.changeClass]"
                    >
                        {{ priceTooltip.changeText }}
                    </div>
                    <div v-if="priceTooltip.point.open != null" class="tt-row">
                        <span>Open</span><span>{{ formatPrice(priceTooltip.point.open) }}</span>
                    </div>
                    <div v-if="priceTooltip.point.high != null" class="tt-row">
                        <span>High</span><span>{{ formatPrice(priceTooltip.point.high) }}</span>
                    </div>
                    <div v-if="priceTooltip.point.low != null" class="tt-row">
                        <span>Low</span><span>{{ formatPrice(priceTooltip.point.low) }}</span>
                    </div>
                    <div v-if="priceTooltip.point.volume != null" class="tt-row">
                        <span>Vol</span><span>{{ formatVolume(priceTooltip.point.volume) }}</span>
                    </div>
                </template>
            </div>
        </div>

        <v-row v-if="visiblePoints.length" dense class="mt-3">
            <v-col cols="6" sm="3">
                <div class="stat-card">
                    <div class="text-caption text-medium-emphasis">Open</div>
                    <div class="text-body-1 font-mono">{{ formatPrice(firstClose) }}</div>
                </div>
            </v-col>
            <v-col cols="6" sm="3">
                <div class="stat-card">
                    <div class="text-caption text-medium-emphasis">Close</div>
                    <div class="text-body-1 font-mono">{{ formatPrice(lastClose) }}</div>
                </div>
            </v-col>
            <v-col cols="6" sm="3">
                <div class="stat-card">
                    <div class="text-caption text-medium-emphasis">Period High</div>
                    <div class="text-body-1 font-mono text-success">
                        {{ formatPrice(maxClose) }}
                    </div>
                </div>
            </v-col>
            <v-col cols="6" sm="3">
                <div class="stat-card">
                    <div class="text-caption text-medium-emphasis">Period Low</div>
                    <div class="text-body-1 font-mono text-error">{{ formatPrice(minClose) }}</div>
                </div>
            </v-col>
        </v-row>
    </div>
</template>

<script setup lang="ts">
    import * as d3 from 'd3';
    import { computed, onMounted, onUnmounted, ref } from 'vue';

    interface Bar {
        date: string;
        close: number;
        open?: number;
        high?: number;
        low?: number;
        volume?: number;
    }

    interface ChartEvent {
        date: string;
        label: string;
        severity?: 'critical' | 'high' | 'medium' | 'low';
        url?: string;
    }

    const props = defineProps<{
        ticker?: string | null;
        prices: Bar[];
        events?: ChartEvent[];
    }>();

    const periods = [
        { value: '1W', label: '7D', days: 7 },
        { value: '1M', label: '30D', days: 30 },
        { value: '3M', label: '90D', days: 90 },
        { value: '6M', label: '6M', days: 180 },
        { value: '1Y', label: '1Y', days: 365 },
        { value: 'ALL', label: 'All', days: Infinity },
    ];

    const period = ref('3M');
    const hoverIdx = ref<number | null>(null);
    const hoverX = ref<number | null>(null);
    const containerRef = ref<HTMLElement | null>(null);

    // Responsive sizing
    const width = ref(800);
    const height = 360;
    const padding = { top: 16, right: 16, bottom: 36, left: 56 };
    const volumeArea = { height: 56 };
    const priceArea = computed(() => ({
        top: padding.top,
        bottom: height - padding.bottom - (hasVolume.value ? volumeArea.height : 0),
    }));

    function measure() {
        const el = containerRef.value;
        if (!el) return;
        const next = Math.max(320, Math.floor(el.clientWidth));
        if (next !== width.value) width.value = next;
    }

    let ro: ResizeObserver | null = null;
    onMounted(() => {
        measure();
        if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
            ro = new ResizeObserver(() => measure());
            ro.observe(containerRef.value);
        } else {
            window.addEventListener('resize', measure);
        }
    });
    onUnmounted(() => {
        if (ro) ro.disconnect();
        else window.removeEventListener('resize', measure);
    });

    function parseTs(input: string): number | null {
        const ts = Date.parse(input);
        return Number.isFinite(ts) ? ts : null;
    }

    function dayKeyUtc(ts: number): string {
        const d = new Date(ts);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // Normalised, daily-aggregated, sorted data.
    // Elemental can return intraday points; collapsing to daily bars makes
    // 7D/30D/90D/6M/1Y windows behave as users expect.
    const allPoints = computed<Bar[]>(() => {
        type DayBar = Bar & { firstTs: number; lastTs: number };
        const byDay = new Map<string, DayBar>();

        for (const raw of props.prices || []) {
            if (!raw || typeof raw.close !== 'number' || !Number.isFinite(raw.close)) continue;
            const dateText =
                typeof raw.date === 'string' ? raw.date : new Date(raw.date).toISOString();
            const ts = parseTs(dateText);
            if (ts == null) continue;
            const key = dayKeyUtc(ts);
            const high =
                typeof raw.high === 'number' && Number.isFinite(raw.high) ? raw.high : raw.close;
            const low =
                typeof raw.low === 'number' && Number.isFinite(raw.low) ? raw.low : raw.close;
            const open =
                typeof raw.open === 'number' && Number.isFinite(raw.open) ? raw.open : raw.close;
            const volume =
                typeof raw.volume === 'number' && Number.isFinite(raw.volume)
                    ? raw.volume
                    : undefined;

            const existing = byDay.get(key);
            if (!existing) {
                byDay.set(key, {
                    date: `${key}T00:00:00.000Z`,
                    open,
                    high,
                    low,
                    close: raw.close,
                    volume,
                    firstTs: ts,
                    lastTs: ts,
                });
                continue;
            }

            if (ts < existing.firstTs) {
                existing.firstTs = ts;
                existing.open = open;
            }
            if (ts > existing.lastTs) {
                existing.lastTs = ts;
                existing.close = raw.close;
            }
            existing.high = Math.max(existing.high ?? raw.close, high);
            existing.low = Math.min(existing.low ?? raw.close, low);
            if (volume != null) existing.volume = (existing.volume ?? 0) + volume;
        }

        return Array.from(byDay.values())
            .sort((a, b) => a.firstTs - b.firstTs)
            .map(({ firstTs, lastTs, ...bar }) => bar);
    });

    const visiblePoints = computed<Bar[]>(() => {
        if (!allPoints.value.length) return [];
        const days = periods.find((p) => p.value === period.value)?.days ?? Infinity;
        if (days === Infinity) return allPoints.value;
        const lastTime = Date.parse(allPoints.value[allPoints.value.length - 1].date);
        const cutoff = lastTime - days * 86400000;
        const sliced = allPoints.value.filter((p) => Date.parse(p.date) >= cutoff);
        // Fallback: if the chosen window has nothing, show the most recent N samples
        if (sliced.length < 2) {
            const minSamples = 8;
            return allPoints.value.slice(-minSamples);
        }
        return sliced;
    });

    const hasVolume = computed(() =>
        visiblePoints.value.some((p) => typeof p.volume === 'number' && p.volume > 0)
    );

    // Scales (d3)
    const xScale = computed(() =>
        d3
            .scaleTime()
            .domain(
                visiblePoints.value.length
                    ? (d3.extent(visiblePoints.value, (d) => new Date(d.date)) as [Date, Date])
                    : [new Date(), new Date()]
            )
            .range([padding.left, width.value - padding.right])
    );

    const yScale = computed(() => {
        const closes = visiblePoints.value.map((p) => p.close);
        const lo = closes.length ? Math.min(...closes) : 0;
        const hi = closes.length ? Math.max(...closes) : 1;
        const pad = (hi - lo) * 0.08 || 1;
        return d3
            .scaleLinear()
            .domain([lo - pad, hi + pad])
            .range([priceArea.value.bottom, priceArea.value.top]);
    });

    const volScale = computed(() => {
        const max = d3.max(visiblePoints.value, (p) => p.volume || 0) || 1;
        return d3.scaleLinear().domain([0, max]).range([0, volumeArea.height]);
    });

    function xFor(i: number): number {
        const p = visiblePoints.value[i];
        if (!p) return padding.left;
        return xScale.value(new Date(p.date));
    }

    function volumeY(v?: number): number {
        const h = volScale.value(v || 0);
        return priceArea.value.bottom + volumeArea.height - h;
    }

    const barWidth = computed(() =>
        Math.max(
            1,
            ((width.value - padding.left - padding.right) / visiblePoints.value.length) * 0.6
        )
    );

    // Path generation
    const linePath = computed(() => {
        if (visiblePoints.value.length < 2) return '';
        const gen = d3
            .line<Bar>()
            .x((d) => xScale.value(new Date(d.date)))
            .y((d) => yScale.value(d.close))
            .curve(d3.curveMonotoneX);
        return gen(visiblePoints.value) || '';
    });

    const areaPath = computed(() => {
        if (visiblePoints.value.length < 2) return '';
        const gen = d3
            .area<Bar>()
            .x((d) => xScale.value(new Date(d.date)))
            .y0(priceArea.value.bottom)
            .y1((d) => yScale.value(d.close))
            .curve(d3.curveMonotoneX);
        return gen(visiblePoints.value) || '';
    });

    // Tick generation
    const yTicks = computed(() =>
        yScale.value.ticks(5).map((value) => ({ value, y: yScale.value(value) }))
    );

    const xTicks = computed(() => {
        if (!visiblePoints.value.length) return [];
        const span =
            (xScale.value.domain()[1] as Date).getTime() -
            (xScale.value.domain()[0] as Date).getTime();
        const days = span / 86400000;
        let format: (d: Date) => string;
        if (days <= 2) format = d3.timeFormat('%H:%M');
        else if (days <= 14) format = d3.timeFormat('%b %d');
        else if (days <= 200) format = d3.timeFormat('%b %d');
        else format = d3.timeFormat("%b '%y");
        return xScale.value.ticks(5).map((d) => ({ x: xScale.value(d), label: format(d) }));
    });

    const visibleEvents = computed(() => {
        if (!props.events?.length || !visiblePoints.value.length) return [];
        const domain = xScale.value.domain() as [Date, Date];
        return props.events
            .map((event, idx) => {
                const ts = Date.parse(event.date);
                if (!Number.isFinite(ts)) return null;
                const dt = new Date(ts);
                if (dt < domain[0] || dt > domain[1]) return null;
                return {
                    id: `${event.date}-${event.label}-${idx}`,
                    x: xScale.value(dt),
                    label: event.label,
                    date: event.date,
                    severity: event.severity || 'low',
                    url: event.url,
                };
            })
            .filter((event): event is NonNullable<typeof event> => !!event);
    });

    // Hover handling
    function onPointerMove(event: PointerEvent) {
        const svg = event.currentTarget as SVGSVGElement;
        const rect = svg.getBoundingClientRect();
        const xPx = ((event.clientX - rect.left) / rect.width) * width.value;
        hoverX.value = xPx;
        if (xPx < padding.left || xPx > width.value - padding.right) {
            hoverIdx.value = null;
            hoverX.value = null;
            return;
        }
        const targetDate = xScale.value.invert(xPx);
        const bisector = d3.bisector<Bar, Date>((p) => new Date(p.date)).center;
        const idx = bisector(visiblePoints.value, targetDate);
        hoverIdx.value = Math.max(0, Math.min(visiblePoints.value.length - 1, idx));
    }

    const hoverPoint = computed(() => {
        if (hoverIdx.value === null) return null;
        const p = visiblePoints.value[hoverIdx.value];
        if (!p) return null;
        const x = xScale.value(new Date(p.date));
        const y = yScale.value(p.close);
        const prev = visiblePoints.value[0];
        const change = prev && prev.close ? ((p.close - prev.close) / prev.close) * 100 : null;
        const changeText =
            change == null
                ? null
                : `${change >= 0 ? '+' : ''}${change.toFixed(2)}% from window start`;
        const changeClass = change == null ? '' : change >= 0 ? 'text-success' : 'text-error';
        const dateLabel = new Date(p.date).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
        // Position tooltip in pixel coordinates relative to container.
        const cw = containerRef.value?.clientWidth || width.value;
        const pxPerUnit = cw / width.value;
        const xPx = x * pxPerUnit;
        const tooltipStyle = {
            transform: `translate(${xPx > cw - 180 ? xPx - 180 : xPx + 12}px, 8px)`,
        };
        return { x, y, point: p, dateLabel, changeText, changeClass, tooltipStyle };
    });

    const hoveredEvent = computed(() => {
        if (hoverX.value == null || !visibleEvents.value.length) return null;
        let winner: (typeof visibleEvents.value)[number] | null = null;
        let distance = Number.POSITIVE_INFINITY;
        for (const event of visibleEvents.value) {
            const d = Math.abs(event.x - hoverX.value);
            if (d < distance) {
                winner = event;
                distance = d;
            }
        }
        if (!winner || distance > 6) return null;
        const cw = containerRef.value?.clientWidth || width.value;
        const pxPerUnit = cw / width.value;
        const xPx = winner.x * pxPerUnit;
        const tooltipStyle = {
            transform: `translate(${xPx > cw - 200 ? xPx - 200 : xPx + 12}px, 8px)`,
        };
        return {
            ...winner,
            kind: 'event' as const,
            tooltipStyle,
            dateLabel: new Date(winner.date).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
            }),
        };
    });

    const priceTooltip = computed(() => hoverPoint.value);

    const activeTooltip = computed(() => {
        if (hoveredEvent.value) return hoveredEvent.value;
        if (priceTooltip.value) return { ...priceTooltip.value, kind: 'price' as const };
        return null;
    });

    const firstClose = computed(() => visiblePoints.value[0]?.close ?? null);
    const lastClose = computed(() =>
        visiblePoints.value.length
            ? visiblePoints.value[visiblePoints.value.length - 1].close
            : null
    );
    const maxClose = computed(() =>
        visiblePoints.value.length ? Math.max(...visiblePoints.value.map((p) => p.close)) : null
    );
    const minClose = computed(() =>
        visiblePoints.value.length ? Math.min(...visiblePoints.value.map((p) => p.close)) : null
    );
    const isPositive = computed(() => {
        if (firstClose.value == null || lastClose.value == null) return true;
        return lastClose.value >= firstClose.value;
    });

    const headerSubtitle = computed(() => {
        const n = visiblePoints.value.length;
        const total = allPoints.value.length;
        if (!n) return `${total} samples loaded`;
        const first = new Date(visiblePoints.value[0].date);
        const last = new Date(visiblePoints.value[n - 1].date);
        const fmt = d3.timeFormat('%b %d, %Y');
        return `${n} of ${total} samples · ${fmt(first)} → ${fmt(last)}`;
    });

    // Formatters
    function formatPrice(v?: number | null) {
        if (v == null || !Number.isFinite(v)) return '—';
        return `$${v.toFixed(2)}`;
    }

    function formatVolume(v?: number) {
        if (v == null || !Number.isFinite(v)) return '—';
        if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
        if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
        if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
        return `${Math.round(v)}`;
    }
</script>

<style scoped>
    .price-chart-card {
        width: 100%;
    }
    .chart-wrap {
        position: relative;
        width: 100%;
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.015);
        padding: 8px 4px 4px;
    }
    .chart-svg {
        width: 100%;
        height: 360px;
        display: block;
        touch-action: none;
        cursor: crosshair;
    }
    .axis-label {
        font-size: 10px;
        fill: rgba(255, 255, 255, 0.55);
        font-family: var(--font-mono, ui-monospace, monospace);
    }
    .axis-line {
        stroke: rgba(255, 255, 255, 0.12);
        stroke-width: 1;
    }
    .grid-line {
        stroke: rgba(255, 255, 255, 0.05);
        stroke-width: 1;
        stroke-dasharray: 2 4;
    }
    .line {
        fill: none;
        stroke-width: 1.75;
        stroke-linejoin: round;
    }
    .line.pos {
        stroke: rgb(var(--v-theme-success, 76 175 80));
    }
    .line.neg {
        stroke: rgb(var(--v-theme-error, 244 67 54));
    }
    .area {
        opacity: 0.18;
    }
    .area.pos {
        fill: rgb(var(--v-theme-success, 76 175 80));
    }
    .area.neg {
        fill: rgb(var(--v-theme-error, 244 67 54));
    }
    .volume-bar {
        fill: rgba(255, 255, 255, 0.18);
    }
    .crosshair-line {
        stroke: rgba(255, 255, 255, 0.4);
        stroke-width: 1;
        stroke-dasharray: 3 3;
    }
    .event-line {
        stroke-width: 1;
        stroke-dasharray: 2 3;
        opacity: 0.7;
    }
    .event-dot {
        opacity: 0.95;
    }
    .sev-critical {
        stroke: rgba(244, 67, 54, 0.9);
        fill: rgba(244, 67, 54, 0.95);
    }
    .sev-high {
        stroke: rgba(255, 152, 0, 0.9);
        fill: rgba(255, 152, 0, 0.95);
    }
    .sev-medium {
        stroke: rgba(33, 150, 243, 0.9);
        fill: rgba(33, 150, 243, 0.95);
    }
    .sev-low {
        stroke: rgba(158, 158, 158, 0.85);
        fill: rgba(158, 158, 158, 0.95);
    }
    .hover-dot {
        stroke: #000;
        stroke-width: 1;
    }
    .hover-dot.pos {
        fill: rgb(var(--v-theme-success, 76 175 80));
    }
    .hover-dot.neg {
        fill: rgb(var(--v-theme-error, 244 67 54));
    }
    .tooltip {
        position: absolute;
        top: 0;
        left: 0;
        min-width: 160px;
        background: rgba(20, 20, 24, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        pointer-events: none;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
        z-index: 5;
    }
    .tt-date {
        color: rgba(255, 255, 255, 0.6);
        font-size: 11px;
        margin-bottom: 2px;
    }
    .tt-price {
        font-size: 16px;
        font-weight: 600;
        font-family: var(--font-mono, ui-monospace, monospace);
    }
    .tt-change {
        font-size: 11px;
        margin-bottom: 4px;
    }
    .tt-row {
        display: flex;
        justify-content: space-between;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 11px;
        color: rgba(255, 255, 255, 0.75);
    }
    .stat-card {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 8px 10px;
    }
    .empty-state {
        border: 1px dashed rgba(255, 255, 255, 0.08);
        border-radius: 10px;
    }
    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
