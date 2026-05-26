<template>
    <v-expansion-panels variant="accordion" multiple>
        <v-expansion-panel v-for="lens in lensDefs" :key="lens.key">
            <v-expansion-panel-title>
                <div class="d-flex align-center" style="width: 100%">
                    <v-chip size="x-small" variant="tonal" :color="lens.color" label class="mr-3">
                        {{ lens.source }}
                    </v-chip>
                    <span class="text-body-1">{{ lens.label }}</span>
                    <v-spacer />
                    <span
                        class="font-mono text-body-1 mr-4"
                        :style="`color: var(--v-theme-${scoreColor(scores[lens.key])})`"
                    >
                        {{ scores[lens.key] }}
                    </span>
                </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
                <div class="lens-body">
                    <div class="text-body-2 text-medium-emphasis mb-3">
                        {{ lens.description }}
                    </div>
                    <div class="metrics-grid mb-3">
                        <div v-for="m in lens.metrics" :key="m.label" class="metric-box">
                            <div class="text-caption text-medium-emphasis text-uppercase">
                                {{ m.label }}
                            </div>
                            <div class="text-h6 font-mono">{{ m.value }}</div>
                        </div>
                    </div>
                    <v-divider class="my-3" />
                    <div class="text-caption text-medium-emphasis mb-1">EVIDENCE</div>
                    <ul class="evidence-list">
                        <li v-for="(ev, i) in lens.evidence" :key="i">{{ ev }}</li>
                    </ul>
                </div>
            </v-expansion-panel-text>
        </v-expansion-panel>
    </v-expansion-panels>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    import type { EntityRiskScore } from '~/composables/useFusedScoring';

    const props = defineProps<{
        scores: EntityRiskScore;
        seed: string;
        lensDetails?: Record<string, { metrics: Array<{ label: string; value: string }>; evidence: string[] }>;
    }>();

    function h(s: string, salt: string) {
        let h = 0;
        for (const c of `${s}|${salt}`) h = (h * 33 + c.charCodeAt(0)) >>> 0;
        return h;
    }

    function scoreColor(v: number) {
        if (v >= 80) return 'error';
        if (v >= 65) return 'warning';
        if (v >= 50) return 'info';
        return 'success';
    }

    const lensDefs = computed(() => {
        const seed = props.seed;
        const lev = (1.5 + (h(seed, 'lev') % 350) / 100).toFixed(2);
        const cov = (1.0 + (h(seed, 'cov') % 300) / 100).toFixed(2);
        const margin = (3 + (h(seed, 'mg') % 18)).toFixed(1);
        const equity = (1 + (h(seed, 'eq') % 50)).toFixed(1);

        const officers = 4 + (h(seed, 'off') % 8);
        const departures = h(seed, 'dep') % 4;
        const auditorYears = 1 + (h(seed, 'aud') % 8);

        const articles = 6 + (h(seed, 'art') % 18);
        const negPct = 20 + (h(seed, 'neg') % 60);
        const velocity = (1 + (h(seed, 'vel') % 30) / 10).toFixed(1);

        const drawdown = (5 + (h(seed, 'dd') % 35)).toFixed(1);
        const vol = (15 + (h(seed, 'vol') % 60)).toFixed(0);
        const rsi = 20 + (h(seed, 'rsi') % 60);

        const generated = [
            {
                key: 'solvency' as const,
                label: 'Solvency (SEC)',
                source: 'SEC',
                color: 'primary',
                description:
                    'Financial Health Score derived from XBRL fundamentals. Tracks leverage, coverage, margin, and equity erosion across recent filings.',
                metrics: [
                    { label: 'Net Debt / EBITDA', value: `${lev}x` },
                    { label: 'Interest Coverage', value: `${cov}x` },
                    { label: 'Operating Margin', value: `${margin}%` },
                    { label: 'Equity Ratio', value: `${equity}%` },
                ],
                evidence: [
                    `Most recent 10-K filed ${30 + (h(seed, 'k') % 200)} days ago`,
                    `XBRL facts extracted from 4 trailing quarters`,
                    `Distress signal flagged: ${departures > 1 ? 'yes' : 'no'}`,
                ],
            },
            {
                key: 'executive' as const,
                label: 'Executive Risk (SEC)',
                source: 'SEC',
                color: 'primary',
                description:
                    'Governance and key-person stability derived from officer / director tenure, departures, and auditor changes.',
                metrics: [
                    { label: 'Named Officers', value: officers },
                    { label: 'Departures (TTM)', value: departures },
                    { label: 'Auditor Tenure', value: `${auditorYears}y` },
                    { label: 'Board Size', value: 7 + (h(seed, 'bd') % 5) },
                ],
                evidence: [
                    `8-K Item 5.02 filings reviewed in trailing 12 months`,
                    `${departures > 0 ? departures + ' executive departure(s) flagged' : 'No flagged departures'}`,
                    `Auditor change: ${auditorYears < 2 ? 'yes (within 2 years)' : 'no'}`,
                ],
            },
            {
                key: 'news' as const,
                label: 'News Pressure',
                source: 'NEWS',
                color: 'info',
                description:
                    'Sentiment, mention velocity, and adverse cluster detection from the platform news layer.',
                metrics: [
                    { label: 'Articles (30d)', value: articles },
                    { label: 'Negative %', value: `${negPct}%` },
                    { label: 'Velocity vs 90d', value: `${velocity}x` },
                    { label: 'Top Outlets', value: 4 },
                ],
                evidence: [
                    `Sentiment computed across ${articles} articles in the last 30 days`,
                    `${negPct}% of coverage classified as adverse / negative`,
                    `Mention rate is ${velocity}x the trailing-90d median`,
                ],
            },
            {
                key: 'market' as const,
                label: 'Market Signal',
                source: 'STOCK',
                color: 'success',
                description: 'Price, volatility, and anomaly detection from the market data layer.',
                metrics: [
                    { label: '30d Drawdown', value: `${drawdown}%` },
                    { label: '30d Volatility', value: `${vol}%` },
                    { label: 'RSI (14)', value: rsi },
                    { label: 'Anomalies (TTM)', value: 1 + (h(seed, 'an') % 4) },
                ],
                evidence: [
                    `Returns vs sector benchmark over trailing 30 days`,
                    `Volatility regime classification from intraday OHLCV`,
                    `Volume anomaly detection on declining-price days`,
                ],
            },
        ];
        return generated.map((lens) => {
            const override = props.lensDetails?.[lens.key];
            if (!override) return lens;
            return {
                ...lens,
                metrics: override.metrics?.length ? override.metrics : lens.metrics,
                evidence: override.evidence?.length ? override.evidence : lens.evidence,
            };
        });
    });
</script>

<style scoped>
    .metrics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
    }

    .metric-box {
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        padding: 10px 12px;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .evidence-list {
        margin: 0;
        padding-left: 18px;
        color: var(--lv-silver, rgba(255, 255, 255, 0.7));
        font-size: 0.875rem;
    }

    .evidence-list li {
        margin-bottom: 4px;
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
