import { callMcpTool, extractMcpStructuredContent } from '~/server/utils/scoring/mcpGateway';

interface MacroSignal {
    label: string;
    value: number;
    displayValue: string;
    unit: string;
    kind: 'probability';
    trend: 'up' | 'down' | 'flat';
    note: string;
    macroScore?: number;
    endDate?: string;
}

/**
 * Polymarket's `polymarket_web_search` is a fuzzy keyword search that scrapes
 * polymarket.com and reports a single page-level probability per result. That
 * page-level probability is unreliable — it's typically the maximum of any
 * sub-market on a multi-market aggregator page, and the very first result is
 * almost always an unrelated "Competitive" placeholder (the live Bitcoin
 * up/down event). To get a real probability we use `polymarket_web_search`
 * only as a slug discovery mechanism, then fetch the event with
 * `polymarket_get_event_by_slug` and read `outcomePrices` from the chosen
 * sub-market directly.
 */

interface WebSearchResult {
    title?: string;
    slug?: string;
    url?: string;
    probability?: string | number;
    tags?: string[] | null;
    end_date?: string;
}

interface WebSearchPayload {
    results?: WebSearchResult[];
    result_count?: number;
    query?: string;
}

interface MarketSummary {
    question?: string;
    outcomes?: string;
    outcomePrices?: string;
    active?: boolean;
    closed?: boolean;
    endDate?: string;
}

interface EventBySlugPayload {
    title?: string;
    endDate?: string;
    markets?: MarketSummary[];
}

interface IndicatorConfig {
    label: string;
    searchQueries: string[];
    slugIncludes?: string;
    slugExcludes?: string[];
    marketIncludes?: string;
    scoreDirection: 'higher_is_better' | 'lower_is_better' | 'neutral';
}

const COMMENT_FRAGMENT = '#commentsinner';

const INDICATORS: IndicatorConfig[] = [
    {
        label: 'Recession Risk',
        searchQueries: ['US recession 2026'],
        slugIncludes: 'us-recession-by-end-of-2026',
        scoreDirection: 'lower_is_better',
    },
    {
        label: 'Fed Rate Cut',
        searchQueries: ['fed rate cut by next meeting', 'fed rate cut'],
        slugIncludes: 'fed-rate-cut-by',
        scoreDirection: 'neutral',
    },
    {
        label: 'Inflation Outlook',
        searchQueries: ['how high inflation 2026'],
        slugIncludes: 'how-high-will-inflation',
        marketIncludes: 'more than 5%',
        scoreDirection: 'lower_is_better',
    },
    {
        label: 'Market Direction',
        searchQueries: ['spx up or down', 'sp500 up or down'],
        slugIncludes: 'spx-up-or-down-on-',
        slugExcludes: ['opens-up-or-down'],
        scoreDirection: 'higher_is_better',
    },
    {
        label: 'GDP Growth',
        searchQueries: ['US GDP growth 2026'],
        slugIncludes: 'gdp-growth-in-2026',
        marketIncludes: 'greater than 2.5%',
        scoreDirection: 'higher_is_better',
    },
];

