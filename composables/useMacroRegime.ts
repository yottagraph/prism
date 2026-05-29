/**
 * useMacroRegime — portfolio-aware macro regime synthesis.
 *
 * Combines FRED fundamentals + Polymarket forward probabilities to derive a
 * regime label, then crosses that regime against the active portfolio's sector
 * tilt to produce a plain-language portfolio implication.
 */

import { computed } from 'vue';
import { useFredMacroContext, useMacroContext } from './useRelationships';
import { usePortfolio } from './usePortfolio';
import { computeSectorTilt, type SectorTilt } from '~/utils/macro/sectorFactors';

export type RegimeLabel =
    | 'Easing · Expansion'
    | 'Easing · Contraction risk'
    | 'Tightening · Expansion'
    | 'Tightening · Contraction risk'
    | 'Neutral · Expansion'
    | 'Neutral · Contraction risk'
    | 'Neutral';

export type RegimeColor = 'success' | 'warning' | 'error' | 'default';

export interface MacroRegime {
    label: RegimeLabel | string;
    color: RegimeColor;
    /** One-sentence synthesis of the macro regime. */
    synthesis: string;
    /** Sector tilt of the active portfolio (sorted by count desc). */
    sectorTilt: SectorTilt[];
    /** Plain-language implication for the specific portfolio. */
    portfolioImplication: string;
    /** True when at least one macro data source has loaded. */
    ready: boolean;
}

function findSignal(
    signals: ReturnType<typeof useFredMacroContext>['signals']['value'],
    labelFragment: string
) {
    return signals.find((s) => s.label.toLowerCase().includes(labelFragment.toLowerCase()));
}

function formatPct(value: number): string {
    return `${Math.round(value)}%`;
}

