import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getEntityProfile } from '../server/utils/scoring/profile';

const callMcpToolMock = vi.fn();
const getContextPackageMock = vi.fn();

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

vi.mock('../server/utils/scoring/contextPackage', () => ({
    getContextPackage: (...args: unknown[]) => getContextPackageMock(...args),
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
        getContextPackageMock.mockResolvedValue({
            events: [
                // Keep: SEC critical + within 1y
                {
                    category: 'Filing',
                    description: 'Company defaulted on debt covenant',
                    date: '2026-05-30',
                    eventType: 'Default event',
                    ref: null,
                },
                // Keep: NEWS + within 3m
                {
                    category: 'Media',
                    description: 'News coverage of product launch',
                    date: '2026-05-15',
                    eventType: 'Media event',
                    ref: null,
                },
                // Keep: POLY + within 3m
                {
                    category: 'Prediction_Market',
                    description: 'Polymarket odds jump after guidance',
                    date: '2026-04-20',
                    eventType: 'Prediction market',
                    ref: null,
                },
                // Keep: STOCK + within 3m
                {
                    category: 'Stock Price',
                    description: 'Stock spikes after earnings',
                    date: '2026-03-10',
                    eventType: 'Stock move',
                    ref: null,
                },
                // Keep: event_date fallback equivalent + SEC critical + within 1y
                {
                    category: 'Regulatory',
                    description: 'Critical enforcement action announced',
                    date: '2026-02-01',
                    eventType: 'Critical enforcement',
                    ref: null,
                },
                // Drop: SEC medium (not critical/high)
                {
                    category: 'Corporate',
                    description: 'Director departure noted',
                    date: '2026-05-28',
                    eventType: 'Officer departure',
                    ref: null,
                },
                // Drop: NEWS older than 3m
                {
                    category: 'News',
                    description: 'Old press item',
                    date: '2026-01-15',
                    eventType: 'Old article',
                    ref: null,
                },
                // Drop: STOCK older than 3m
                {
                    category: 'Market',
                    description: 'Old trading move',
                    date: '2025-12-20',
                    eventType: 'Old stock move',
                    ref: null,
                },
                // Drop: SEC high but older than 1y
                {
                    category: 'Filing',
                    description: 'Fraud allegations from long ago',
                    date: '2025-05-15',
                    eventType: 'Ancient fraud',
                    ref: null,
                },
                // Drop: invalid date
                {
                    category: 'News',
                    description: 'Malformed date input',
                    date: 'not-a-date',
                    eventType: 'Invalid timestamp event',
                    ref: null,
                },
            ],
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
