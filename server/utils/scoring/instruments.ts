/**
 * Shared helpers for identifying and ranking equity financial_instrument entities.
 * Used by stockProfile.ts, scoreEntity.ts, and any other scorer that needs to
 * bridge from an organization NEID to its listed ticker.
 */

export interface RelatedInstrument {
    neid: string;
    name: string;
    flavor?: string;
}

/** "NASDAQ:CCL", "NYSE:F", "AMEX:GME", etc. */
export const PREFIXED_TICKER_RE = /^(NYSE|NASDAQ|AMEX|NYSEARCA|BATS|OTC):\s*([A-Z][A-Z0-9\-\.]*)$/i;

/**
 * Bare US equity tickers: 1-5 uppercase letters, optionally with a class suffix
 * like BRK.B, BRK-B. Excludes pure digits and longer strings (ISINs are always
 * 12 chars with two-letter country prefix, e.g. US693070AD69).
 */
export const BARE_TICKER_RE = /^\$?[A-Z]{1,5}(?:[.\-][A-Z]{1,2})?$/;

/** ISIN/CUSIP detector — de-prioritises debt instruments. */
export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

export function parseInstrumentName(name: string): {
    ticker: string | null;
    exchange: string | null;
} {
    if (!name) return { ticker: null, exchange: null };
    const prefixed = name.match(PREFIXED_TICKER_RE);
    if (prefixed) return { exchange: prefixed[1].toUpperCase(), ticker: prefixed[2].toUpperCase() };
    if (BARE_TICKER_RE.test(name)) {
        return { exchange: null, ticker: name.replace(/^\$/, '').toUpperCase() };
    }
    return { ticker: null, exchange: null };
}

export function isEquityCandidate(name: string): boolean {
    if (!name) return false;
    if (ISIN_RE.test(name)) return false;
    return PREFIXED_TICKER_RE.test(name) || BARE_TICKER_RE.test(name);
}

export function rankInstrumentCandidates(items: RelatedInstrument[]): RelatedInstrument[] {
    return [...items].sort((a, b) => {
        const aEq = isEquityCandidate(a.name) ? 0 : 1;
        const bEq = isEquityCandidate(b.name) ? 0 : 1;
        if (aEq !== bEq) return aEq - bEq;
        const aPref = PREFIXED_TICKER_RE.test(a.name) ? 0 : 1;
        const bPref = PREFIXED_TICKER_RE.test(b.name) ? 0 : 1;
        return aPref - bPref;
    });
}

/**
 * Score how well a ticker symbol matches a company name.
 * Higher = better match. Used to prefer an issuer's own stock (e.g. "F" for
 * Ford Motor Company) over a related-but-different ticker (e.g. "RIVN").
 */
export function tickerMatchScore(ticker: string | null, companyName: string): number {
    if (!ticker || !companyName) return 0;
    const t = ticker.toUpperCase().replace(/[^A-Z]/g, '');
    const words = companyName
        .toUpperCase()
        .replace(/[^A-Z\s]/g, '')
        .split(/\s+/)
        .filter(Boolean);
    if (words.some((w) => w === t)) return 100;
    if (words.some((w) => w.startsWith(t) && w.length >= t.length)) return 80;
    const acronym = words.map((w) => w[0]).join('');
    if (acronym === t || acronym.startsWith(t)) return 60;
    if (t.length >= 3 && words.some((w) => w.includes(t))) return 30;
    return 0;
}
