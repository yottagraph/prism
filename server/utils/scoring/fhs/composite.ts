import { clampScore } from '../hash';
import type { LensDetail } from '../types';
import type { FhsCompositeResult, FhsTierResult } from './types';

const REDISTRIBUTION_SCENARIOS: Array<{
    when: (tiers: FhsTierResult[]) => boolean;
    weights: Record<1 | 2 | 3 | 4 | 5, number>;
}> = [
    {
        when: (tiers) => {
            const hasTier1 = tiers.some((tier) => tier.tier === 1 && tier.hasData);
            const hasTier5 = tiers.some((tier) => tier.tier === 5 && tier.hasData);
            return !hasTier1 && hasTier5;
        },
        weights: { 1: 0, 2: 0.3, 3: 0.15, 4: 0.1, 5: 0.45 },
    },
    {
        when: (tiers) => {
            const hasTier1 = tiers.some((tier) => tier.tier === 1 && tier.hasData);
            const hasTier5 = tiers.some((tier) => tier.tier === 5 && tier.hasData);
            const hasTier2 = tiers.some((tier) => tier.tier === 2 && tier.hasData);
            return !hasTier1 && !hasTier5 && hasTier2;
        },
        weights: { 1: 0, 2: 0.5, 3: 0.35, 4: 0.15, 5: 0 },
    },
    {
        when: (tiers) => {
            const hasTier1 = tiers.some((tier) => tier.tier === 1 && tier.hasData);
            const hasTier2 = tiers.some((tier) => tier.tier === 2 && tier.hasData);
            const hasTier3 = tiers.some((tier) => tier.tier === 3 && tier.hasData);
            const hasTier5 = tiers.some((tier) => tier.tier === 5 && tier.hasData);
            return !hasTier1 && !hasTier2 && hasTier3 && !hasTier5;
        },
        weights: { 1: 0, 2: 0, 3: 0.7, 4: 0.3, 5: 0 },
    },
];

const DEFAULT_WEIGHTS: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0.45,
    2: 0.2,
    3: 0.12,
    4: 0.08,
    5: 0.15,
};

function normaliseWeights(tiers: FhsTierResult[], base: Record<1 | 2 | 3 | 4 | 5, number>) {
    const available = tiers.filter((tier) => tier.hasData);
    const sum = available.reduce((acc, tier) => acc + base[tier.tier], 0);
    if (sum <= 0) return base;
    const out = { ...base };
    available.forEach((tier) => {
        out[tier.tier] = base[tier.tier] / sum;
    });
    return out;
}

function computeConfidence(
    tiers: FhsTierResult[],
    stalenessDays: number | null
): {
    confidence: number;
    confidenceLevel: 'High' | 'Medium' | 'Low';
} {
    const dataTierScore = tiers.some((tier) => tier.tier === 1 && tier.hasData)
        ? 100
        : tiers.some((tier) => tier.tier === 5 && tier.hasData)
          ? 70
          : tiers.some((tier) => tier.tier === 2 && tier.hasData)
            ? 75
            : 50;
    const signalCount = tiers.reduce((sum, tier) => sum + tier.signalCount, 0);
    const signalScore = signalCount >= 5 ? 100 : signalCount >= 3 ? 75 : signalCount >= 1 ? 50 : 25;
    const freshnessScore =
        stalenessDays == null
            ? 40
            : stalenessDays <= 30
              ? 100
              : stalenessDays <= 90
                ? 80
                : stalenessDays <= 180
                  ? 60
                  : stalenessDays <= 365
                    ? 40
                    : 20;
    const certaintyScore =
        signalCount > 0
            ? Math.round(
                  (tiers.reduce(
                      (sum, tier) =>
                          sum +
                          tier.signals.filter(
                              (signal) =>
                                  signal.severity === 'critical' || signal.severity === 'high'
                          ).length,
                      0
                  ) /
                      signalCount) *
                      100
              )
            : 25;
    const verificationScore = signalCount > 0 ? 80 : 30;
    const confidence = clampScore(
        dataTierScore * 0.3 +
            signalScore * 0.25 +
            freshnessScore * 0.2 +
            certaintyScore * 0.15 +
            verificationScore * 0.1
    );
    return {
        confidence,
        confidenceLevel: confidence >= 75 ? 'High' : confidence >= 50 ? 'Medium' : 'Low',
    };
}

