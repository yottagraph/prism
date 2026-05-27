import { clampScore } from './hash';
import type {
    CoreLensKey,
    EntityRiskScore,
    LensDetail,
    LensKey,
    RiskDriver,
    RiskTier,
    SourceFusionWeights,
    SubScores,
} from './types';

export const DEFAULT_WEIGHTS: SourceFusionWeights = {
    solvency: 0.35,
    executive: 0.25,
    news: 0.15,
    market: 0,
    eventPressure: 0.25,
};

export const DEFAULT_WEIGHTS_WITH_ACS: SourceFusionWeights = {
    solvency: 0.3,
    executive: 0.2,
    news: 0.15,
    market: 0,
    eventPressure: 0.2,
    compliance: 0.15,
};

export function fuseScore(s: SubScores, w: SourceFusionWeights = DEFAULT_WEIGHTS): number {
    const sum =
        w.solvency +
            w.executive +
            w.news +
            w.market +
            (w.eventPressure ?? 0) +
            (w.compliance ?? 0) || 1;
    return clampScore(
        (s.solvency * w.solvency +
            s.executive * w.executive +
            s.news * w.news +
            s.market * w.market +
            (s.eventPressure ?? 0) * (w.eventPressure ?? 0) +
            (s.compliance ?? 0) * (w.compliance ?? 0)) /
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
): Array<{ lens: CoreLensKey; delta: number }> {
    const mean = (s.solvency + s.executive + s.news + s.market) / 4;
    const lenses: CoreLensKey[] = ['solvency', 'executive', 'news', 'market'];
    const out: Array<{ lens: CoreLensKey; delta: number }> = [];
    lenses.forEach((k) => {
        const delta = s[k] - mean;
        if (Math.abs(delta) >= threshold) out.push({ lens: k, delta: Math.round(delta) });
    });
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

const LENS_SOURCE: Record<LensKey, RiskDriver['source']> = {
    solvency: 'SEC',
    executive: 'SEC',
    news: 'NEWS',
    market: 'STOCK',
    eventPressure: 'SEC',
    compliance: 'CSL',
};

export function deriveDriversFromLenses(
    details: Partial<Record<LensKey, LensDetail>>,
    s: SubScores
): RiskDriver[] {
    const sorted = (['solvency', 'executive', 'news', 'market'] as CoreLensKey[])
        .map((lens) => ({ lens, score: s[lens] }))
        .sort((a, b) => b.score - a.score);
    const out: RiskDriver[] = [];
    for (const { lens, score } of sorted) {
        const finding = details[lens]?.findings?.[0];
        if (!finding) continue;
        out.push({
            lens,
            source: LENS_SOURCE[lens],
            score,
            finding,
        });
    }
    return out.slice(0, 5);
}

export function makeEntityRiskScore(
    subs: SubScores,
    weights: SourceFusionWeights,
    previousFused?: number
): EntityRiskScore {
    let fused = fuseScore(subs, weights);
    const criticalOverride = Math.max(
        subs.solvency,
        subs.executive,
        subs.news,
        subs.market,
        subs.eventPressure ?? 0,
        subs.compliance ?? 0
    );
    if (criticalOverride >= 75) fused = Math.max(fused, 75);
    return {
        ...subs,
        fused,
        previousFused,
        tier: deriveTier(fused),
        updatedAt: Date.now(),
    };
}
