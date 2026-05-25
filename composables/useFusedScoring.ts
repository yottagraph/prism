/**
 * Multi-source fused scoring.
 *
 * Each entity carries four per-lens scores (solvency / executive / news /
 * market) plus a fused composite. In the production pipeline these come
 * from the Query Agent's analytical modules; until those are wired the
 * UI uses a deterministic seeded score so the demo is reproducible and
 * the visual story (high-risk names rising to the top, conflicts between
 * lenses) still lands.
 */

export type RiskTier = 'critical' | 'high' | 'watch' | 'normal';

export interface SubScores {
    solvency: number;
    executive: number;
    news: number;
    market: number;
}

export interface EntityRiskScore extends SubScores {
    fused: number;
    tier: RiskTier;
    updatedAt: number;
}

export interface SourceFusionWeights {
    solvency: number;
    executive: number;
    news: number;
    market: number;
}

export const DEFAULT_WEIGHTS: SourceFusionWeights = {
    solvency: 0.4,
    executive: 0.25,
    news: 0.2,
    market: 0.15,
};

/** FNV-1a 32-bit hash — small, fast, no deps. */
function hash32(input: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

/** Convert a hash into a 0–100 score with a pleasant distribution. */
function scoreFromHash(seed: string, salt: string): number {
    const h = hash32(`${seed}|${salt}`);
    // Map to 0..1 then squash toward the middle/high range with a mild bias
    // (most names live in 30..85 — only a few are extreme).
    const u = (h % 10000) / 10000;
    const biased = Math.pow(u, 0.85);
    return Math.round(20 + biased * 75);
}

export function seededEntityScore(seed: string): SubScores {
    return {
        solvency: scoreFromHash(seed, 'fhs'),
        executive: scoreFromHash(seed, 'ers'),
        news: scoreFromHash(seed, 'news'),
        market: scoreFromHash(seed, 'mkt'),
    };
}

export function fuseScore(s: SubScores, w: SourceFusionWeights = DEFAULT_WEIGHTS): number {
    const sum = w.solvency + w.executive + w.news + w.market || 1;
    const raw =
        (s.solvency * w.solvency +
            s.executive * w.executive +
            s.news * w.news +
            s.market * w.market) /
        sum;
    return Math.round(raw);
}

export function deriveTier(fused: number): RiskTier {
    if (fused >= 80) return 'critical';
    if (fused >= 65) return 'high';
    if (fused >= 50) return 'watch';
    return 'normal';
}

export function tierColor(tier: RiskTier): string {
    switch (tier) {
        case 'critical':
            return 'error';
        case 'high':
            return 'warning';
        case 'watch':
            return 'info';
        default:
            return 'success';
    }
}

export function tierLabel(tier: RiskTier): string {
    return tier.charAt(0).toUpperCase() + tier.slice(1);
}

/**
 * Identify the source lenses whose scores diverge from the fused average
 * by more than `threshold` points — these are the "agreement / conflict"
 * indicators surfaced in the Query Agent narrative.
 */
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

/** Confidence proxy from the spread of sub-scores. Tight spread → high. */
export function confidence(s: SubScores): 'High' | 'Medium' | 'Low' {
    const arr = [s.solvency, s.executive, s.news, s.market];
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    const stddev = Math.sqrt(variance);
    if (stddev < 10) return 'High';
    if (stddev < 20) return 'Medium';
    return 'Low';
}

export interface RiskDriver {
    lens: keyof SubScores;
    source: 'SEC' | 'NEWS' | 'STOCK' | 'POLY';
    score: number;
    label: string;
    explanation: string;
    evidence: string;
}

const LENS_SOURCE: Record<keyof SubScores, RiskDriver['source']> = {
    solvency: 'SEC',
    executive: 'SEC',
    news: 'NEWS',
    market: 'STOCK',
};

const DRIVER_LIBRARY: Record<
    keyof SubScores,
    Array<{ label: string; expl: string; ev: string }>
> = {
    solvency: [
        {
            label: 'Elevated leverage',
            expl: 'Net debt to EBITDA exceeds peer median; coverage ratio narrowing.',
            ev: 'Most recent 10-K liquidity & capital resources section.',
        },
        {
            label: 'Margin compression',
            expl: 'Operating margin down YoY against rising input costs.',
            ev: 'Latest 10-Q income statement segment detail.',
        },
        {
            label: 'Equity erosion',
            expl: 'Successive quarters of accumulated deficit growth.',
            ev: 'Quarterly balance sheet stockholders\u2019 equity rollforward.',
        },
    ],
    executive: [
        {
            label: 'C-suite departure cluster',
            expl: 'Two or more named executive officers exited within the trailing 6 months.',
            ev: '8-K Item 5.02 filings within the last two quarters.',
        },
        {
            label: 'Auditor change',
            expl: 'Independent registered public accounting firm changed within the last fiscal year.',
            ev: '8-K Item 4.01 filing.',
        },
        {
            label: 'Board turnover',
            expl: 'Multiple director resignations without replacement disclosure.',
            ev: 'Proxy statement governance section + 8-K Item 5.02.',
        },
    ],
    news: [
        {
            label: 'Negative coverage cluster',
            expl: 'Three or more adverse articles in the last 14 days from top-tier outlets.',
            ev: 'Sentiment-tagged article feed; severity-weighted cluster.',
        },
        {
            label: 'Rising mention velocity',
            expl: 'Mention rate is 2.3x the trailing 90-day median.',
            ev: 'News volume timeseries from the platform sentiment layer.',
        },
        {
            label: 'Adverse regulatory mention',
            expl: 'Coverage flags an active investigation or enforcement filing.',
            ev: 'Topic-classified article with regulator entity link.',
        },
    ],
    market: [
        {
            label: 'Drawdown vs sector',
            expl: '30-day return underperforms the sector benchmark by >12%.',
            ev: 'Stock data layer: returns + benchmark deviation.',
        },
        {
            label: 'Volatility spike',
            expl: 'Implied and realized volatility both above 75th percentile.',
            ev: 'Options chain implied vol + 30D realized vol.',
        },
        {
            label: 'Anomaly: volume + price',
            expl: 'Abnormal volume on declining price detected in the last 5 sessions.',
            ev: 'Anomaly detection module on intraday OHLCV.',
        },
    ],
};

export function deriveDrivers(seed: string, s: SubScores): RiskDriver[] {
    const sorted = (Object.keys(s) as Array<keyof SubScores>)
        .map((lens) => ({ lens, score: s[lens] }))
        .sort((a, b) => b.score - a.score);
    const drivers: RiskDriver[] = [];
    for (const { lens, score } of sorted) {
        const lib = DRIVER_LIBRARY[lens];
        const choice = lib[hash32(`${seed}|driver|${lens}`) % lib.length];
        drivers.push({
            lens,
            source: LENS_SOURCE[lens],
            score,
            label: choice.label,
            explanation: choice.expl,
            evidence: choice.ev,
        });
    }
    return drivers.slice(0, 5);
}