let cachedSignals: { signals: MacroSignal[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

function deriveTrend(probability: number): 'up' | 'down' | 'flat' {
    if (probability > 0.6) return 'up';
    if (probability < 0.4) return 'down';
    return 'flat';
}

function computeMacroScore(
    probability: number,
    direction: IndicatorConfig['scoreDirection']
): number {
    if (direction === 'neutral') return 0;
    const raw = Math.max(-1, Math.min(1, 2 * (probability - 0.5)));
    return direction === 'lower_is_better' ? -raw : raw;
}

function lc(s: string | undefined | null): string {
    return (s ?? '').toLowerCase();
}

function safeParseJsonArray(raw: string | undefined): unknown[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function pickFirstMatchingResult(
    results: WebSearchResult[],
    config: IndicatorConfig
): WebSearchResult | null {
    const slugIncludes = lc(config.slugIncludes);
    const excludes = (config.slugExcludes ?? []).map(lc);
    for (const r of results) {
        const slug = r.slug ?? '';
        const lcSlug = lc(slug);
        if (!slug) continue;
        if (lc(r.title) === 'competitive') continue;
        if (lcSlug.includes(COMMENT_FRAGMENT)) continue;
        if (excludes.some((ex) => lcSlug.includes(ex))) continue;
        if (slugIncludes && !lcSlug.includes(slugIncludes)) continue;
        return r;
    }
    return null;
}

function pickMarket(
    markets: MarketSummary[] | undefined,
    config: IndicatorConfig
): MarketSummary | null {
    if (!markets || markets.length === 0) return null;

    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const cutoffMs = Date.now() - NINETY_DAYS_MS;

    function isEligible(m: MarketSummary): boolean {
        if (m.active && !m.closed) return true;
        // Include recently resolved markets (closed within last 90 days)
        if (m.endDate) {
            const endMs = Date.parse(m.endDate);
            if (Number.isFinite(endMs) && endMs >= cutoffMs) return true;
        }
        return false;
    }

    const eligible = markets.filter(isEligible);
    if (eligible.length === 0) return null;

    // Active markets take priority; recently closed are fallback
    const active = eligible.filter((m) => m.active && !m.closed);
    const pool = active.length > 0 ? active : eligible;

    if (config.marketIncludes) {
        const include = lc(config.marketIncludes);
        const found = pool.find((m) => lc(m.question).includes(include));
        return found ?? pool[0] ?? null;
    }
    return pool[0];
}

async function findCandidateSlug(
    event: any,
    config: IndicatorConfig
): Promise<{ slug: string; result: WebSearchResult } | null> {
    for (const query of config.searchQueries) {
        const raw = await callMcpTool(
            'polymarket',
            'polymarket_web_search',
            { query, max_results: 10 },
            event
        );
        if (!raw) continue;
        const data = extractMcpStructuredContent<WebSearchPayload>(raw);
        const results = data?.results ?? [];
        const match = pickFirstMatchingResult(results, config);
        if (match?.slug) return { slug: match.slug, result: match };
    }
    return null;
}

async function fetchEventBySlug(event: any, slug: string): Promise<EventBySlugPayload | null> {
    const raw = await callMcpTool('polymarket', 'polymarket_get_event_by_slug', { slug }, event);
    if (!raw) return null;
    return extractMcpStructuredContent<EventBySlugPayload>(raw) ?? null;
}

async function fetchMacroSignal(event: any, config: IndicatorConfig): Promise<MacroSignal | null> {
    try {
        const candidate = await findCandidateSlug(event, config);
        if (!candidate) return null;

        const eventData = await fetchEventBySlug(event, candidate.slug);
        if (!eventData) return null;

        const market = pickMarket(eventData.markets, config);
        if (!market) return null;

        const prices = safeParseJsonArray(market.outcomePrices);
        const outcomes = safeParseJsonArray(market.outcomes);
        if (prices.length === 0) return null;

        // Pick the "Yes"/"Up" price (positive outcome). Falls back to index 0
        // when outcomes don't follow the standard binary naming.
        const positiveIdx = outcomes.findIndex(
            (o) => typeof o === 'string' && /^(yes|up)$/i.test(o)
        );
        const idx = positiveIdx >= 0 ? positiveIdx : 0;

        let probability = Number(prices[idx]);
        if (!Number.isFinite(probability)) return null;
        if (probability > 1) probability = probability / 100;
        probability = Math.min(1, Math.max(0, probability));

        const pct = Math.round(probability * 1000) / 10;
        const rawEndDate = market.endDate || eventData.endDate || null;
        return {
            label: config.label,
            value: pct,
            displayValue: `${pct.toFixed(1)}%`,
            unit: '%',
            kind: 'probability' as const,
            trend: deriveTrend(probability),
            note: market.question || eventData.title || candidate.result.title || config.label,
            macroScore: computeMacroScore(probability, config.scoreDirection),
            endDate: rawEndDate ? rawEndDate.slice(0, 10) : undefined,
        };
    } catch {
        return null;
    }
}

export default defineEventHandler(async (event) => {
    if (cachedSignals && Date.now() < cachedSignals.expiresAt) {
        return cachedSignals.signals;
    }

    const results = await Promise.allSettled(
        INDICATORS.map((indicator) => fetchMacroSignal(event, indicator))
    );

    const signals = results
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((s): s is MacroSignal => s != null);

    if (signals.length > 0) {
        cachedSignals = { signals, expiresAt: Date.now() + CACHE_TTL_MS };
    }
    return signals;
});