export function useMacroRegime(): { regime: ReturnType<typeof computed<MacroRegime>> } {
    const { signals: fredSignals } = useFredMacroContext({ autoRefresh: false });
    const { signals: polySignals } = useMacroContext({ autoRefresh: false });
    const { activePortfolio: active } = usePortfolio();

    const regime = computed<MacroRegime>(() => {
        const fred = fredSignals.value;
        const poly = polySignals.value;

        const ready = fred.length > 0 || poly.length > 0;

        // --- Derive key indicators ---
        const recessionSignal = findSignal(poly, 'recession');
        const fedCutSignal = findSignal(poly, 'fed rate cut');
        const inflationSignal = findSignal(poly, 'inflation');
        const marketDirSignal = findSignal(poly, 'market direction');
        const gdpPolySignal = findSignal(poly, 'gdp');
        const unrateSignal = findSignal(fred, 'unemployment');
        const yieldSpreadSignal = findSignal(fred, 'yield spread');
        const dffSignal = findSignal(fred, 'fed funds');

        const recessionOdds = recessionSignal?.value ?? null;
        const fedCutOdds = fedCutSignal?.value ?? null;
        const inflationHigh = inflationSignal?.value ?? null;
        const marketUp = marketDirSignal?.value ?? null;

        // --- Classify rate regime ---
        // fed cut odds > 60 → easing expected; dff trend rising → tightening
        const easingExpected = fedCutOdds != null && fedCutOdds > 55;
        const tighteningSignal =
            dffSignal != null &&
            dffSignal.trend === 'up' &&
            (fedCutOdds == null || fedCutOdds < 45);
        const rateRegime: 'easing' | 'tightening' | 'neutral' = easingExpected
            ? 'easing'
            : tighteningSignal
              ? 'tightening'
              : 'neutral';

        // --- Classify growth regime ---
        const contraction =
            (recessionOdds != null && recessionOdds > 40) ||
            (unrateSignal != null &&
                unrateSignal.macroScore != null &&
                unrateSignal.macroScore < 0);
        const growthRegime: 'expansion' | 'contraction' = contraction ? 'contraction' : 'expansion';

        // --- Regime label ---
        let label: string;
        let color: RegimeColor;
        if (rateRegime === 'easing' && growthRegime === 'expansion') {
            label = 'Easing · Expansion';
            color = 'success';
        } else if (rateRegime === 'easing' && growthRegime === 'contraction') {
            label = 'Easing · Contraction risk';
            color = 'warning';
        } else if (rateRegime === 'tightening' && growthRegime === 'expansion') {
            label = 'Tightening · Expansion';
            color = 'warning';
        } else if (rateRegime === 'tightening' && growthRegime === 'contraction') {
            label = 'Tightening · Contraction risk';
            color = 'error';
        } else if (growthRegime === 'contraction') {
            label = 'Neutral · Contraction risk';
            color = 'warning';
        } else if (growthRegime === 'expansion') {
            label = 'Neutral · Expansion';
            color = 'success';
        } else {
            label = 'Neutral';
            color = 'default';
        }

        // --- Synthesis sentence ---
        const parts: string[] = [];
        if (recessionOdds != null) parts.push(`Recession odds ${formatPct(recessionOdds)}`);
        if (fedCutOdds != null) parts.push(`Fed cut probability ${formatPct(fedCutOdds)}`);
        if (inflationHigh != null)
            parts.push(`Elevated inflation odds ${formatPct(inflationHigh)}`);
        if (yieldSpreadSignal?.displayValue)
            parts.push(`Yield spread ${yieldSpreadSignal.displayValue}`);
        if (marketUp != null) parts.push(`Market up ${formatPct(marketUp)}`);
        const synthesis = parts.length > 0 ? parts.join(' · ') + '.' : 'Insufficient macro data.';

        // --- Portfolio sector tilt ---
        const entities = active.value?.entities ?? [];
        const sectors = entities.map((e) => e.monitor?.sector ?? null);
        const sectorTilt = computeSectorTilt(sectors);
        const total = entities.length;

        // --- Portfolio implication ---
        const topBucket = sectorTilt[0];
        let portfolioImplication = '';

        if (!ready || total === 0) {
            portfolioImplication = 'Scan portfolio to see macro alignment.';
        } else if (!topBucket || topBucket.bucket === 'unclassified') {
            portfolioImplication = `${total} entities scanned; re-scan to enrich sector data.`;
        } else {
            const topCount = topBucket.count;
            const topLabel = topBucket.label;
            const topPct = Math.round((topCount / total) * 100);

            if (rateRegime === 'easing' && topBucket.bucket === 'rate_sensitive') {
                portfolioImplication = `${topCount} of ${total} entities (${topPct}%) are rate-sensitive — easing expected is a tailwind for this tilt.`;
            } else if (rateRegime === 'tightening' && topBucket.bucket === 'rate_sensitive') {
                portfolioImplication = `${topCount} of ${total} entities (${topPct}%) are rate-sensitive — elevated rates are a headwind for this tilt.`;
            } else if (rateRegime === 'easing' && topBucket.bucket === 'growth_tech') {
                portfolioImplication = `${topCount} of ${total} entities (${topPct}%) are growth/tech — rate cuts reduce discount rates, favorable for this tilt.`;
            } else if (rateRegime === 'tightening' && topBucket.bucket === 'growth_tech') {
                portfolioImplication = `${topCount} of ${total} entities (${topPct}%) are growth/tech — rising rates compress valuations for long-duration names.`;
            } else if (growthRegime === 'contraction' && topBucket.bucket === 'cyclical') {
                portfolioImplication = `${topCount} of ${total} entities (${topPct}%) are cyclical — contraction risk is elevated, cyclical names are most exposed.`;
            } else if (growthRegime === 'contraction' && topBucket.bucket === 'defensive') {
                portfolioImplication = `${topCount} of ${total} entities (${topPct}%) are defensive — contraction signals favor this positioning.`;
            } else if (growthRegime === 'expansion' && topBucket.bucket === 'cyclical') {
                portfolioImplication = `${topCount} of ${total} entities (${topPct}%) are cyclical — expansion regime supports this tilt.`;
            } else if (topBucket.bucket === 'energy') {
                const inflationCtx =
                    inflationHigh != null && inflationHigh > 40
                        ? 'elevated inflation odds support energy names'
                        : 'macro regime impact on energy is mixed';
                portfolioImplication = `${topCount} of ${total} entities (${topPct}%) are energy — ${inflationCtx}.`;
            } else {
                portfolioImplication = `Portfolio led by ${topLabel} (${topCount} of ${total}, ${topPct}%) — regime is ${label.toLowerCase()}.`;
            }
        }

        return { label, color, synthesis, sectorTilt, portfolioImplication, ready };
    });

    return { regime };
}
