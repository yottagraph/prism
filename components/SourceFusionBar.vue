<template>
    <v-card class="pa-4">
        <div class="d-flex align-center mb-1">
            <v-icon size="small" class="mr-2">mdi-layers-triple-outline</v-icon>
            <span class="text-subtitle-2">Signal coverage</span>
            <v-spacer />
            <span v-if="scanning" class="d-inline-flex align-center scan-live">
                <span class="scan-live-dot mr-1" />
                <span class="text-caption">Fusing</span>
            </span>
        </div>
        <p class="text-caption text-medium-emphasis mb-3" style="line-height: 1.4">
            All signals from one Elemental API — no ingestion pipelines.
        </p>

        <div class="source-rows">
            <div
                v-for="src in sources"
                :key="src.key"
                class="source-row"
                :class="{ 'source-row--empty': src.tooltip }"
            >
                <v-tooltip location="top" :disabled="!src.tooltip" :text="src.tooltip ?? ''">
                    <template #activator="{ props: tooltipProps }">
                        <div v-bind="tooltipProps" class="source-row-inner">
                            <div class="source-header">
                                <div class="d-flex align-center source-label">
                                    <v-icon :color="src.color" size="18" class="mr-2">{{
                                        src.icon
                                    }}</v-icon>
                                    <span class="text-body-2">{{ src.label }}</span>
                                </div>
                                <span class="text-body-2 text-medium-emphasis coverage-count">
                                    <AnimatedNumber :value="src.coverage" />/{{ src.denom }}
                                </span>
                            </div>
                            <v-progress-linear
                                :model-value="(src.coverage / Math.max(1, src.denom)) * 100"
                                :color="src.color"
                                height="4"
                                rounded
                                class="mb-1 fusion-bar"
                                :class="{ 'fusion-bar--live': scanning && src.coverage > 0 }"
                            />
                            <div
                                v-if="src.detail.length"
                                class="d-flex align-center flex-wrap source-detail"
                            >
                                <span
                                    v-for="(seg, i) in src.detail"
                                    :key="i"
                                    class="text-caption text-medium-emphasis"
                                >
                                    <template v-if="i > 0">
                                        <span class="detail-sep mx-1">·</span>
                                    </template>
                                    {{ seg }}
                                </span>
                            </div>
                        </div>
                    </template>
                </v-tooltip>
            </div>
        </div>

        <div v-if="subFlags.length > 0" class="d-flex flex-wrap ga-2 mt-3 pt-2 sub-flags-border">
            <v-chip
                v-for="flag in subFlags"
                :key="flag.label"
                size="x-small"
                variant="tonal"
                :color="flag.color"
                label
            >
                {{ flag.label }} {{ flag.count }}
            </v-chip>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import type { PortfolioCoverageDetail } from '~/composables/usePortfolio';

    const props = withDefaults(
        defineProps<{
            total: number;
            coverage: { sec: number; news: number; stock: number; poly: number };
            coverageDetail: PortfolioCoverageDetail;
            /**
             * Portfolio-level FRED macro coverage. FRED series describe the macro
             * economy (GDP, CPI, rates), not individual issuers, so coverage is
             * measured as live curated series rather than entities.
             */
            fredMacro?: {
                live: number;
                total: number;
                earliest: string | null;
                latest: string | null;
            };
            scanning?: boolean;
        }>(),
        { scanning: false }
    );

    const EMPTY_EXPLANATIONS: Record<string, string> = {
        sec: 'No portfolio entities resolved with SEC filings. Check that entity names match SEC-registered issuers.',
        news: 'No news articles found for any portfolio entity in the last 90 days.',
        stock: 'No stock instruments linked to any portfolio entity in the knowledge graph.',
        poly: 'No active prediction markets found for any portfolio entity on Polymarket. Polymarket markets cluster on politics, geopolitics, and crypto — credit / FHS portfolios rarely overlap.',
        fred: 'FRED macro signals are temporarily unavailable. These are portfolio-wide indicators (GDP, inflation, rates) shown in the Macro Regime panel.',
        fdic: 'No FDIC-insured depository institutions in this portfolio. FDIC supplies quarterly call-report financials and bank-failure data for banks.',
        sanctions: 'No portfolio entities matched OpenSanctions / OFAC / CSL screening lists.',
    };

    function formatCount(n: number): string {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
        return String(n);
    }

    function formatDateShort(iso: string | null): string | null {
        if (!iso) return null;
        const match = iso.match(/^(\d{4})-?(\d{2})/);
        if (match) return `${match[1]}-${match[2]}`;
        return iso.slice(0, 7);
    }

    function dateSpan(earliest: string | null, latest: string | null): string | null {
        const e = formatDateShort(earliest);
        const l = formatDateShort(latest);
        if (!e && !l) return null;
        if (e === l) return e!;
        if (e && l) return `${e} → ${l}`;
        return e ?? l ?? null;
    }

    type SourceKey = 'sec' | 'news' | 'stock' | 'poly' | 'fred' | 'fdic' | 'sanctions';

    interface SourceRow {
        key: SourceKey;
        label: string;
        icon: string;
        coverage: number;
        /** Denominator for the coverage fraction (entity total, or series total for FRED). */
        denom: number;
        color: string;
        tooltip?: string;
        detail: string[];
    }

    const sources = computed<SourceRow[]>(() => {
        const cd = props.coverageDetail;
        const rows: SourceRow[] = [];

        // SEC
        const secDetail: string[] = [];
        if (cd.sec.filings > 0) {
            secDetail.push(`${formatCount(cd.sec.filings)} filings`);
        } else if (cd.sec.entities > 0) {
            secDetail.push(`${cd.sec.entities} entities with SEC data`);
        }
        const secSpan = dateSpan(cd.sec.earliest, cd.sec.latest);
        if (secSpan) secDetail.push(secSpan);
        rows.push({
            key: 'sec',
            label: 'SEC',
            icon: 'mdi-file-document-outline',
            coverage: props.coverage.sec,
            denom: props.total,
            color: 'primary',
            detail: secDetail,
        });

        // FDIC — bank call-report financials + failures (depository institutions)
        rows.push({
            key: 'fdic',
            label: 'FDIC',
            icon: 'mdi-bank',
            coverage: cd.fdic,
            denom: props.total,
            color: 'cyan',
            detail: cd.fdic > 0 ? ['bank financials'] : [],
        });

        // News
        const newsDetail: string[] = [];
        if (cd.news.articles > 0) newsDetail.push(`${formatCount(cd.news.articles)} articles`);
        if (cd.news.events > 0) newsDetail.push(`${formatCount(cd.news.events)} events`);
        if (newsDetail.length === 0 && cd.news.entities > 0) {
            newsDetail.push(`${cd.news.entities} entities with news data`);
        }
        const newsSpan = dateSpan(cd.news.earliest, cd.news.latest);
        if (newsSpan) newsDetail.push(newsSpan);
        rows.push({
            key: 'news',
            label: 'News',
            icon: 'mdi-newspaper-variant-outline',
            coverage: props.coverage.news,
            denom: props.total,
            color: 'info',
            detail: newsDetail,
        });

        // Stock
        const stockDetail: string[] = [];
        if (cd.stock.readings > 0) {
            stockDetail.push(`${formatCount(cd.stock.readings)} readings`);
        } else if (cd.stock.instruments > 0) {
            stockDetail.push(`${formatCount(cd.stock.instruments)} instruments, no prices`);
        } else if (cd.stock.entities > 0) {
            stockDetail.push(`${cd.stock.entities} entities with market data`);
        }
        const stockSpan = dateSpan(cd.stock.earliest, cd.stock.latest);
        if (stockSpan) stockDetail.push(stockSpan);
        rows.push({
            key: 'stock',
            label: 'Stock',
            icon: 'mdi-chart-line',
            coverage: props.coverage.stock,
            denom: props.total,
            color: 'success',
            detail: stockDetail,
        });

        // Polymarket
        const polyDetail: string[] = [];
        if (cd.poly.markets > 0) {
            polyDetail.push(`${cd.poly.markets} markets`);
            if (cd.poly.active > 0) polyDetail.push(`${cd.poly.active} active`);
        }
        rows.push({
            key: 'poly',
            label: 'Polymarket',
            icon: 'mdi-crystal-ball',
            coverage: props.coverage.poly,
            denom: props.total,
            color: 'warning',
            detail: polyDetail,
        });

        // FRED — portfolio-level macro context (not per-entity). Coverage is the
        // number of curated macro series currently live.
        const fred = props.fredMacro;
        const fredLive = fred?.live ?? 0;
        const fredTotal = fred && fred.total > 0 ? fred.total : 5;
        const fredDetail: string[] = [];
        if (fredLive > 0) {
            fredDetail.push('portfolio macro');
            const fredSpan = dateSpan(fred?.earliest ?? null, fred?.latest ?? null);
            if (fredSpan) fredDetail.push(fredSpan);
        }
        rows.push({
            key: 'fred',
            label: 'FRED',
            icon: 'mdi-bank-outline',
            coverage: fredLive,
            denom: fredTotal,
            color: 'blue-grey',
            detail: fredDetail,
        });

        // Sanctions — OpenSanctions / OFAC / CSL screening hits
        rows.push({
            key: 'sanctions',
            label: 'Screening',
            icon: 'mdi-shield-alert-outline',
            coverage: cd.sanctions,
            denom: props.total,
            color: 'red',
            detail: cd.sanctions > 0 ? ['flagged'] : [],
        });

        return rows.map((src) => {
            let explanation = EMPTY_EXPLANATIONS[src.key];
            // When tickers are linked but no prices came back, the data gap is a
            // price-fetch failure (e.g. stocks service unavailable), not a missing
            // instrument link — say so instead of "no instruments linked".
            if (src.key === 'stock' && cd.stock.instruments > 0 && cd.stock.readings === 0) {
                explanation = `${cd.stock.instruments} instruments are linked, but no price data could be retrieved. The stock price service may be unavailable.`;
            }
            return {
                ...src,
                tooltip: src.coverage === 0 && props.total > 0 ? explanation : undefined,
            };
        });
    });

    const subFlags = computed(() => {
        const cd = props.coverageDetail;
        const flags: Array<{ label: string; count: number; color: string }> = [];
        if (cd.acs > 0) flags.push({ label: 'Ownership screened', count: cd.acs, color: 'purple' });
        if (cd.eventPressure > 0)
            flags.push({ label: 'Material events', count: cd.eventPressure, color: 'deep-orange' });
        if (cd.velocity > 0)
            flags.push({ label: 'Filing activity', count: cd.velocity, color: 'teal' });
        return flags;
    });