function stalenessLevel(stalenessDays: number | null): FhsCompositeResult['stalenessLevel'] {
    if (stalenessDays == null) return 'unknown';
    if (stalenessDays <= 180) return 'fresh';
    if (stalenessDays <= 365) return 'aging';
    if (stalenessDays <= 730) return 'stale';
    return 'very_stale';
}

function classifyRisk(score: number): FhsCompositeResult['riskLevel'] {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
}

export function computeFhsComposite(
    tiers: FhsTierResult[],
    options: {
        freshestFilingDays: number | null;
        leverageLatest: number | null;
        leveragePrevious: number | null;
    },
    customTierWeights?: { t1: number; t2: number; t3: number; t4: number; t5: number }
): FhsCompositeResult {
    const userWeights: Record<1 | 2 | 3 | 4 | 5, number> | undefined = customTierWeights
        ? {
              1: customTierWeights.t1,
              2: customTierWeights.t2,
              3: customTierWeights.t3,
              4: customTierWeights.t4,
              5: customTierWeights.t5,
          }
        : undefined;
    const scenario = REDISTRIBUTION_SCENARIOS.find((candidate) => candidate.when(tiers));
    const baseWeights = scenario?.weights ?? (userWeights || DEFAULT_WEIGHTS);
    const weights = normaliseWeights(tiers, baseWeights);

    const available = tiers.filter((tier) => tier.hasData && tier.score != null);
    const fused = available.reduce(
        (sum, tier) => sum + (tier.score ?? 0) * (weights[tier.tier] || 0),
        0
    );
    let score = clampScore(fused);

    const stalenessMultiplier =
        options.freshestFilingDays == null
            ? 1
            : options.freshestFilingDays <= 180
              ? 1
              : options.freshestFilingDays <= 365
                ? 0.85
                : options.freshestFilingDays <= 730
                  ? 0.6
                  : 0.3;
    score = clampScore(score * stalenessMultiplier);

    const leverageDelta =
        options.leverageLatest != null &&
        options.leveragePrevious != null &&
        options.leveragePrevious !== 0
            ? (options.leverageLatest - options.leveragePrevious) /
              Math.abs(options.leveragePrevious)
            : 0;
    let trendDirection: FhsCompositeResult['trendDirection'] = 'stable';
    if (leverageDelta >= 0.25) {
        trendDirection = 'rapid_deterioration';
        score = clampScore(score + 30);
    } else if (leverageDelta >= 0.1) {
        trendDirection = 'deteriorating';
        score = clampScore(score + 15);
    } else if (leverageDelta <= -0.1) {
        trendDirection = 'improving';
        score = clampScore(score - 10);
    }

    const eventTier = tiers.find((tier) => tier.tier === 2);
    const clusterEvents =
        eventTier?.signals.filter((signal) => {
            const text = signal.description.toLowerCase();
            return (
                text.includes('bankruptcy') ||
                text.includes('departure') ||
                text.includes('auditor') ||
                text.includes('governance') ||
                text.includes('restructuring')
            );
        }).length ?? 0;
    if (clusterEvents >= 5) score = clampScore(score + 40);
    else if (clusterEvents >= 3) score = clampScore(score + 25);

    if (tiers.some((tier) => tier.signals.some((signal) => signal.severity === 'critical'))) {
        score = Math.max(score, 75);
    }

    const { confidence, confidenceLevel } = computeConfidence(tiers, options.freshestFilingDays);
    const detail: LensDetail = {
        metrics: available.flatMap((tier) => tier.metrics).slice(0, 12),
        findings: available.flatMap((tier) => tier.findings).slice(0, 10),
    };

    return {
        score,
        riskLevel: classifyRisk(score),
        confidence,
        confidenceLevel,
        trendDirection,
        stalenessDays: options.freshestFilingDays,
        stalenessLevel: stalenessLevel(options.freshestFilingDays),
        tierBreakdown: tiers.map((tier) => ({
            ...tier,
            weight: weights[tier.tier] || 0,
        })),
        detail,
        hasRealData: available.length > 0,
    };
}
