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
    /** Modal risk band. */
    dominantBand: RiskBand;
    /** Share of holdings (0-1) in aggressive bucket. */
    aggressiveFraction: number;
    /** Share of holdings (0-1) using real-vol data. */
    volCoverage: number;
}

export interface HoldingInput {
    annualizedVolPct?: number | null;
    sectorBucket?: MacroFactorBucket | null;
}

export function bucketRiskProfile(holdings: HoldingInput[]): BucketRiskProfile {
    if (holdings.length === 0) {
        return { avgScore: 50, dominantBand: 'unknown', aggressiveFraction: 0, volCoverage: 0 };
    }

    const risks = holdings.map((h) => holdingRiskBand(h.annualizedVolPct, h.sectorBucket));
    const avgScore = Math.round(risks.reduce((s, r) => s + r.score, 0) / risks.length);
    const aggressiveFraction = risks.filter((r) => r.band === 'aggressive').length / risks.length;
    const volCoverage = risks.filter((r) => r.source === 'vol').length / risks.length;

    const bandCount: Record<RiskBand, number> = {
        conservative: 0,
        moderate: 0,
        aggressive: 0,
        unknown: 0,
    };
    risks.forEach((r) => bandCount[r.band]++);
    const dominantBand = Object.entries(bandCount).sort(([, a], [, b]) => b - a)[0]![0] as RiskBand;

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

export type HorizonFitVerdict = 'appropriate' | 'too_aggressive' | 'too_conservative';

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
        verdict = 'appropriate';
    } else if (actualIdx > targetIdx) {
        verdict = 'too_aggressive';
    } else if (actualIdx < targetIdx) {
        verdict = 'too_conservative';
    } else {
        verdict = 'appropriate';
    }

    const bucketLabel = bucketName ?? 'This bucket';
    const horizonLabel =
        horizonYears <= 3
            ? `${horizonYears}-year`
            : horizonYears <= 10
              ? `${horizonYears}-year`
              : `${horizonYears}-year`;
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
        case 'appropriate':
            return `${bucketLabel} holdings align well with its ${horizonLabel} horizon — the ${actual} risk profile is a good fit.`;
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
 * Returns an honest qualitative drawdown statement for a "too_aggressive"
 * verdict based on the actual risk band. No fabricated dollar figures —
 * percentages are historically grounded band-level estimates.
 */
export function drawdownStatement(actualBand: RiskBand, aggressiveFraction: number): string {
    const pct = Math.round(aggressiveFraction * 100);
    if (actualBand === 'aggressive') {
        return `A 2008-style downturn could cut this bucket 40–55% — right when you'd need to withdraw.`;
    }
    if (actualBand === 'moderate' && aggressiveFraction > 0.4) {
        return `With ${pct}% in high-volatility holdings, a sharp correction could cut this bucket 25–40% before your target date.`;
    }
    return `This bucket carries more risk than its timeline warrants — a market downturn could erode significant value before you withdraw.`;
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
