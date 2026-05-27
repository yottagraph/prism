/**
 * Multi-source fused scoring.
 *
 * Each entity carries four per-lens scores (solvency / executive / news /
 * market) plus a fused composite, all computed from Elemental-backed inputs.
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
    previousFused?: number;
}

export interface SourceFusionWeights {
    solvency: number;
    executive: number;
    news: number;
    market: number;
}

export interface CitationRef {
    ref?: string;
    url?: string;
    title?: string;
    source?: string;
    date?: string;
    snippet?: string;
}

export interface EvidenceItem {
    text: string;
    date?: string;
    citations: CitationRef[];
}

export const DEFAULT_WEIGHTS: SourceFusionWeights = {
    solvency: 0.4,
    executive: 0.25,
    news: 0.2,
    market: 0.15,
};

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
    (['solvency', 'executive', 'news', 'market'] as Array<keyof SubScores>).forEach((k) => {
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
    finding: EvidenceItem;
}
