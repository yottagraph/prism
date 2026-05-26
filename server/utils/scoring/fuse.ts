import { clampScore, hash32 } from './hash';
import type { EntityRiskScore, RiskDriver, RiskTier, SourceFusionWeights, SubScores } from './types';

export const DEFAULT_WEIGHTS: SourceFusionWeights = {
    solvency: 0.4,
    executive: 0.25,
    news: 0.2,
    market: 0.15,
};

export function fuseScore(s: SubScores, w: SourceFusionWeights = DEFAULT_WEIGHTS): number {
    const sum = w.solvency + w.executive + w.news + w.market || 1;
    return clampScore(
        (s.solvency * w.solvency + s.executive * w.executive + s.news * w.news + s.market * w.market) /
            sum
    );
}

export function deriveTier(fused: number): RiskTier {
    if (fused >= 80) return 'critical';
    if (fused >= 65) return 'high';
    if (fused >= 50) return 'watch';
    return 'normal';
}

export function confidence(s: SubScores): 'High' | 'Medium' | 'Low' {
    const arr = [s.solvency, s.executive, s.news, s.market];
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    const stddev = Math.sqrt(variance);
    if (stddev < 10) return 'High';
    if (stddev < 20) return 'Medium';
    return 'Low';
}

export function detectConflicts(
    s: SubScores,
    threshold = 20
): Array<{ lens: keyof SubScores; delta: number }> {
    const mean = (s.solvency + s.executive + s.news + s.market) / 4;
    const out: Array<{ lens: keyof SubScores; delta: number }> = [];
    (Object.keys(s) as Array<keyof SubScores>).forEach((k) => {
        const delta = s[k] - mean;
        if (Math.abs(delta) >= threshold) out.push({ lens: k, delta: Math.round(delta) });
    });
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

const LENS_SOURCE: Record<keyof SubScores, RiskDriver['source']> = {
    solvency: 'SEC',
    executive: 'SEC',
    news: 'NEWS',
    market: 'STOCK',
};

const DRIVER_LIBRARY: Record<
    keyof SubScores,
    Array<{ label: string; expl: string; ev: string; href?: string }>
> = {
    solvency: [
        {
            label: 'Elevated leverage',
            expl: 'Net debt to EBITDA is above peer median and coverage has narrowed.',
            ev: 'Derived from XBRL filing fundamentals and ratio trend history.',
        },
        {
            label: 'Margin compression',
            expl: 'Operating margins are deteriorating against recent quarters.',
            ev: 'Derived from most recent income statement property values.',
        },
        {
            label: 'Stale filings',
            expl: 'Recent filing cadence weakens confidence in financial recency.',
            ev: 'Filing timestamps have a high recency penalty.',
        },
    ],
    executive: [
        {
            label: 'C-suite departure cluster',
            expl: 'Multiple executive turnover events landed inside the recency window.',
            ev: 'Officer/director relationship churn and 8-K departure events.',
        },
        {
            label: 'Auditor change risk',
            expl: 'Auditor transition increases governance and reporting uncertainty.',
            ev: 'Recent governance event stream includes auditor change signals.',
        },
        {
            label: 'Board turnover',
            expl: 'Board-seat instability may increase execution risk.',
            ev: 'Director relationship graph shows elevated change rate.',
        },
    ],
    news: [
        {
            label: 'Negative coverage cluster',
            expl: 'Adverse articles are concentrated in the recent window.',
            ev: 'Sentiment feed and mention clustering from news properties.',
        },
        {
            label: 'Rising mention velocity',
            expl: 'Entity mention velocity is elevated vs trailing baseline.',
            ev: 'News mention timeseries indicates acceleration.',
        },
        {
            label: 'Adverse regulatory mention',
            expl: 'Recent press references potential investigations or enforcement risk.',
            ev: 'Topic-tagged article properties include regulatory terms.',
        },
    ],
    market: [
        {
            label: 'Drawdown vs sector',
            expl: '30-day return underperforms its baseline cohort.',
            ev: 'Market signal properties show negative relative momentum.',
        },
        {
            label: 'Volatility spike',
            expl: 'Volatility regime moved into elevated percentile bands.',
            ev: 'Volatility properties exceed prior rolling windows.',
        },
        {
            label: 'Anomalous volume/price',
            expl: 'Price weakness coincides with unusual trading activity.',
            ev: 'Anomaly flags triggered on combined price/volume features.',
        },
    ],
};

export function deriveDrivers(seed: string, s: SubScores): RiskDriver[] {
    const sorted = (Object.keys(s) as Array<keyof SubScores>)
        .map((lens) => ({ lens, score: s[lens] }))
        .sort((a, b) => b.score - a.score);
    const out: RiskDriver[] = [];
    for (const { lens, score } of sorted) {
        const lib = DRIVER_LIBRARY[lens];
        const pick = lib[hash32(`${seed}|driver|${lens}`) % lib.length];
        out.push({
            lens,
            source: LENS_SOURCE[lens],
            score,
            label: pick.label,
            explanation: pick.expl,
            evidence: pick.ev,
            href: pick.href,
        });
    }
    return out.slice(0, 5);
}

export function makeEntityRiskScore(
    subs: SubScores,
    weights: SourceFusionWeights,
    previousFused?: number
): EntityRiskScore {
    const fused = fuseScore(subs, weights);
    return {
        ...subs,
        fused,
        previousFused,
        tier: deriveTier(fused),
        updatedAt: Date.now(),
    };
}

