export interface WebSearchResult {
    title?: string;
    slug?: string;
    url?: string;
    probability?: string | number;
    tags?: string[] | null;
    end_date?: string;
}

export interface MarketSummary {
    question?: string;
    outcomes?: string;
    outcomePrices?: string;
    active?: boolean;
    closed?: boolean;
    endDate?: string;
}

export interface IndicatorConfig {
    label: string;
    searchQueries: string[];
    slugIncludes?: string;
    slugExcludes?: string[];
    marketIncludes?: string;
    scoreDirection: 'higher_is_better' | 'lower_is_better' | 'neutral';
}

const COMMENT_FRAGMENT = '#commentsinner';

export function lc(s: string | undefined | null): string {
    return (s ?? '').toLowerCase();
}

export function safeParseJsonArray(raw: string | undefined): unknown[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function deriveTrend(probability: number): 'up' | 'down' | 'flat' {
    if (probability > 0.6) return 'up';
    if (probability < 0.4) return 'down';
    return 'flat';
}

export function computeMacroScore(
    probability: number,
    direction: IndicatorConfig['scoreDirection']
): number {
    if (direction === 'neutral') return 0;
    const raw = Math.max(-1, Math.min(1, 2 * (probability - 0.5)));
    return direction === 'lower_is_better' ? -raw : raw;
}

export function pickFirstMatchingResult(
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

export function pickMarket(
    markets: MarketSummary[] | undefined,
    config: IndicatorConfig
): MarketSummary | null {
    if (!markets || markets.length === 0) return null;

    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const cutoffMs = Date.now() - NINETY_DAYS_MS;

    function isEligible(m: MarketSummary): boolean {
        if (m.active && !m.closed) return true;
        if (m.endDate) {
            const endMs = Date.parse(m.endDate);
            if (Number.isFinite(endMs) && endMs >= cutoffMs) return true;
        }
        return false;
    }

    const eligible = markets.filter(isEligible);
    if (eligible.length === 0) return null;

    const active = eligible.filter((m) => m.active && !m.closed);
    const pool = active.length > 0 ? active : eligible;

    if (config.marketIncludes) {
        const include = lc(config.marketIncludes);
        const found = pool.find((m) => lc(m.question).includes(include));
        return found ?? pool[0] ?? null;
    }
    return pool[0];
}
