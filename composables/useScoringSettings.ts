import { computed } from 'vue';

import {
    type AcsThresholds,
    type CategoryBands,
    DEFAULT_SCORING_SETTINGS,
    type ErsThresholds,
    type EventPressureSettings,
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
            tiers: { critical: 70, high: 55, medium: 40 },
            categoryBands: { high: 60, medium: 35 },
            fhs: {
                leverageHighThreshold: 2.5,
                equityLowThreshold: 0.25,
                currentRatioLowThreshold: 1.2,
                interestCoverageLowThreshold: 2.5,
                stockDeclineThreshold: -8,
                stockVolatilityThreshold: 4,
                tierWeights: { t1: 0.5, t2: 0.2, t3: 0.1, t4: 0.05, t5: 0.15 },
                distressEvents: {
                    bankruptcy: { baseScore: 100, weight: 3.5 },
                    delisting: { baseScore: 95, weight: 3.0 },
                    nonReliance: { baseScore: 90, weight: 2.5 },
                    triggering: { baseScore: 80, weight: 2.0 },
                    impairment: { baseScore: 70, weight: 1.5 },
                    termination: { baseScore: 60, weight: 1.5 },
                    recencyWindowDays: 1095,
                },
            },
            ers: {
                minOfficers: 4,
                minCSuite: 3,
                departures12mHigh: 1,
                cSuiteCoverageLow: 60,
                leadershipSentimentLow: 0.4,
                signal8: { baseScore: 12, cSuitePremium: 1.6, cap: 60 },
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
            events: {
                baseOffset: 25,
                defaultWeight: 8,
                typeWeights: {
                    bankruptcy: 'critical',
                    delisting: 'critical',
                    default: 'critical',
                    auditor: 'critical',
                    restructuring: 'major',
                    officer: 'major',
                    director: 'major',
                    impairment: 'major',
                },
                recency: {
                    daysFresh: 14,
                    multFresh: 1.0,
                    daysRecent: 30,
                    multRecent: 0.9,
                    daysModerate: 90,
                    multModerate: 0.7,
                    multStale: 0.45,
                    multNoDate: 0.6,
                },
                cluster: {
                    windowDays: 21,
                    countHigh: 4,
                    bonusHigh: 50,
                    countMedium: 2,
                    bonusMedium: 30,
                },
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
            tiers: { critical: 85, high: 72, medium: 58 },
            categoryBands: { high: 75, medium: 50 },
            fhs: {
                leverageHighThreshold: 4.0,
                equityLowThreshold: 0.15,
                currentRatioLowThreshold: 0.8,
                interestCoverageLowThreshold: 1.5,
                stockDeclineThreshold: -15,
                stockVolatilityThreshold: 7,
                tierWeights: { t1: 0.4, t2: 0.2, t3: 0.15, t4: 0.1, t5: 0.15 },
                distressEvents: {
                    bankruptcy: { baseScore: 90, weight: 2.5 },
                    delisting: { baseScore: 80, weight: 2.0 },
                    nonReliance: { baseScore: 75, weight: 1.5 },
                    triggering: { baseScore: 60, weight: 1.0 },
                    impairment: { baseScore: 50, weight: 0.8 },
                    termination: { baseScore: 40, weight: 0.8 },
                    recencyWindowDays: 365,
                },
            },
            ers: {
                minOfficers: 2,
                minCSuite: 1,
                departures12mHigh: 3,
                cSuiteCoverageLow: 40,
                leadershipSentimentLow: 0.2,
                signal8: { baseScore: 8, cSuitePremium: 1.2, cap: 40 },
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
            events: {
                baseOffset: 15,
                defaultWeight: 4,
                typeWeights: {
                    bankruptcy: 'major',
                    delisting: 'major',
                    default: 'minor',
                    auditor: 'minor',
                    restructuring: 'minor',
                    officer: 'trivial',
                    director: 'trivial',
                    impairment: 'trivial',
                },
                recency: {
                    daysFresh: 14,
                    multFresh: 1.0,
                    daysRecent: 30,
                    multRecent: 0.8,
                    daysModerate: 90,
                    multModerate: 0.5,
                    multStale: 0.25,
                    multNoDate: 0.4,
                },
                cluster: {
                    windowDays: 10,
                    countHigh: 7,
                    bonusHigh: 30,
                    countMedium: 4,
                    bonusMedium: 15,
                },
            },
        },
    },
];

/**
 * Mandate presets — the interactive composability proof for the Workspace.
 *
 * Each mandate maps a Solution Pack to a concrete policy over the SAME analytical
 * modules (FHS/ERS/ACS/event pressure). Switching the mandate re-runs the same
 * engine under different weights and thresholds — "same module, different policy",
 * made tangible. Retail goals are included to show the engine spans audiences.
 */
export type MandateId = 'edd' | 'kyc' | 'portfolio-risk' | 'retail';

export interface MandatePreset {
    id: MandateId;
    /** Short UI label. */
    label: string;
    /** Solution Pack name from the demo doc. */
    pack: string;
    /** The single question the agents answer under this mandate. */
    question: string;
    /** Modules this mandate leads with, in emphasis order. */
    primaryModules: string[];
    settings: ScoringSettings;
}

function mandateSettings(base: ScoringSettings, weights: SourceFusionWeights): ScoringSettings {
    return { ...structuredClone(base), weights };
}

const CONSERVATIVE_BASE = PRESETS.find((p) => p.id === 'conservative')!.settings;
const MODERATE_BASE = PRESETS.find((p) => p.id === 'moderate')!.settings;

export const MANDATE_PRESETS: MandatePreset[] = [
    {
        id: 'edd',
        label: 'EDD — Diligence',
        pack: 'Enhanced Due Diligence',
        question: 'What is the complete risk picture for each counterparty under review?',
        primaryModules: ['FHS', 'ERS', 'ACS'],
        settings: mandateSettings(CONSERVATIVE_BASE, {
            solvency: 0.3,
            executive: 0.25,
            news: 0.1,
            market: 0,
            eventPressure: 0.15,
            compliance: 0.2,
        }),
    },
    {
        id: 'kyc',
        label: 'KYC — Compliance',
        pack: 'Know Your Customer',
        question: 'Has this customer\u2019s ownership or sanctions exposure changed?',
        primaryModules: ['ACS', 'ERS'],
        settings: mandateSettings(CONSERVATIVE_BASE, {
            solvency: 0.05,
            executive: 0.25,
            news: 0.15,
            market: 0,
            eventPressure: 0.15,
            compliance: 0.4,
        }),
    },
    {
        id: 'portfolio-risk',
        label: 'Portfolio Risk — Credit',
        pack: 'Portfolio Risk Monitoring',
        question: 'Where is deterioration occurring across the book, and how does it correlate?',
        primaryModules: ['FHS', 'SCR', 'ERS'],
        settings: mandateSettings(MODERATE_BASE, {
            solvency: 0.45,
            executive: 0.1,
            news: 0.15,
            market: 0.1,
            eventPressure: 0.2,
            compliance: 0,
        }),
    },
    {
        id: 'retail',
        label: 'Retail — Goals',
        pack: 'Private Wealth',
        question: 'Is each holding healthy for the goal it backs? (same engine, retail mandate)',
        primaryModules: ['FHS', 'ERS'],
        settings: structuredClone(MODERATE_BASE),
    },
];

export type ScoringSection =
    | 'weights'
    | 'tiers'
    | 'categoryBands'
    | 'fhs'
    | 'ers'
    | 'acs'
    | 'events';

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

    function applyMandate(id: MandateId) {
        const mandate = MANDATE_PRESETS.find((m) => m.id === id);
        if (!mandate) return;
        scoring.value = structuredClone(mandate.settings);
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

    function setFhs(f: ScoringSettings['fhs']) {
        scoring.value = { ...scoring.value, fhs: f };
    }

    function setErs(e: ScoringSettings['ers']) {
        scoring.value = { ...scoring.value, ers: e };
    }

    function setAcs(a: AcsThresholds) {
        scoring.value = { ...scoring.value, acs: a };
    }

    function setEvents(e: EventPressureSettings) {
        scoring.value = { ...scoring.value, events: e };
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
        mandatePresets: MANDATE_PRESETS,
        applyPreset,
        applyMandate,
        setWeights,
        setTiers,
        setCategoryBands,
        setFhs,
        setErs,
        setAcs,
        setEvents,
        resetSection,
        resetAll,
        rescan,
    };
}
