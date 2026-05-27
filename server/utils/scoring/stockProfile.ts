import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { resolveRefs } from './citations';
import { extractNumeric, getEntityName, getPropertyValues, getSchema, normalizePidMap } from './elemental';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import type { CitationRef } from './types';

export interface StockEntityProfile {
    neid: string;
    entityName: string;
    instrumentName: string | null;
    ticker: string | null;
    exchange: string | null;
    currency: string | null;
    latestClose: number | null;
    latestDate: string | null;
    returnPct45d: number | null;
    annualizedVolPct: number | null;
    periodHigh: number | null;
    periodLow: number | null;
    samples: number;
    prices: Array<{ date: string; close: number }>;
    technical: Array<{ label: string; value: string }>;
    keyMetrics: Array<{ label: string; value: string }>;
    dataGaps: string[];
    citations: CitationRef[];
}

type NumericSeries = Array<{ date: string; value: number }>;

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function toNumericSeries(prices: Array<{ date?: string; close?: number }>): NumericSeries {
    return prices
        .map((row) => ({ date: String(row?.date || ''), value: row?.close as number }))
        .filter((row) => row.date.length > 0 && isFiniteNumber(row.value));
}

function computeAnnualizedVol(closes: number[]) {
    if (closes.length < 3) return null;
    const dailyReturns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
        const prev = closes[i - 1];
        if (!prev || !Number.isFinite(prev)) continue;
        dailyReturns.push((closes[i] - prev) / prev);
    }
    if (dailyReturns.length < 2) return null;
    const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
    const variance =
        dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / dailyReturns.length;
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export async function getStockEntityProfile(
    event: H3Event,
    portfolioId: string,
    neid: string
): Promise<StockEntityProfile> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'stock-profile');
    const cached = await readScoringCache<StockEntityProfile>(event, cacheKey);
    if (cached) return cached;

    const entityName = await getEntityName(neid, event).catch(() => neid);
    const dataGaps: string[] = [];
    const citations: CitationRef[] = [];
    let ticker: string | null = null;
    let exchange: string | null = null;
    let currency: string | null = null;
    let instrumentName: string | null = null;
    let marketCap: number | null = null;
    let peRatio: number | null = null;
    let rsi: number | null = null;
    let anomalyFlags: number | null = null;
    let vol30: number | null = null;

    try {
        const schema = await getSchema(event);
        const pid = normalizePidMap(schema);
        const candidatePids = [
            pid.ticker_symbol,
            pid.exchange,
            pid.currency,
            pid.market_cap,
            pid.pe_ratio,
            pid.rsi_14 ?? pid.rsi,
            pid.anomaly_flag ?? pid.market_anomaly,
            pid.volatility_30d ?? pid.volatility,
        ].filter((value): value is number => typeof value === 'number');
        if (candidatePids.length > 0) {
            const values = await getPropertyValues([neid], candidatePids, true, event);
            const readText = (targetPid?: number) =>
                values
                    .filter((row) => row.pid === targetPid)
                    .flatMap((row) => {
                        const direct = typeof row.value === 'string' ? [row.value] : [];
                        const nested = Array.isArray(row.values)
                            ? row.values
                                  .map((entry) => entry?.value)
                                  .filter((value): value is string => typeof value === 'string')
                            : [];
                        return [...direct, ...nested];
                    })[0] || null;

            ticker = readText(pid.ticker_symbol);
            exchange = readText(pid.exchange);
            currency = readText(pid.currency);
            marketCap = extractNumeric(values, pid.market_cap ?? -1)[0] ?? null;
            peRatio = extractNumeric(values, pid.pe_ratio ?? -1)[0] ?? null;
            rsi = extractNumeric(values, pid.rsi_14 ?? pid.rsi ?? -1)[0] ?? null;
            anomalyFlags = extractNumeric(values, pid.anomaly_flag ?? pid.market_anomaly ?? -1)[0] ?? null;
            vol30 = extractNumeric(values, pid.volatility_30d ?? pid.volatility ?? -1)[0] ?? null;

            const refs = values
                .flatMap((row) => {
                    const direct = typeof row.ref === 'string' ? [row.ref] : [];
                    const nested = Array.isArray(row.values)
                        ? row.values
                              .map((entry) => entry?.ref)
                              .filter((ref): ref is string => typeof ref === 'string')
                        : [];
                    return [...direct, ...nested];
                })
                .slice(0, 20);
            const citationMap = await resolveRefs(refs, event);
            refs.forEach((ref) => {
                const citation = citationMap.get(ref);
                if (citation) citations.push(citation);
            });
        }
    } catch (error) {
        console.warn('[stock profile] elemental property fetch failed', error);
        dataGaps.push('Elemental stock properties unavailable');
    }

    try {
        const instrumentResult = await callMcpTool(
            'elemental',
            'elemental_get_related',
            {
                entity_id: { id_type: 'neid', id: neid },
                related_flavor: 'financial_instrument',
                related_properties: ['ticker_symbol', 'exchange', 'currency'],
                limit: 1,
            },
            event
        );
        const instrument = extractMcpStructuredContent<{
            relationships?: Array<{
                name?: string;
                properties?: Record<string, { value?: unknown; ref?: string }>;
            }>;
        }>(instrumentResult)?.relationships?.[0];
        if (instrument) {
            instrumentName = instrument.name || null;
            ticker = ticker || (instrument.properties?.ticker_symbol?.value as string | null | undefined) || null;
            exchange =
                exchange || (instrument.properties?.exchange?.value as string | null | undefined) || null;
            currency =
                currency || (instrument.properties?.currency?.value as string | null | undefined) || null;
            const refs = Object.values(instrument.properties || {})
                .map((property) => property?.ref)
                .filter((ref): ref is string => typeof ref === 'string');
            if (refs.length > 0) {
                const map = await resolveRefs(refs, event);
                refs.forEach((ref) => {
                    const citation = map.get(ref);
                    if (citation) citations.push(citation);
                });
            }
        } else {
            dataGaps.push('No related financial instrument found in Elemental');
        }
    } catch (error) {
        console.warn('[stock profile] financial instrument lookup failed', error);
        dataGaps.push('Financial instrument relationship lookup failed');
    }

    let priceSeries: NumericSeries = [];
    try {
        const stocksResult = await callMcpTool(
            'stocks',
            'get_daily_stock_prices',
            {
                company_name: entityName,
                lookback_days: 90,
            },
            event
        );
        const structured = extractMcpStructuredContent<{
            found?: boolean;
            ticker_info?: { ticker?: string };
            prices?: Array<{ date?: string; close?: number }>;
        }>(stocksResult);
        if (structured?.found && Array.isArray(structured.prices)) {
            ticker = ticker || structured.ticker_info?.ticker || null;
            priceSeries = toNumericSeries(structured.prices);
            if (ticker) {
                citations.push({
                    source: 'stocks-mcp',
                    title: `${ticker} price history`,
                    url: `https://finance.yahoo.com/quote/${ticker}`,
                    date: priceSeries[priceSeries.length - 1]?.date,
                });
            }
        } else {
            dataGaps.push('Stocks MCP returned no daily prices');
        }
    } catch (error) {
        console.warn('[stock profile] stocks MCP lookup failed', error);
        dataGaps.push('Stocks MCP daily price lookup failed');
    }

    const closes = priceSeries.map((row) => row.value);
    const latestClose = closes.length > 0 ? closes[closes.length - 1] : null;
    const latestDate = priceSeries.length > 0 ? priceSeries[priceSeries.length - 1].date : null;
    const firstClose = closes.length > 0 ? closes[0] : null;
    const returnPct45d =
        firstClose && latestClose ? ((latestClose - firstClose) / Math.max(firstClose, 1e-6)) * 100 : null;
    const annualizedVolPct = computeAnnualizedVol(closes);
    const periodHigh = closes.length > 0 ? Math.max(...closes) : null;
    const periodLow = closes.length > 0 ? Math.min(...closes) : null;

    if (!ticker) dataGaps.push('Ticker symbol unavailable');
    if (closes.length < 5) dataGaps.push('Insufficient price samples (need at least 5)');
    if (rsi === null) dataGaps.push('RSI signal not available');
    if (vol30 === null && annualizedVolPct === null) dataGaps.push('Volatility signal not available');

    const technical: Array<{ label: string; value: string }> = [];
    if (rsi !== null) technical.push({ label: 'RSI (14)', value: rsi.toFixed(1) });
    if (vol30 !== null) technical.push({ label: '30d Volatility', value: `${vol30.toFixed(1)}%` });
    if (annualizedVolPct !== null)
        technical.push({ label: 'Annualized Vol', value: `${annualizedVolPct.toFixed(1)}%` });
    if (anomalyFlags !== null) technical.push({ label: 'Anomaly Flags', value: `${Math.round(anomalyFlags)}` });

    const keyMetrics: Array<{ label: string; value: string }> = [];
    if (latestClose !== null) keyMetrics.push({ label: 'Latest Close', value: `$${latestClose.toFixed(2)}` });
    if (returnPct45d !== null)
        keyMetrics.push({ label: 'Window Return', value: `${returnPct45d.toFixed(1)}%` });
    if (periodHigh !== null) keyMetrics.push({ label: 'Period High', value: `$${periodHigh.toFixed(2)}` });
    if (periodLow !== null) keyMetrics.push({ label: 'Period Low', value: `$${periodLow.toFixed(2)}` });
    if (marketCap !== null) keyMetrics.push({ label: 'Market Cap', value: `$${(marketCap / 1e9).toFixed(2)}B` });
    if (peRatio !== null) keyMetrics.push({ label: 'P/E Ratio', value: peRatio.toFixed(2) });

    const profile: StockEntityProfile = {
        neid,
        entityName,
        instrumentName,
        ticker,
        exchange,
        currency,
        latestClose,
        latestDate,
        returnPct45d,
        annualizedVolPct,
        periodHigh,
        periodLow,
        samples: closes.length,
        prices: priceSeries.map((row) => ({ date: row.date, close: row.value })),
        technical,
        keyMetrics,
        dataGaps: Array.from(new Set(dataGaps)),
        citations,
    };

    await writeScoringCache(event, cacheKey, profile);
    return profile;
}
