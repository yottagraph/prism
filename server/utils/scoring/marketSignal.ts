import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import type { ContextPackage } from './contextPackage';
import { stockBundle } from './prism';
import { extractNumeric, getSchema, normalizePidMap } from './elemental';
import { clampScore } from './hash';
import type { EvidenceItem, LensDetail } from './types';

export interface MarketResult {
    score: number;
    hasRealData: boolean;
    priceCount: number;
    earliestPriceDate: string | null;
    latestPriceDate: string | null;
    /** Ticker symbol resolved during market signal computation (Path B or C). */
    ticker?: string | null;
    /** Annualized volatility % from Path B (null when MCP unavailable). */
    annualizedVolPct?: number | null;
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
    let resolvedTicker: string | null = null;
    let resolvedAnnualizedVolPct: number | null = null;
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
            const bundle = await stockBundle([neid], 90);
            const row = bundle?.bundles?.find((b) => b.neid === neid) ?? bundle?.bundles?.[0];
            const prices = Array.isArray(row?.ohlcv) ? row!.ohlcv : [];
            const closes = prices
                .map((p) => p.close)
                .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
            if (closes.length >= 5) {
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
                resolvedAnnualizedVolPct = annualizedVolPct;
                resolvedTicker = row?.instrument?.ticker ?? null;
                priceCount = closes.length;
                earliestPriceDate = prices[0]?.date ?? null;
                latestPriceDate = prices[prices.length - 1]?.date ?? null;
                score = clampScore(
                    35 + Math.max(0, -returnPct) * 1.4 + Math.max(0, annualizedVolPct - 22)
                );
                metrics.push({ label: '30-90d return', value: `${returnPct.toFixed(1)}%` });
                metrics.push({ label: 'Annualized vol', value: `${annualizedVolPct.toFixed(1)}%` });
                if (resolvedTicker) metrics.push({ label: 'Ticker', value: resolvedTicker });
                findings.push({
                    text: `${resolvedTicker || neid} market series returned ${closes.length} bars with ${returnPct >= 0 ? 'gain' : 'drawdown'} ${Math.abs(returnPct).toFixed(1)}%.`,
                    date: latestPriceDate || undefined,
                    citations: [],
                });
            }
        } catch (error) {
            console.warn('[market signal] stock-bundle path failed', error);
        }
    }

    const result: MarketResult = {
        score,
        hasRealData,
        priceCount,
        earliestPriceDate,
        latestPriceDate,
        ticker: resolvedTicker,
        annualizedVolPct: resolvedAnnualizedVolPct,
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
