import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getEntityProfile } from '../server/utils/scoring/profile';

const callMcpToolMock = vi.fn();

vi.mock('../server/utils/scoring/cache', () => ({
    makeCacheKey: vi.fn(() => 'test-cache-key'),
    readScoringCache: vi.fn(async () => null),
    writeScoringCache: vi.fn(async () => undefined),
}));

vi.mock('../server/utils/scoring/citations', () => ({
    resolveRefs: vi.fn(async () => new Map()),
}));

vi.mock('../server/utils/scoring/elemental', () => ({
    findEntities: vi.fn(async () => []),
    getEntityName: vi.fn(async () => 'Test Entity'),
    getSchema: vi.fn(async () => ({ flavors: [], properties: [] })),
    normalizePidMap: vi.fn(() => ({})),
}));

vi.mock('../server/utils/scoring/mcpGateway', () => ({
    callMcpTool: (...args: unknown[]) => callMcpToolMock(...args),
    extractMcpStructuredContent: (value: unknown) => value,
}));

vi.mock('../server/utils/scoring/scoreEntity', () => ({
    scoreEntity: vi.fn(async () => null),
}));

const precomputedScoring = {
    scores: {
        solvency: 10,
        executive: 20,
        news: 30,
        market: 40,
        fused: 35,
        tier: 'low',
        updatedAt: 0,
    },
    monitor: null,
    drivers: [],
    conflicts: [],
    confidenceLevel: 'Low',
    lensDetails: {
        solvency: { metrics: [], findings: [] },
        executive: { metrics: [], findings: [] },
        news: { metrics: [], findings: [] },
        market: { metrics: [], findings: [] },
    },
} as any;

describe('getEntityProfile event ordering and windows', () => {
    beforeEach(() => {
        callMcpToolMock.mockReset();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-02T12:00:00.000Z'));
    });

    it('applies source windows and sorts by parsed event date', async () => {
        callMcpToolMock.mockImplementation(async (_server: string, tool: string) => {
            if (tool === 'elemental_get_entity') {
                return {
                    entity: {
                        flavor: 'company',
                        properties: {
                            ticker_symbol: { value: 'TST' },
                            industry: { value: 'Software' },
                            headquarters: { value: 'Boston' },
                        },
                    },
                };
            }
            if (tool === 'elemental_get_events') {
                return {
                    events: [
                        // Keep: SEC critical + within 1y
                        {
                            name: 'Default event',
                            properties: {
                                category: { value: 'Filing' },
                                description: { value: 'Company defaulted on debt covenant' },
                                date: { value: '2026-05-30' },
                            },
                        },
                        // Keep: NEWS + within 3m
                        {
                            name: 'Media event',
                            properties: {
                                category: { value: 'Media' },
                                description: { value: 'News coverage of product launch' },
                                date: { value: '2026-05-15' },
                            },
                        },
                        // Keep: POLY + within 3m
                        {
                            name: 'Prediction market',
                            properties: {
                                category: { value: 'Prediction_Market' },
                                description: { value: 'Polymarket odds jump after guidance' },
                                date: { value: '2026-04-20' },
                            },
                        },
                        // Keep: STOCK + within 3m
                        {
                            name: 'Stock move',
                            properties: {
                                category: { value: 'Stock Price' },
                                description: { value: 'Stock spikes after earnings' },
                                date: { value: '2026-03-10' },
                            },
                        },
                        // Keep: event_date fallback + SEC critical + within 1y
                        {
                            name: 'Critical enforcement',
                            properties: {
                                category: { value: 'Regulatory' },
                                description: { value: 'Critical enforcement action announced' },
                                event_date: { value: '2026-02-01' },
                            },
                        },
                        // Drop: SEC medium (not critical/high)
                        {
                            name: 'Officer departure',
                            properties: {
                                category: { value: 'Corporate' },
                                description: { value: 'Director departure noted' },
                                date: { value: '2026-05-28' },
                            },
                        },
                        // Drop: NEWS older than 3m
                        {
                            name: 'Old article',
                            properties: {
                                category: { value: 'News' },
                                description: { value: 'Old press item' },
                                date: { value: '2026-01-15' },
                            },
                        },
                        // Drop: STOCK older than 3m
                        {
                            name: 'Old stock move',
                            properties: {
                                category: { value: 'Market' },
                                description: { value: 'Old trading move' },
                                date: { value: '2025-12-20' },
                            },
                        },
                        // Drop: SEC high but older than 1y
                        {
                            name: 'Ancient fraud',
                            properties: {
                                category: { value: 'Filing' },
                                description: { value: 'Fraud allegations from long ago' },
                                date: { value: '2025-05-15' },
                            },
                        },
                        // Drop: invalid date
                        {
                            name: 'Invalid timestamp event',
                            properties: {
                                category: { value: 'News' },
                                description: { value: 'Malformed date input' },
                                date: { value: 'not-a-date' },
                            },
                        },
                    ],
                };
            }
            if (tool === 'elemental_get_related') {
                return { relationships: [] };
            }
            return {};
        });

        const profile = await getEntityProfile(
            {} as any,
            'portfolio-1',
            '01234567890123456789',
            precomputedScoring
        );

        const eventTitles = profile.events.map((event) => event.title);
        expect(eventTitles).toEqual([
            'Company defaulted on debt covenant',
            'News coverage of product launch',
            'Polymarket odds jump after guidance',
            'Stock spikes after earnings',
            'Critical enforcement action announced',
        ]);

        expect(profile.events.every((event) => event.date)).toBe(true);
        expect(
            profile.events.find((event) => event.title.includes('Critical enforcement'))?.date
        ).toBe('2026-02-01');
        expect(profile.events.some((event) => /Director departure/.test(event.title))).toBe(false);
        expect(profile.events.some((event) => /Old press item/.test(event.title))).toBe(false);
        expect(profile.events.some((event) => /Old trading move/.test(event.title))).toBe(false);
        expect(profile.events.some((event) => /Fraud allegations/.test(event.title))).toBe(false);
    });
});
