import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import type { ContextPackage } from './contextPackage';
import { getEntityName } from './elemental';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import type { LensDetail } from './types';

export interface PolymarketOutlookResult {
    outlook: 'positive' | 'neutral' | 'negative' | null;
    outlookScore: number | null;
    marketCount: number;
    positiveMarkets: number;
    negativeMarkets: number;
    markets: Array<{ question: string; active: boolean; category?: string }>;
    hasRealData: boolean;
    detail: LensDetail;
}

type CandidatePayload = {
    markets?: Array<Record<string, unknown>>;
    data?: Array<Record<string, unknown>>;
    items?: Array<Record<string, unknown>>;
};

function normalizeMarkets(payload: CandidatePayload | null) {
    const rows = payload?.markets ?? payload?.data ?? payload?.items ?? [];
    return rows.map((row) => {
        const question = String(row.question || row.title || row.market || '').trim();
        const active = Boolean(row.active ?? row.is_active ?? true);
        const category = row.category ? String(row.category) : undefined;
        const probabilityRaw = row.probability ?? row.price ?? row.outcome_probability;
        const probability =
            typeof probabilityRaw === 'number'
                ? probabilityRaw
                : typeof probabilityRaw === 'string'
                  ? Number(probabilityRaw)
                  : NaN;
        return {
            question: question || 'Market',
            active,
            category,
            probability: Number.isFinite(probability) ? probability : null,
        };
    });
}

function classifyOutlook(probabilities: number[]): {
    outlook: 'positive' | 'neutral' | 'negative' | null;
    score: number | null;
} {
    if (!probabilities.length) return { outlook: null, score: null };
    const avg = probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length;
    if (avg > 0.6) return { outlook: 'positive' as const, score: avg * 100 };
    if (avg < 0.4) return { outlook: 'negative' as const, score: avg * 100 };
    return { outlook: 'neutral' as const, score: avg * 100 };
}

async function queryPolymarket(serverEvent: H3Event, entityName: string) {
    const toolAttempts: Array<{ name: string; args: Record<string, unknown> }> = [
        { name: 'polymarket_get_context', args: { entity: entityName } },
        { name: 'polymarket_search_markets', args: { query: entityName, limit: 20 } },
        { name: 'get_markets', args: { query: entityName, limit: 20 } },
    ];
    for (const attempt of toolAttempts) {
        try {
            const result = await callMcpTool('polymarket', attempt.name, attempt.args, serverEvent);
            const structured = extractMcpStructuredContent<CandidatePayload>(result);
            const markets = normalizeMarkets(structured);
            if (markets.length > 0) return markets;
        } catch {
            // Try next tool alias.
        }
    }
    return [];
}

export async function computePolymarketOutlook(
    event: H3Event,
    portfolioId: string,
    neid: string,
    _ctx?: ContextPackage
): Promise<PolymarketOutlookResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'polymarket-outlook');
    const cached = await readScoringCache<PolymarketOutlookResult>(event, cacheKey);
    if (cached) return cached;

    const entityName = await getEntityName(neid, event);
    const markets = await queryPolymarket(event, entityName);
    const probabilities = markets
        .map((row) => row.probability)
        .filter((value): value is number => value != null && Number.isFinite(value));
    const outlook = classifyOutlook(probabilities);
    const positiveMarkets = probabilities.filter((value) => value > 0.5).length;
    const negativeMarkets = probabilities.filter((value) => value < 0.5).length;
    const hasRealData = markets.length > 0;

    const out: PolymarketOutlookResult = {
        outlook: outlook.outlook,
        outlookScore: outlook.score,
        marketCount: markets.length,
        positiveMarkets,
        negativeMarkets,
        markets: markets.map((row) => ({
            question: row.question,
            active: row.active,
            category: row.category,
        })),
        hasRealData,
        detail: {
            metrics: [
                { label: 'Outlook', value: outlook.outlook ?? 'n/a' },
                {
                    label: 'Outlook score',
                    value: outlook.score != null ? outlook.score.toFixed(1) : 'n/a',
                },
                { label: 'Active markets', value: `${markets.filter((row) => row.active).length}` },
                { label: 'Total markets', value: `${markets.length}` },
            ],
            findings: hasRealData
                ? markets.slice(0, 5).map((row) => ({
                      text: `${row.question}${row.probability != null ? ` (${(row.probability * 100).toFixed(1)}%)` : ''}`,
                      citations: [],
                  }))
                : [{ text: 'No linked prediction markets found for this entity.', citations: [] }],
        },
    };
    await writeScoringCache(event, cacheKey, out, 60 * 60);
    return out;
}
