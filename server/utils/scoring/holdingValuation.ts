/**
 * Backdated holding valuation.
 *
 * Given a holding's cost-basis dollars and purchase date, price it "through
 * time" using Elemental's daily close_price history:
 *
 *   shares       = amountInvested / close(purchaseDate)
 *   currentValue = shares * close(latest)
 *
 * Instrument resolution (organization -> listed equity/ETF -> price series) is
 * delegated to getStockEntityProfile, which is cached per (portfolio, neid) and
 * already handles the orphan-NEID recovery path. We then make one extra
 * full-history close_price fetch so cost-basis dates older than the ~500-bar UI
 * window still resolve.
 *
 * Prices are raw (unadjusted) Alpha Vantage closes, so purchase dates must sit
 * after a name's most recent split to avoid artificial cost-basis cliffs — the
 * persona fixtures already pick split-safe dates.
 */

import type { H3Event } from 'h3';

import {
    extractPropertyFacts,
    getPropertyValues,
    getSchema,
    normalizePidMap,
    searchEntitiesByName,
} from './elemental';
import { ohlcvSeries } from './prism';
import { getStockEntityProfile } from './stockProfile';

export interface HoldingValuationInput {
    inputName: string;
    neid?: string | null;
    purchaseDate?: string | null;
    amountInvested?: number | null;
}

export interface HoldingValuationResult {
    neid: string | null;
    ticker: string | null;
    amountInvested: number | null;
    shares: number | null;
    costBasisPrice: number | null;
    costBasisDate: string | null;
    latestClose: number | null;
    latestDate: string | null;
    currentValue: number | null;
    returnPct: number | null;
    currency: string | null;
    series: Array<{ date: string; value: number }>;
    error?: string;
}

interface CloseRow {
    date: string;
    close: number;
}

function emptyResult(
    neid: string | null,
    amountInvested: number | null,
    error: string,
    extra?: Partial<HoldingValuationResult>
): HoldingValuationResult {
    return {
        neid,
        ticker: null,
        amountInvested,
        shares: null,
        costBasisPrice: null,
        costBasisDate: null,
        latestClose: null,
        latestDate: null,
        currentValue: null,
        returnPct: null,
        currency: null,
        series: [],
        error,
        ...extra,
    };
}

/** Monthly-downsample a value series so sparklines stay small. */
function downsampleMonthly(rows: Array<{ date: string; value: number }>): Array<{
    date: string;
    value: number;
}> {
    const byMonth = new Map<string, { date: string; value: number }>();
    for (const row of rows) {
        const month = row.date.slice(0, 7);
        // Last reading of each month wins (rows are date-ascending).
        byMonth.set(month, row);
    }
    return Array.from(byMonth.values());
}

