import { callMcpTool, extractMcpStructuredContent } from '~/server/utils/scoring/mcpGateway';

interface MacroSignal {
    label: string;
    value: number;
    trend: 'up' | 'down' | 'flat';
    note: string;
}

interface MacroQuery {
    query: string;
    label: string;
}

const MACRO_QUERIES: MacroQuery[] = [
    { query: 'US recession 2026', label: 'Recession Risk' },
    { query: 'Federal Reserve interest rate cut', label: 'Fed Rate Cut' },
    { query: 'US inflation 2026', label: 'Inflation Outlook' },
    { query: 'S&P 500 stock market', label: 'Market Direction' },
    { query: 'US GDP growth', label: 'GDP Growth' },
];

let cachedSignals: { signals: MacroSignal[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

interface WebSearchResult {
    title?: string;
    probability?: string | number;
    url?: string;
    slug?: string;
    tags?: string[];
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

function deriveTrend(probability: number): 'up' | 'down' | 'flat' {
    if (probability > 0.6) return 'up';
    if (probability < 0.4) return 'down';
    return 'flat';
}

async function fetchMacroMarket(event: any, mq: MacroQuery): Promise<MacroSignal | null> {
    try {
        const result = await callMcpTool(
            'polymarket',
            'polymarket_web_search',
            { query: mq.query, max_results: 5 },
            event
        );
        if (!result) return null;

        const data = extractMcpStructuredContent<{
            results?: WebSearchResult[];
        }>(result);
        const results = data?.results ?? [];
        if (!results.length) return null;

        // Pick the first result with a parseable probability
        for (const r of results) {
            const prob = parseProbability(r.probability);
            if (prob == null) continue;
            const pct = Math.round(prob * 1000) / 10;
            return {
                label: mq.label,
                value: pct,
                trend: deriveTrend(prob),
                note: r.title || mq.query,
            };
        }
        return null;
    } catch {
        return null;
    }
}

export default defineEventHandler(async (event) => {
    if (cachedSignals && Date.now() < cachedSignals.expiresAt) {
        return cachedSignals.signals;
    }

    const results = await Promise.allSettled(
        MACRO_QUERIES.map((mq) => fetchMacroMarket(event, mq))
    );

    const signals = results
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((s): s is MacroSignal => s != null);

    if (signals.length > 0) {
        cachedSignals = { signals, expiresAt: Date.now() + CACHE_TTL_MS };
    }
    return signals;
});