</script>

<style scoped>
    .source-rows {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .source-row--empty {
        cursor: help;
    }

    .source-row-inner {
        display: flex;
        flex-direction: column;
    }

    .source-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2px;
    }

    .source-label {
        min-width: 110px;
    }

    .coverage-count {
        font-variant-numeric: tabular-nums;
        min-width: 44px;
        text-align: right;
    }

    .source-detail {
        line-height: 1.3;
        min-height: 16px;
    }

    .detail-sep {
        opacity: 0.4;
    }

    .sub-flags-border {
        border-top: 1px solid rgba(var(--dynamic-fg-rgb, 128, 128, 128), 0.08);
    }

    /* Smooth, eased fill so coverage growth during a scan reads as a deliberate
       "filling up" rather than a hard jump. */
    .fusion-bar :deep(.v-progress-linear__determinate) {
        transition: width 0.7s cubic-bezier(0.22, 1, 0.36, 1) !important;
        overflow: hidden;
    }

    /* Light sweep across the filled portion while a scan is in flight. */
    .fusion-bar--live :deep(.v-progress-linear__determinate)::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.55) 50%,
            transparent 100%
        );
        animation: fusion-sweep 1.5s ease-in-out infinite;
    }

    @keyframes fusion-sweep {
        0% {
            transform: translateX(-100%);
        }
        100% {
            transform: translateX(200%);
        }
    }

    .scan-live {
        color: rgb(var(--dynamic-primary-rgb, 63, 234, 0));
    }

    .scan-live-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: rgb(var(--dynamic-primary-rgb, 63, 234, 0));
        animation: scan-pulse 1.2s ease-in-out infinite;
    }

    @keyframes scan-pulse {
        0%,
        100% {
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(var(--dynamic-primary-rgb, 63, 234, 0), 0.5);
        }
        50% {
            opacity: 0.5;
            box-shadow: 0 0 0 4px rgba(var(--dynamic-primary-rgb, 63, 234, 0), 0);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .fusion-bar--live :deep(.v-progress-linear__determinate)::after {
            animation: none;
        }
        .scan-live-dot {
            animation: none;
        }
    }
</style>