export async function valueHolding(
    event: H3Event,
    portfolioId: string,
    input: HoldingValuationInput
): Promise<HoldingValuationResult> {
    const amountInvested =
        typeof input.amountInvested === 'number' && Number.isFinite(input.amountInvested)
            ? input.amountInvested
            : null;

    if (amountInvested == null) {
        return emptyResult(input.neid ?? null, null, 'No amount invested');
    }

    // 1) Resolve the entity NEID if the caller did not supply one.
    let neid = input.neid ?? null;
    if (!neid) {
        try {
            const matches = await searchEntitiesByName(input.inputName, 1, event);
            neid = matches[0]?.neid ?? null;
        } catch {
            neid = null;
        }
    }
    if (!neid) {
        return emptyResult(null, amountInvested, 'Could not resolve entity');
    }

    // 2) Reuse the (cached) stock profile for instrument + latest close.
    let profile;
    try {
        profile = await getStockEntityProfile(event, portfolioId, neid, input.inputName);
    } catch (error: any) {
        return emptyResult(neid, amountInvested, error?.message || 'Stock profile failed');
    }

    const { instrumentNeid, ticker, currency, latestClose, latestDate } = profile;
    if (!instrumentNeid || latestClose == null) {
        return emptyResult(neid, amountInvested, 'No price history available', {
            ticker: ticker ?? null,
            currency: currency ?? null,
        });
    }

    // 3) Pull full OHLCV history from Prism so old purchase dates resolve.
    let closes: CloseRow[] = [];
    try {
        const series = await ohlcvSeries([instrumentNeid], 3650, event);
        const instrumentSeries = series?.series?.find((r) => r.neid === instrumentNeid);
        const bars = Array.isArray(instrumentSeries?.bars) ? instrumentSeries.bars : [];
        closes = bars
            .map((bar) => ({
                date: String(bar.date || '').slice(0, 10),
                close: typeof bar.close === 'number' ? bar.close : Number(bar.close),
            }))
            .filter((row) => row.date && Number.isFinite(row.close) && row.close > 0)
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    } catch {
        closes = [];
    }

    // Fall back to the profile's windowed prices if the full fetch came back empty.
    if (closes.length === 0 && Array.isArray(profile.prices)) {
        closes = profile.prices
            .map((p) => ({ date: p.date.slice(0, 10), close: p.close }))
            .filter((row) => row.date && Number.isFinite(row.close) && row.close > 0)
            .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }

    const latest = closes.length
        ? closes[closes.length - 1]
        : { date: latestDate ?? '', close: latestClose };

    // 4) Cost basis: first close on/after the purchase date (nearest prior if
    //    the purchase date is after all available history).
    const target = (input.purchaseDate ?? '').slice(0, 10);
    let costBasis: CloseRow | null = null;
    if (target && closes.length) {
        costBasis = closes.find((row) => row.date >= target) ?? closes[closes.length - 1] ?? null;
    }
    // No purchase date (or no usable history): treat the seeded amount as the
    // current value so totals stay meaningful, but mark cost basis unknown.
    if (!costBasis) {
        return emptyResult(neid, amountInvested, 'No cost-basis price for purchase date', {
            ticker: ticker ?? null,
            currency: currency ?? null,
            latestClose: latest.close,
            latestDate: latest.date || null,
            currentValue: amountInvested,
            returnPct: 0,
        });
    }

    const shares = costBasis.close > 0 ? amountInvested / costBasis.close : null;
    const currentValue = shares != null ? shares * latest.close : null;
    const returnPct =
        costBasis.close > 0 ? ((latest.close - costBasis.close) / costBasis.close) * 100 : null;

    const series =
        shares != null
            ? downsampleMonthly(
                  closes
                      .filter((row) => row.date >= costBasis!.date)
                      .map((row) => ({ date: row.date, value: shares * row.close }))
              )
            : [];

    return {
        neid,
        ticker: ticker ?? null,
        amountInvested,
        shares,
        costBasisPrice: costBasis.close,
        costBasisDate: costBasis.date,
        latestClose: latest.close,
        latestDate: latest.date || null,
        currentValue,
        returnPct,
        currency: currency ?? null,
        series,
    };
}

/** Value a list of holdings with bounded concurrency. */
export async function valueHoldings(
    event: H3Event,
    portfolioId: string,
    holdings: HoldingValuationInput[]
): Promise<HoldingValuationResult[]> {
    const out: HoldingValuationResult[] = new Array(holdings.length);
    let cursor = 0;
    const workers = Math.min(3, Math.max(1, holdings.length));
    await Promise.all(
        Array.from({ length: workers }, async () => {
            while (cursor < holdings.length) {
                const idx = cursor++;
                try {
                    out[idx] = await valueHolding(event, portfolioId, holdings[idx]!);
                } catch (error: any) {
                    out[idx] = emptyResult(
                        holdings[idx]?.neid ?? null,
                        typeof holdings[idx]?.amountInvested === 'number'
                            ? (holdings[idx]!.amountInvested as number)
                            : null,
                        error?.message || 'Valuation failed'
                    );
                }
            }
        })
    );
    return out;
}
