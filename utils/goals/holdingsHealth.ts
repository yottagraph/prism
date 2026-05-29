/**
 * Holdings-health rollup for goals-based views.
 *
 * Summarises the fused FHS/ERS/ACS risk picture across a bucket's entities
 * using equal-weighted tier counts from scan-produced scores. Intentionally
 * separate from `riskFit.ts` (which answers "are the holdings appropriate for
 * the goal horizon?"). This answers "what's actually happening inside those
 * holdings right now?"
 */

import type { RiskTier } from '~/composables/useFusedScoring';
import { tierColor, tierLabel } from '~/composables/useFusedScoring';
import type { PortfolioEntity } from '~/composables/usePortfolio';
import type { PortfolioDoc } from '~/composables/usePortfolio';

export { tierColor, tierLabel };

export interface BucketHoldingsHealth {
    /** Total entities in the bucket. */
    total: number;
    /** Entities that have been scanned (scores !== null). */
    scanned: number;
    /** Equal-weighted count per tier. */
    tierCounts: Record<RiskTier, number>;
    /**
     * Worst fused tier across all scanned entities.
     * null when nothing has been scanned yet.
     */
    worstTier: RiskTier | null;
    /** high + critical count — the primary "needs attention" signal. */
    needsAttention: number;
    /** Average fused score across scanned entities (0-100). */
    avgFused: number | null;
    /** Per-lens worst subscores across scanned entities. */
    lensWorst: {
        /** Highest solvency (FHS) score seen. */
        fhs: number | null;
        /** Highest executive (ERS) score seen. */
        ers: number | null;
        /** Highest compliance (ACS) score seen. */
        acs: number | null;
    };
}

const TIER_ORDER: RiskTier[] = ['critical', 'high', 'medium', 'low'];

/**
 * Compute holdings-health rollup for a single bucket's entities.
 * Safe to call before scan — returns `scanned: 0` with zero counts.
 */
export function bucketHoldingsHealth(entities: PortfolioEntity[]): BucketHoldingsHealth {
    const total = entities.length;
    const tierCounts: Record<RiskTier, number> = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
    };

    let scanned = 0;
    let fusedSum = 0;
    let worstIdx = -1;
    let fhsWorst: number | null = null;
    let ersWorst: number | null = null;
    let acsWorst: number | null = null;

    for (const entity of entities) {
        const s = entity.scores;
        if (!s) continue;
        scanned++;
        tierCounts[s.tier]++;
        fusedSum += s.fused;

        const tierIdx = TIER_ORDER.indexOf(s.tier);
        if (tierIdx > worstIdx) worstIdx = tierIdx;

        if (fhsWorst === null || s.solvency > fhsWorst) fhsWorst = s.solvency;
        if (ersWorst === null || s.executive > ersWorst) ersWorst = s.executive;
        if (s.compliance != null && (acsWorst === null || s.compliance > acsWorst))
            acsWorst = s.compliance;
    }

    const worstTier: RiskTier | null = worstIdx >= 0 ? TIER_ORDER[worstIdx]! : null;
    const avgFused = scanned > 0 ? Math.round(fusedSum / scanned) : null;
    const needsAttention = tierCounts.critical + tierCounts.high;

    return {
        total,
        scanned,
        tierCounts,
        worstTier,
        needsAttention,
        avgFused,
        lensWorst: { fhs: fhsWorst, ers: ersWorst, acs: acsWorst },
    };
}

/** Aggregate holdings-health across all buckets for the household hero band. */
export function householdHoldingsHealth(buckets: PortfolioDoc[]): BucketHoldingsHealth {
    const allEntities = buckets.flatMap((b) => b.entities);
    return bucketHoldingsHealth(allEntities);
}
