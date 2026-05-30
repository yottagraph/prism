/**
 * Goals-based risk-fit logic.
 *
 * Core insight: given a user's time horizon and risk tolerance, are their
 * holdings in each bucket appropriate?  We blend real volatility (when MCP
 * data is available) with a sector-heuristic fallback so the signal is never
 * empty.
 */

import type { MacroFactorBucket } from '../macro/sectorFactors';
import type { DemoUser, RiskTolerance } from '~/composables/useUser';
import type { PortfolioDoc } from '~/composables/usePortfolio';

// ---------------------------------------------------------------------------
// Risk band
// ---------------------------------------------------------------------------

export type RiskBand = 'conservative' | 'moderate' | 'aggressive' | 'unknown';

/** 0-100 risk score per band midpoints. */
const BAND_SCORES: Record<RiskBand, number> = {
    conservative: 25,
    moderate: 50,
    aggressive: 75,
    unknown: 50,
};

export interface HoldingRisk {
    band: RiskBand;
    /** 0-100 risk score. */
    score: number;
    /** Volatility source: 'vol' when real annualised vol was used, 'sector' otherwise. */
    source: 'vol' | 'sector';
}

/** Map macro sector bucket -> risk band. */
function sectorToBand(bucket: MacroFactorBucket): RiskBand {
    switch (bucket) {
        case 'growth_tech':
        case 'energy':
            return 'aggressive';
        case 'cyclical':
            return 'moderate';
        case 'defensive':
        case 'rate_sensitive':
            return 'conservative';
        default:
            return 'unknown';
    }
}

/**
 * Risk band for a single holding.
 * Uses annualised volatility when available; falls back to sector heuristic.
 */
export function holdingRiskBand(
    annualizedVolPct: number | null | undefined,
    sectorBucket: MacroFactorBucket | null | undefined
): HoldingRisk {
    if (annualizedVolPct != null) {
        // Volatility thresholds (annualised %):
        //   < 20 conservative, 20-35 moderate, > 35 aggressive
        const band: RiskBand =
            annualizedVolPct < 20
                ? 'conservative'
                : annualizedVolPct < 35
                  ? 'moderate'
                  : 'aggressive';
        const score = Math.min(100, Math.round((annualizedVolPct / 50) * 100));
        return { band, score, source: 'vol' };
    }

    const band = sectorToBand(sectorBucket ?? 'unclassified');
    return { band, score: BAND_SCORES[band], source: 'sector' };
}

// ---------------------------------------------------------------------------
// Bucket-level aggregation
// ---------------------------------------------------------------------------

export interface BucketRiskProfile {
    /** Weighted mean risk score across holdings. */
    avgScore: number;
    /** Modal (weight-dominant) risk band. */
    dominantBand: RiskBand;
    /** Share of holdings (0-1, weighted) in aggressive bucket. */
    aggressiveFraction: number;
    /** Share of holdings (0-1, weighted) using real-vol data. */
    volCoverage: number;
}

export interface HoldingInput {
    annualizedVolPct?: number | null;
    sectorBucket?: MacroFactorBucket | null;
    /**
     * Position weight (e.g. current value or amount invested). When provided
     * for one or more holdings, the bucket profile becomes value-weighted
     * instead of equal-weighted. Non-positive/missing weights fall back to 1.
     */
    weight?: number | null;
}

