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
    /**
     * Distinguishes "MCP responded with empty results" (data gap) from
     * "MCP did not respond" (call/config failure). Surfaced so the UI can
     * tell the difference between "no markets for this entity" and "Polymarket
     * is down".
     */
    mcpStatus: 'ok' | 'reachable_empty' | 'unreachable';
    detail: LensDetail;
}

type CandidatePayload = {
    results?: Array<Record<string, unknown>>;
    markets?: Array<Record<string, unknown>>;
    data?: Array<Record<string, unknown>>;
    items?: Array<Record<string, unknown>>;
};

const CORPORATE_SUFFIXES =
    /\s*,?\s*\b(Inc\.?|Corp\.?|Corporation|LLC|Ltd\.?|L\.?P\.?|Co\.?|Group|Holdings|Bancorp|plc|S\.?A\.?|N\.?V\.?|SE|AG)\s*$/gi;

function buildQueryVariants(name: string): string[] {
    const stripped = name.replace(CORPORATE_SUFFIXES, '').trim();
    const words = stripped.split(/\s+/);
    const variants: string[] = [];

    if (stripped && stripped !== name) variants.push(stripped);
    else variants.push(name);

    if (words.length > 2) variants.push(words.slice(0, 2).join(' '));
    if (words.length > 1) variants.push(words[0]);

    const seen = new Set<string>();
    return variants.filter((v) => {
        const key = v.toLowerCase();
        if (seen.has(key) || !v) return false;
        seen.add(key);
        return true;
    });
}

function parseProbability(raw: unknown): number | null {
    let n: number;
    if (typeof raw === 'number') {
        n = raw;
    } else if (typeof raw === 'string') {
        n = Number(raw.replace(/%/g, '').trim());
    } else {
        return null;
    }
    if (!Number.isFinite(n)) return null;
    return n > 1 ? n / 100 : n;
}

function normalizeMarkets(payload: CandidatePayload | null) {
    const rows = payload?.results ?? payload?.markets ?? payload?.data ?? payload?.items ?? [];
    return rows.map((row) => {
        const question = String(row.title || row.question || row.market || '').trim();
        const active = Boolean(row.active ?? row.is_active ?? true);
        const tags = Array.isArray(row.tags) ? row.tags.join(', ') : undefined;
        const category = row.category ? String(row.category) : tags;
        const probability = parseProbability(
            row.probability ?? row.price ?? row.outcome_probability
        );
        return {
            question: question || 'Market',
            active,
            category,
            probability,
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

type PolymarketMcpStatus = 'ok' | 'reachable_empty' | 'unreachable';

interface QueryPolymarketResult {
    markets: Array<{
        question: string;
        active: boolean;
        category: string | undefined;
        probability: number | null;
    }>;
    mcpStatus: PolymarketMcpStatus;
    lastSuccessfulTool: string | null;
    failures: Array<{ tool: string; error: string }>;
}

// One-shot warnings so a 50-entity scan doesn't flood the server log with
// the same message 50 times. Reset at the start of each scan via
// resetPolymarketLogging() so a fresh scan still gets to emit its own
// up-to-one warn + up-to-one error.
let loggedReachableEmpty = false;
let loggedAllFailed = false;

/**
 * Reset the one-shot polymarket log suppression flags. Call at the start of
 * each scan (or any other batch-scoped operation) so the next reachable_empty
 * and the next unreachable both produce a single log line again. Without this
 * the flags survive the lifetime of the worker process and a long-running dev
 * server would only ever surface them once.
 */
export function resetPolymarketLogging(): void {
    loggedReachableEmpty = false;
    loggedAllFailed = false;
}

async function queryPolymarket(
    serverEvent: H3Event,
    entityName: string
): Promise<QueryPolymarketResult> {
    const queries = buildQueryVariants(entityName);
    const toolAttempts = queries.map((q) => ({
        name: 'polymarket_web_search',
        args: { query: q, max_results: 20 },
    }));
    const failures: Array<{ tool: string; error: string }> = [];
    let lastSuccessfulTool: string | null = null;

    for (const attempt of toolAttempts) {
        try {
            const result = await callMcpTool('polymarket', attempt.name, attempt.args, serverEvent);
            if (!result) {
                failures.push({ tool: attempt.name, error: 'empty MCP result' });
                continue;
            }
            lastSuccessfulTool = attempt.name;
            const structured = extractMcpStructuredContent<CandidatePayload>(result);
            const markets = normalizeMarkets(structured);
            if (markets.length > 0) {
                return { markets, mcpStatus: 'ok', lastSuccessfulTool, failures };
            }
        } catch (err: any) {
            failures.push({
                tool: `${attempt.name}(${(attempt.args as any).query})`,
                error: err?.message || String(err),
            });
        }
    }

    if (lastSuccessfulTool) {
        if (!loggedReachableEmpty) {
            loggedReachableEmpty = true;
            console.warn(
                `[polymarket] MCP reachable but returned 0 markets. First seen for entity "${entityName}" via tool "${lastSuccessfulTool}". This is likely a data gap (no active prediction markets for portfolio entities of this flavor), not a call failure. Suppressing further occurrences this session.`
            );
        }
        return { markets: [], mcpStatus: 'reachable_empty', lastSuccessfulTool, failures };
    }

    if (!loggedAllFailed) {
        loggedAllFailed = true;
        console.error(
            `[polymarket] All MCP tool calls failed for entity "${entityName}". Errors: ${JSON.stringify(failures)}. Check that the polymarket MCP server is responding at the configured gateway URL. Suppressing further occurrences this session.`
        );
    }
    return { markets: [], mcpStatus: 'unreachable', lastSuccessfulTool: null, failures };
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
    const { markets, mcpStatus } = await queryPolymarket(event, entityName);
    const probabilities = markets
        .map((row) => row.probability)
        .filter((value): value is number => value != null && Number.isFinite(value));
    const outlook = classifyOutlook(probabilities);
    const positiveMarkets = probabilities.filter((value) => value > 0.5).length;
    const negativeMarkets = probabilities.filter((value) => value < 0.5).length;
    const hasRealData = markets.length > 0;

    const emptyExplanation =
        mcpStatus === 'unreachable'
            ? 'Polymarket MCP did not respond — check server status.'
            : 'No linked prediction markets found for this entity.';

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
        mcpStatus,
        detail: {
            metrics: [
                { label: 'Outlook', value: outlook.outlook ?? 'n/a' },
                {
                    label: 'Outlook score',
                    value: outlook.score != null ? outlook.score.toFixed(1) : 'n/a',
                },
                { label: 'Active markets', value: `${markets.filter((row) => row.active).length}` },
                { label: 'Total markets', value: `${markets.length}` },
                { label: 'MCP status', value: mcpStatus },
            ],
            findings: hasRealData
                ? markets.slice(0, 5).map((row) => ({
                      text: `${row.question}${row.probability != null ? ` (${(row.probability * 100).toFixed(1)}%)` : ''}`,
                      citations: [],
                  }))
                : [{ text: emptyExplanation, citations: [] }],
        },
    };
    await writeScoringCache(event, cacheKey, out, 60 * 60);
    return out;
}
