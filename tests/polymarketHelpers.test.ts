import { describe, it, expect } from 'vitest';
import {
    deriveTrend,
    computeMacroScore,
    safeParseJsonArray,
    pickFirstMatchingResult,
    pickMarket,
} from '../server/utils/macro/polymarketHelpers';
import type {
    WebSearchResult,
    MarketSummary,
    IndicatorConfig,
} from '../server/utils/macro/polymarketHelpers';

const baseConfig: IndicatorConfig = {
    label: 'Test',
    searchQueries: [],
    slugIncludes: 'test-slug',
    scoreDirection: 'neutral',
};

describe('deriveTrend', () => {
    it('returns up when probability > 0.6', () => expect(deriveTrend(0.7)).toBe('up'));
    it('returns down when probability < 0.4', () => expect(deriveTrend(0.3)).toBe('down'));
    it('returns flat for probability in [0.4, 0.6]', () => {
        expect(deriveTrend(0.5)).toBe('flat');
        expect(deriveTrend(0.4)).toBe('flat');
        expect(deriveTrend(0.6)).toBe('flat');
    });
});

describe('computeMacroScore', () => {
    it('returns 0 for neutral direction', () => {
        expect(computeMacroScore(0.8, 'neutral')).toBe(0);
    });

    it('returns positive for higher_is_better above 0.5', () => {
        const score = computeMacroScore(0.75, 'higher_is_better');
        expect(score).toBeGreaterThan(0);
    });

    it('returns negative for lower_is_better above 0.5', () => {
        const score = computeMacroScore(0.75, 'lower_is_better');
        expect(score).toBeLessThan(0);
    });

    it('is symmetric around 0.5', () => {
        const above = computeMacroScore(0.75, 'higher_is_better');
        const below = computeMacroScore(0.25, 'higher_is_better');
        expect(above).toBeCloseTo(-below, 5);
    });

    it('clamps at ±1', () => {
        expect(computeMacroScore(1, 'higher_is_better')).toBeLessThanOrEqual(1);
        expect(computeMacroScore(0, 'lower_is_better')).toBeLessThanOrEqual(1);
    });
});

describe('safeParseJsonArray', () => {
    it('parses a valid JSON array', () => {
        expect(safeParseJsonArray('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('returns empty array for invalid JSON', () => {
        expect(safeParseJsonArray('not-json')).toEqual([]);
    });

    it('returns empty array for non-array JSON', () => {
        expect(safeParseJsonArray('{"key":"val"}')).toEqual([]);
    });

    it('returns empty array for undefined', () => {
        expect(safeParseJsonArray(undefined)).toEqual([]);
    });
});

describe('pickFirstMatchingResult', () => {
    const results: WebSearchResult[] = [
        { title: 'Competitive', slug: 'competitive-btc' },
        { title: 'Recession', slug: 'us-recession-by-end-of-2026' },
        { title: 'Other', slug: 'test-slug-market' },
    ];

    it('skips entries titled "competitive"', () => {
        const config: IndicatorConfig = { ...baseConfig, slugIncludes: 'competitive-btc' };
        const result = pickFirstMatchingResult(results, config);
        expect(result?.slug).not.toBe('competitive-btc');
    });

    it('matches by slugIncludes', () => {
        const config: IndicatorConfig = { ...baseConfig, slugIncludes: 'us-recession' };
        const result = pickFirstMatchingResult(results, config);
        expect(result?.slug).toBe('us-recession-by-end-of-2026');
    });

    it('respects slugExcludes', () => {
        const config: IndicatorConfig = {
            ...baseConfig,
            slugIncludes: 'test-slug',
            slugExcludes: ['test-slug-market'],
        };
        const result = pickFirstMatchingResult(results, config);
        expect(result).toBeNull();
    });

    it('returns null when no results match', () => {
        const config: IndicatorConfig = { ...baseConfig, slugIncludes: 'nonexistent' };
        expect(pickFirstMatchingResult(results, config)).toBeNull();
    });

    it('skips results with no slug', () => {
        const withEmpty: WebSearchResult[] = [{ title: 'No slug' }, { slug: 'test-slug-ok' }];
        const config: IndicatorConfig = { ...baseConfig, slugIncludes: 'test-slug' };
        const result = pickFirstMatchingResult(withEmpty, config);
        expect(result?.slug).toBe('test-slug-ok');
    });
});

describe('pickMarket', () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();

    it('returns null for empty markets', () => {
        expect(pickMarket([], baseConfig)).toBeNull();
        expect(pickMarket(undefined, baseConfig)).toBeNull();
    });

    it('prefers active open markets', () => {
        const markets: MarketSummary[] = [
            { question: 'Will it?', active: false, closed: true, endDate: recentDate },
            { question: 'Will it now?', active: true, closed: false },
        ];
        const result = pickMarket(markets, baseConfig);
        expect(result?.active).toBe(true);
        expect(result?.closed).toBeFalsy();
    });

    it('falls back to recently-resolved markets', () => {
        const markets: MarketSummary[] = [
            { question: 'Resolved recently', active: false, closed: true, endDate: recentDate },
        ];
        expect(pickMarket(markets, baseConfig)).not.toBeNull();
    });

    it('excludes markets resolved longer than 90 days ago', () => {
        const markets: MarketSummary[] = [
            { question: 'Old market', active: false, closed: true, endDate: oldDate },
        ];
        expect(pickMarket(markets, baseConfig)).toBeNull();
    });

    it('filters by marketIncludes when specified', () => {
        const markets: MarketSummary[] = [
            { question: 'Greater than 2.5% GDP', active: true, closed: false },
            { question: 'Less than 1% GDP', active: true, closed: false },
        ];
        const config: IndicatorConfig = { ...baseConfig, marketIncludes: 'greater than 2.5%' };
        const result = pickMarket(markets, config);
        expect(result?.question?.toLowerCase()).toContain('greater than 2.5%');
    });
});