export function bucketRiskProfile(holdings: HoldingInput[]): BucketRiskProfile {
    if (holdings.length === 0) {
        return { avgScore: 50, dominantBand: 'unknown', aggressiveFraction: 0, volCoverage: 0 };
    }

    const risks = holdings.map((h) => ({
        ...holdingRiskBand(h.annualizedVolPct, h.sectorBucket),
        weight:
            typeof h.weight === 'number' && Number.isFinite(h.weight) && h.weight > 0
                ? h.weight
                : 1,
    }));
    const totalWeight = risks.reduce((s, r) => s + r.weight, 0) || 1;

    const avgScore = Math.round(risks.reduce((s, r) => s + r.score * r.weight, 0) / totalWeight);
    const aggressiveFraction =
        risks.filter((r) => r.band === 'aggressive').reduce((s, r) => s + r.weight, 0) /
        totalWeight;
    const volCoverage =
        risks.filter((r) => r.source === 'vol').reduce((s, r) => s + r.weight, 0) / totalWeight;

    const bandWeight: Record<RiskBand, number> = {
        conservative: 0,
        moderate: 0,
        aggressive: 0,
        unknown: 0,
    };
    risks.forEach((r) => (bandWeight[r.band] += r.weight));
    const dominantBand = Object.entries(bandWeight).sort(
        ([, a], [, b]) => b - a
    )[0]![0] as RiskBand;

    return { avgScore, dominantBand, aggressiveFraction, volCoverage };
}

// ---------------------------------------------------------------------------
// Target risk band
// ---------------------------------------------------------------------------

/**
 * Derive the target risk band for a bucket based on the investment horizon and
 * the user's stated risk tolerance.
 *
 * Horizon is the primary driver; tolerance provides a +/-1 nudge:
 *   ≤ 3 yrs  → conservative  (short)
 *   4-10 yrs → moderate      (medium)
 *   > 10 yrs → aggressive    (long)
 *   tolerance 1-2 shifts down one tier; 4-5 shifts up one tier
 */
export function targetRiskBand(horizonYears: number, riskTolerance: RiskTolerance): RiskBand {
    const BANDS: RiskBand[] = ['conservative', 'moderate', 'aggressive'];

    let idx: number;
    if (horizonYears <= 3) {
        idx = 0;
    } else if (horizonYears <= 10) {
        idx = 1;
    } else {
        idx = 2;
    }

    if (riskTolerance <= 2) idx = Math.max(0, idx - 1);
    if (riskTolerance >= 4) idx = Math.min(2, idx + 1);

    return BANDS[idx]!;
}

// ---------------------------------------------------------------------------
// Horizon fit verdict
// ---------------------------------------------------------------------------

export type HorizonFitVerdict = 'appropriate' | 'too_aggressive' | 'too_conservative' | 'unknown';

export interface HorizonFit {
    verdict: HorizonFitVerdict;
    /** Actual risk band of the bucket's holdings. */
    actualBand: RiskBand;
    /** Target risk band given horizon + tolerance. */
    targetBand: RiskBand;
    /** One-sentence plain-language reason suitable for the UI. */
    reason: string;
    /** Fraction of holdings with real vol data (0-1). */
    volCoverage: number;
}

const VERDICT_COLORS: Record<HorizonFitVerdict, string> = {
    appropriate: 'success',
    too_aggressive: 'error',
    too_conservative: 'warning',
    unknown: 'default',
};

export { VERDICT_COLORS };

/**
 * Main function: is this bucket's actual risk profile appropriate for its
 * horizon, given the user's tolerance?
 */
export function horizonFit(
    profile: BucketRiskProfile,
    horizonYears: number,
    riskTolerance: RiskTolerance,
    bucketName?: string
): HorizonFit {
    const target = targetRiskBand(horizonYears, riskTolerance);
    const actual = profile.dominantBand;

    const bandOrder: Record<RiskBand, number> = {
        conservative: 0,
        moderate: 1,
        aggressive: 2,
        unknown: 1,
    };
    const actualIdx = bandOrder[actual];
    const targetIdx = bandOrder[target];

    let verdict: HorizonFitVerdict;
    if (actual === 'unknown') {
        // Not enough volatility data to determine the actual risk band.
        // Return an explicit 'unknown' verdict rather than falsely claiming
        // the bucket is "appropriate." Surfaces as a neutral/informational
        // state in the UI rather than a green checkmark.
        verdict = 'unknown';
    } else if (actualIdx > targetIdx) {
        verdict = 'too_aggressive';
    } else if (actualIdx < targetIdx) {
        verdict = 'too_conservative';
    } else {
        verdict = 'appropriate';
    }

    const bucketLabel = bucketName ?? 'This bucket';
    const horizonLabel = `${horizonYears}-year`;
    const reason = buildReason(
        verdict,
        bucketLabel,
        horizonLabel,
        actual,
        target,
        profile.aggressiveFraction
    );

    return {
        verdict,
        actualBand: actual,
        targetBand: target,
        reason,
        volCoverage: profile.volCoverage,
    };
}

