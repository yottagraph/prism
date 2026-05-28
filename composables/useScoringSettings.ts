import { computed } from 'vue';

import {
    type AcsThresholds,
    type CategoryBands,
    DEFAULT_SCORING_SETTINGS,
    type ErsThresholds,
    type FhsThresholds,
    type ScoringSettings,
    type SourceFusionWeights,
    type TierBands,
} from './useFusedScoring';
import { usePortfolio } from './usePortfolio';

export type PresetId = 'conservative' | 'moderate' | 'aggressive';

interface ScoringPreset {
    id: PresetId;
    label: string;
    description: string;
    settings: ScoringSettings;
}

const PRESETS: ScoringPreset[] = [
    {
        id: 'conservative',
        label: 'Conservative',
        description:
            'Prioritises solvency and compliance. Lower thresholds trigger alerts earlier.',
        settings: {
            weights: {
                solvency: 0.4,
                executive: 0.2,
                news: 0.1,
                market: 0,
                eventPressure: 0.15,
                compliance: 0.15,
            },
            tiers: { critical: 70, high: 55, watch: 40 },
            categoryBands: { high: 60, medium: 35 },
            fhs: {
                leverageHighThreshold: 2.5,
                equityLowThreshold: 0.25,
                currentRatioLowThreshold: 1.2,
                interestCoverageLowThreshold: 2.5,
                stockDeclineThreshold: -8,
                stockVolatilityThreshold: 4,
                tierWeights: { t1: 0.5, t2: 0.2, t3: 0.1, t4: 0.05, t5: 0.15 },
            },
            ers: {
                minOfficers: 4,
                minCSuite: 3,
                departures12mHigh: 1,
                cSuiteCoverageLow: 60,
                leadershipSentimentLow: 0.4,
            },
            acs: {
                directWeight: 0.4,
                pathWeight: 0.25,
                governanceWeight: 0.15,
                jurisdictionWeight: 0.12,
                fociWeight: 0.08,
                ofacExactOverride: 95,
                hopDecay: 0.4,
            },
        },
    },
    {
        id: 'moderate',
        label: 'Moderate',
        description: 'Balanced weights and standard thresholds. The system default.',
        settings: structuredClone(DEFAULT_SCORING_SETTINGS),
    },
    {
        id: 'aggressive',
        label: 'Aggressive',
        description: 'Higher tolerance before flagging risk. Emphasises market and news signals.',
        settings: {
            weights: {
                solvency: 0.25,
                executive: 0.2,
                news: 0.2,
                market: 0.1,
                eventPressure: 0.15,
                compliance: 0.1,
            },
            tiers: { critical: 85, high: 72, watch: 58 },
            categoryBands: { high: 75, medium: 50 },
            fhs: {
                leverageHighThreshold: 4.0,
                equityLowThreshold: 0.15,
                currentRatioLowThreshold: 0.8,
                interestCoverageLowThreshold: 1.5,
                stockDeclineThreshold: -15,
                stockVolatilityThreshold: 7,
                tierWeights: { t1: 0.4, t2: 0.2, t3: 0.15, t4: 0.1, t5: 0.15 },
            },
            ers: {
                minOfficers: 2,
                minCSuite: 1,
                departures12mHigh: 3,
                cSuiteCoverageLow: 40,
                leadershipSentimentLow: 0.2,
            },
            acs: {
                directWeight: 0.3,
                pathWeight: 0.3,
                governanceWeight: 0.15,
                jurisdictionWeight: 0.15,
                fociWeight: 0.1,
                ofacExactOverride: 85,
                hopDecay: 0.6,
            },
        },
    },
];

export type ScoringSection = 'weights' | 'tiers' | 'categoryBands' | 'fhs' | 'ers' | 'acs';

export function useScoringSettings() {
    const { activeScoring, activePortfolio, scanPortfolio } = usePortfolio();

    const scoring = computed({
        get: () => activeScoring.value,
        set: (s: ScoringSettings) => {
            activeScoring.value = s;
        },
    });

    const hasCustom = computed(
        () => JSON.stringify(scoring.value) !== JSON.stringify(DEFAULT_SCORING_SETTINGS)
    );

    const presets = PRESETS;

    function applyPreset(id: PresetId) {
        const preset = PRESETS.find((p) => p.id === id);
        if (!preset) return;
        scoring.value = structuredClone(preset.settings);
    }

    function setWeights(w: SourceFusionWeights) {
        scoring.value = { ...scoring.value, weights: w };
    }

    function setTiers(t: TierBands) {
        scoring.value = { ...scoring.value, tiers: t };
    }

    function setCategoryBands(c: CategoryBands) {
        scoring.value = { ...scoring.value, categoryBands: c };
    }

    function setFhs(f: FhsThresholds) {
        scoring.value = { ...scoring.value, fhs: f };
    }

    function setErs(e: ErsThresholds) {
        scoring.value = { ...scoring.value, ers: e };
    }

    function setAcs(a: AcsThresholds) {
        scoring.value = { ...scoring.value, acs: a };
    }

    function resetSection(section: ScoringSection) {
        scoring.value = {
            ...scoring.value,
            [section]: structuredClone(DEFAULT_SCORING_SETTINGS[section]),
        };
    }

    function resetAll() {
        scoring.value = structuredClone(DEFAULT_SCORING_SETTINGS);
    }

    async function rescan() {
        const portfolio = activePortfolio.value;
        if (portfolio) await scanPortfolio(portfolio.id, { force: true });
    }

    return {
        scoring,
        hasCustom,
        presets,
        applyPreset,
        setWeights,
        setTiers,
        setCategoryBands,
        setFhs,
        setErs,
        setAcs,
        resetSection,
        resetAll,
        rescan,
    };
}
