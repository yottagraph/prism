import { describe, it, expect } from 'vitest';
import {
    fuseScore,
    deriveTier,
    confidence,
    detectConflicts,
    DEFAULT_WEIGHTS,
} from '../server/utils/scoring/fuse';
import { clampScore } from '../server/utils/scoring/hash';
import type { SubScores } from '../server/utils/scoring/types';

function makeScores(overrides: Partial<SubScores> = {}): SubScores {
    return {
        solvency: 50,
        executive: 50,
        news: 50,
        market: 50,
        eventPressure: 50,
        ...overrides,
    };
}

describe('clampScore', () => {
    it('clamps below 0 to 0', () => expect(clampScore(-5)).toBe(0));
    it('clamps above 100 to 100', () => expect(clampScore(105)).toBe(100));
    it('rounds to nearest integer', () => expect(clampScore(42.6)).toBe(43));
    it('passes through mid-range values', () => expect(clampScore(75)).toBe(75));
});

describe('fuseScore', () => {
    it('returns a value between 0 and 100', () => {
        const s = makeScores({
            solvency: 80,
            executive: 60,
            news: 40,
            market: 20,
            eventPressure: 70,
        });
        const result = fuseScore(s, DEFAULT_WEIGHTS);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
    });

    it('weights solvency most heavily with default weights', () => {
        const highSolvency = makeScores({
            solvency: 100,
            executive: 0,
            news: 0,
            market: 0,
            eventPressure: 0,
        });
        const highExecutive = makeScores({
            solvency: 0,
            executive: 100,
            news: 0,
            market: 0,
            eventPressure: 0,
        });
        expect(fuseScore(highSolvency, DEFAULT_WEIGHTS)).toBeGreaterThan(
            fuseScore(highExecutive, DEFAULT_WEIGHTS)
        );
    });

    it('produces consistent result with all-zero scores', () => {
        const s = makeScores({ solvency: 0, executive: 0, news: 0, market: 0, eventPressure: 0 });
        expect(fuseScore(s, DEFAULT_WEIGHTS)).toBe(0);
    });

    it('produces 100 when all scores are 100', () => {
        const s = makeScores({
            solvency: 100,
            executive: 100,
            news: 100,
            market: 100,
            eventPressure: 100,
        });
        expect(fuseScore(s, DEFAULT_WEIGHTS)).toBe(100);
    });

    it('is proportional to custom weights', () => {
        const s = makeScores({ solvency: 100, executive: 0, news: 0, market: 0, eventPressure: 0 });
        const onlySolvency = fuseScore(s, { solvency: 1, executive: 0, news: 0, market: 0 });
        expect(onlySolvency).toBe(100);
    });
});

describe('deriveTier', () => {
    it('returns critical for scores at or above 80 (default)', () => {
        expect(deriveTier(80)).toBe('critical');
        expect(deriveTier(95)).toBe('critical');
    });

    it('returns high for scores between 65 and 79', () => {
        expect(deriveTier(65)).toBe('high');
        expect(deriveTier(79)).toBe('high');
    });

    it('returns medium for scores between 50 and 64', () => {
        expect(deriveTier(50)).toBe('medium');
        expect(deriveTier(64)).toBe('medium');
    });

    it('returns low for scores below 50', () => {
        expect(deriveTier(0)).toBe('low');
        expect(deriveTier(49)).toBe('low');
    });

    it('respects custom tier bands', () => {
        const tiers = { critical: 90, high: 70, medium: 40 };
        expect(deriveTier(85, tiers)).toBe('high');
        expect(deriveTier(91, tiers)).toBe('critical');
        expect(deriveTier(35, tiers)).toBe('low');
    });
});

describe('confidence', () => {
    it('returns High when all scores are equal (no variance)', () => {
        const s = makeScores({ solvency: 50, executive: 50, news: 50, market: 50 });
        expect(confidence(s)).toBe('High');
    });

    it('returns Low when scores are maximally spread', () => {
        const s = makeScores({ solvency: 100, executive: 0, news: 100, market: 0 });
        expect(confidence(s)).toBe('Low');
    });
});

describe('detectConflicts', () => {
    it('returns empty array when all scores are near the mean', () => {
        const s = makeScores({ solvency: 50, executive: 52, news: 48, market: 50 });
        expect(detectConflicts(s)).toHaveLength(0);
    });

    it('flags lenses that deviate beyond the threshold', () => {
        const s = makeScores({ solvency: 90, executive: 50, news: 50, market: 50 });
        const conflicts = detectConflicts(s);
        expect(conflicts.some((c) => c.lens === 'solvency')).toBe(true);
    });

    it('sorts conflicts by absolute delta descending', () => {
        const s = makeScores({ solvency: 100, executive: 0, news: 50, market: 50 });
        const conflicts = detectConflicts(s);
        expect(Math.abs(conflicts[0].delta)).toBeGreaterThanOrEqual(
            Math.abs(conflicts[1]?.delta ?? 0)
        );
    });
});