function buildReason(
    verdict: HorizonFitVerdict,
    bucketLabel: string,
    horizonLabel: string,
    actual: RiskBand,
    target: RiskBand,
    aggressiveFraction: number
): string {
    switch (verdict) {
        case 'unknown':
            return `${bucketLabel} doesn't have enough market data yet to assess horizon fit — volatility signals are still loading.`;
        case 'appropriate':
            return `${bucketLabel} holdings align well with its ${horizonLabel} horizon — the ${actual} risk profile fits the timeline.`;
        case 'too_aggressive': {
            const pct = Math.round(aggressiveFraction * 100);
            return `With a ${horizonLabel} horizon, ${bucketLabel} is carrying too much risk — ${pct}% of holdings are high-volatility. Consider shifting toward ${target} positions.`;
        }
        case 'too_conservative':
            return `${bucketLabel} has a ${horizonLabel} horizon, but the ${actual} holdings may leave too much growth on the table. A ${target} mix could work harder over that timeframe.`;
    }
}

// ---------------------------------------------------------------------------
// Drawdown risk statement
// ---------------------------------------------------------------------------

/**
 * Returns an honest drawdown statement for a "too_aggressive" verdict based on
 * the actual risk band. Percentages are historically grounded band-level
 * estimates. When `bucketValue` is supplied, the statement is made concrete
 * with a dollar range derived from those same percentages.
 */
export function drawdownStatement(
    actualBand: RiskBand,
    aggressiveFraction: number,
    bucketValue?: number | null
): string {
    const pct = Math.round(aggressiveFraction * 100);

    // Band-level peak-to-trough drawdown ranges (lo, hi) as fractions.
    let range: [number, number];
    let lead: string;
    if (actualBand === 'aggressive') {
        range = [0.4, 0.55];
        lead = `A 2008-style downturn could cut this bucket`;
    } else if (actualBand === 'moderate' && aggressiveFraction > 0.4) {
        range = [0.25, 0.4];
        lead = `With ${pct}% in high-volatility holdings, a sharp correction could cut this bucket`;
    } else {
        if (bucketValue && bucketValue > 0) {
            return `This bucket carries more risk than its timeline warrants — a market downturn could erode a meaningful slice of its ${formatUsd(bucketValue)} before you withdraw.`;
        }
        return `This bucket carries more risk than its timeline warrants — a market downturn could erode significant value before you withdraw.`;
    }

    const pctLabel = `${Math.round(range[0] * 100)}–${Math.round(range[1] * 100)}%`;
    if (bucketValue && bucketValue > 0) {
        const loDollars = formatUsd(bucketValue * range[0]);
        const hiDollars = formatUsd(bucketValue * range[1]);
        return `${lead} ${pctLabel} — roughly ${loDollars}–${hiDollars} of its ${formatUsd(bucketValue)} — right when you'd need to withdraw.`;
    }
    return `${lead} ${pctLabel} — right when you'd need to withdraw.`;
}

/** Compact USD formatter for plain-language statements. */
function formatUsd(value: number): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(Math.round(value));
}

// ---------------------------------------------------------------------------
// Convenience: full fit for a bucket doc given holdings summary
// ---------------------------------------------------------------------------

export function fitForBucket(
    bucket: PortfolioDoc,
    user: DemoUser,
    holdingInputs: HoldingInput[]
): HorizonFit | null {
    if (!bucket.goal) return null;
    const profile = bucketRiskProfile(holdingInputs);
    return horizonFit(profile, bucket.goal.horizonYears, user.riskTolerance, bucket.goal.purpose);
}
