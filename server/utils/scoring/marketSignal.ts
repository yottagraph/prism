import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import type { ContextPackage } from './contextPackage';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import {
    extractNumeric,
    getEntityName,
    getPropertyValues,
    getSchema,
    normalizePidMap,
} from './elemental';
import { clampScore } from './hash';
import type { EvidenceItem, LensDetail } from './types';

export interface MarketResult {
    score: number;
    hasRealData: boolean;
    priceCount: number;
    earliestPriceDate: string | null;
    latestPriceDate: string | null;
    detail: LensDetail;
}

let loggedPathADiag = false;

export function resetMarketSignalDiagnostics(): void {
    loggedPathADiag = false;
}

export async function computeMarketSignalScore(
    event: H3Event,
    portfolioId: string,
    neid: string,
    ctx?: ContextPackage
): Promise<MarketResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'market');
    const cached = await readScoringCache<MarketResult>(event, cacheKey);
    if (cached) return cached;

    let score = 0;
    let hasRealData = false;
    let priceCount = 0;
    let earliestPriceDate: string | null = null;
    let latestPriceDate: string | null = null;
    const metrics: LensDetail['metrics'] = [];
    const findings: EvidenceItem[] = [];

    try {
        const schema = await getSchema(event);
        const pid = normalizePidMap(schema);
        const returnPid = pid.return_30d ?? pid.price_change_30d ?? pid.returns_30d;
        const volPid = pid.volatility_30d ?? pid.realized_volatility ?? pid.volatility;
        const rsiPid = pid.rsi_14 ?? pid.rsi;
        const anomalyPid = pid.market_anomaly ?? pid.anomaly_flag;
        const candidatePids = [returnPid, volPid, rsiPid, anomalyPid].filter(
            (v): v is string => typeof v === 'string' && v.length > 0
        );

        if (!loggedPathADiag && candidatePids.length === 0) {
            loggedPathADiag = true;
            const matchingKeys = Object.keys(pid)
                .filter((k) => /return|volat|rsi|anomaly/i.test(k))
                .join(', ');
            console.warn(
                `[market signal] Path A skipped: schema exposes no PIDs for return_30d/volatility_30d/rsi_14/market_anomaly aliases. ` +
                    `Falling through to stocks MCP for every entity. First seen for ${neid}. ` +
                    `Schema keys matching /return|volat|rsi|anomaly/: ${matchingKeys || '(none)'}. ` +
                    `Suppressing further occurrences this scan.`
            );
        }

        if (candidatePids.length) {
            const values = await getPropertyValues([neid], candidatePids, true, event);
            const return30 = extractNumeric(values, returnPid ?? '')[0];
            const vol30 = extractNumeric(values, volPid ?? '')[0];
            const rsi = extractNumeric(values, rsiPid ?? '')[0];
            const anomaly = extractNumeric(values, anomalyPid ?? '')[0];

            const hasFiniteScalar = [return30, vol30, rsi, anomaly].some(
                (v) => typeof v === 'number' && Number.isFinite(v)
            );

            if (!loggedPathADiag && !hasFiniteScalar) {
                loggedPathADiag = true;
                console.warn(
                    `[market signal] Path A returned no finite data despite schema PIDs being present. ` +
                        `Resolved PIDs: ${JSON.stringify({ returnPid, volPid, rsiPid, anomalyPid })}. ` +
                        `First seen for ${neid}. Suppressing further occurrences this scan.`
                );
            }

            if (hasFiniteScalar) {
                hasRealData = true;
                const drawdownRisk =
                    typeof return30 === 'number' ? Math.max(0, -return30) * 1.5 : 6;
                const volRisk = typeof vol30 === 'number' ? Math.max(0, vol30 - 25) * 0.8 : 5;
                const rsiRisk = typeof rsi === 'number' ? (rsi < 30 ? 10 : rsi > 70 ? 12 : 4) : 4;
                const anomalyRisk = typeof anomaly === 'number' ? Math.min(15, anomaly * 6) : 3;
                score = clampScore(35 + drawdownRisk + volRisk + rsiRisk + anomalyRisk);

                if (typeof return30 === 'number')
                    metrics.push({ label: '30d return', value: `${return30.toFixed(1)}%` });
                if (typeof vol30 === 'number')
                    metrics.push({ label: '30d volatility', value: `${vol30.toFixed(1)}%` });
                if (typeof rsi === 'number')
                    metrics.push({ label: 'RSI (14)', value: `${rsi.toFixed(1)}` });
                if (typeof anomaly === 'number')
                    metrics.push({ label: 'Anomaly flags', value: `${Math.round(anomaly)}` });

                findings.push({
                    text: `Market signals indicate ${
                        typeof return30 === 'number'
                            ? `${return30.toFixed(1)}% 30-day return`
                            : 'unknown return'
                    }, ${
                        typeof vol30 === 'number'
                            ? `${vol30.toFixed(1)}% realized volatility`
                            : 'unknown volatility'
                    }${typeof rsi === 'number' ? `, RSI ${rsi.toFixed(1)}` : ''}.`,
                    citations: [],
                });
            }
        }
    } catch (error) {
        console.warn('[market signal] failed', error);
    }

    if (!hasRealData) {
        try {
            const companyName = await getEntityName(neid, event);
            const result = await callMcpTool(
                'stocks',
                'get_daily_stock_prices',
                {
                    company_name: companyName,
                    lookback_days: 45,
                },
                event
            );
            const structured = extractMcpStructuredContent<{
                found?: boolean;
                ticker_info?: { ticker?: string };
                prices?: Array<{ close?: number; date?: string }>;
            }>(result);
            const prices = Array.isArray(structured?.prices) ? structured!.prices : [];
            const closes = prices
                .map((row) => row?.close)
                .filter(
                    (value): value is number => typeof value === 'number' && Number.isFinite(value)
                );

            if ((structured?.found ?? false) && closes.length >= 5) {
                const priceDates = prices
                    .map((row) => row?.date)
                    .filter((d): d is string => typeof d === 'string' && d.length > 0)
                    .sort();
                priceCount = prices.length;
                if (priceDates.length > 0) {
                    earliestPriceDate = priceDates[0];
                    latestPriceDate = priceDates[priceDates.length - 1];
                }

                const first = closes[0];
                const last = closes[closes.length - 1];
                const returnPct = first ? ((last - first) / first) * 100 : 0;
                const dayReturns: number[] = [];
                for (let i = 1; i < closes.length; i++) {
                    const prev = closes[i - 1];
                    if (!prev) continue;
                    dayReturns.push((closes[i] - prev) / prev);
                }
                const mean =
                    dayReturns.length > 0
                        ? dayReturns.reduce((sum, value) => sum + value, 0) / dayReturns.length
                        : 0;
                const variance =
                    dayReturns.length > 0
                        ? dayReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
                          dayReturns.length
                        : 0;
                const annualizedVolPct = Math.sqrt(variance) * Math.sqrt(252) * 100;

                hasRealData = true;
                score = clampScore(
                    35 + Math.max(0, -returnPct) * 1.4 + Math.max(0, annualizedVolPct - 22)
                );
                metrics.push({ label: '30-45d return', value: `${returnPct.toFixed(1)}%` });
                metrics.push({ label: 'Annualized vol', value: `${annualizedVolPct.toFixed(1)}%` });
                if (structured?.ticker_info?.ticker) {
                    metrics.push({ label: 'Ticker', value: structured.ticker_info.ticker });
                }
                const firstDate = prices[0]?.date;
                const lastDate = prices[prices.length - 1]?.date;
                const ticker = structured?.ticker_info?.ticker;
                const tickerUrl = ticker ? `https://finance.yahoo.com/quote/${ticker}` : undefined;
                findings.push({
                    text: `${ticker || companyName} closed at $${last.toFixed(2)}${
                        lastDate ? ` on ${lastDate}` : ''
                    }, ${returnPct >= 0 ? 'up' : 'down'} ${Math.abs(returnPct).toFixed(
                        1
                    )}% over the observed window${firstDate ? ` since ${firstDate}` : ''}. Annualized volatility is ${annualizedVolPct.toFixed(
                        1
                    )}%.`,
                    date: lastDate || undefined,
                    citations: [
                        {
                            source: 'stocks-mcp',
                            date: lastDate || undefined,
                            url: tickerUrl,
                            title: ticker
                                ? `${ticker} price history`
                                : `${companyName} price history`,
                        },
                    ],
                });
            }
        } catch (error) {
            console.warn('[market signal] stocks MCP fallback failed', error);
        }
    }

    const result: MarketResult = {
        score,
        hasRealData,
        priceCount,
        earliestPriceDate,
        latestPriceDate,
        detail: {
            metrics: metrics.length
                ? metrics
                : [{ label: 'Status', value: 'Elemental market data unavailable' }],
            findings: findings.length
                ? findings
                : [
                      {
                          text: 'No market price or volatility data was returned for this entity.',
                          citations: [],
                      },
                  ],
        },
    };
    await writeScoringCache(event, cacheKey, result);
    return result;
}
