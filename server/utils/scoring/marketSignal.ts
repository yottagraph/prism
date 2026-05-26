import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { extractNumeric, getPropertyValues, getSchema, normalizePidMap } from './elemental';
import { clampScore } from './hash';

interface MarketResult {
    score: number;
    hasRealData: boolean;
    metrics: Array<{ label: string; value: string }>;
    evidence: string[];
}

export async function computeMarketSignalScore(
    event: H3Event,
    portfolioId: string,
    neid: string
): Promise<MarketResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'market');
    const cached = await readScoringCache<MarketResult>(event, cacheKey);
    if (cached) return cached;

    let score = 0;
    let hasRealData = false;
    const metrics: Array<{ label: string; value: string }> = [];
    const evidence: string[] = [];

    try {
        const schema = await getSchema();
        const pid = normalizePidMap(schema);
        const returnPid = pid.return_30d ?? pid.price_change_30d ?? pid.returns_30d;
        const volPid = pid.volatility_30d ?? pid.realized_volatility ?? pid.volatility;
        const rsiPid = pid.rsi_14 ?? pid.rsi;
        const anomalyPid = pid.market_anomaly ?? pid.anomaly_flag;
        const candidatePids = [returnPid, volPid, rsiPid, anomalyPid].filter(
            (v): v is number => typeof v === 'number'
        );

        if (candidatePids.length) {
            const values = await getPropertyValues([neid], candidatePids);
            const return30 = extractNumeric(values, returnPid ?? -1)[0];
            const vol30 = extractNumeric(values, volPid ?? -1)[0];
            const rsi = extractNumeric(values, rsiPid ?? -1)[0];
            const anomaly = extractNumeric(values, anomalyPid ?? -1)[0];

            if (
                [return30, vol30, rsi, anomaly].some((v) => typeof v === 'number' && Number.isFinite(v))
            ) {
                hasRealData = true;
                const drawdownRisk = typeof return30 === 'number' ? Math.max(0, -return30) * 1.5 : 6;
                const volRisk = typeof vol30 === 'number' ? Math.max(0, vol30 - 25) * 0.8 : 5;
                const rsiRisk =
                    typeof rsi === 'number' ? (rsi < 30 ? 10 : rsi > 70 ? 12 : 4) : 4;
                const anomalyRisk = typeof anomaly === 'number' ? Math.min(15, anomaly * 6) : 3;
                score = clampScore(35 + drawdownRisk + volRisk + rsiRisk + anomalyRisk);

                if (typeof return30 === 'number') metrics.push({ label: '30d return', value: `${return30.toFixed(1)}%` });
                if (typeof vol30 === 'number') metrics.push({ label: '30d volatility', value: `${vol30.toFixed(1)}%` });
                if (typeof rsi === 'number') metrics.push({ label: 'RSI (14)', value: `${rsi.toFixed(1)}` });
                if (typeof anomaly === 'number') metrics.push({ label: 'Anomaly flags', value: `${Math.round(anomaly)}` });

                evidence.push('Computed from Elemental market signal properties');
            }
        }
    } catch (error) {
        console.warn('[market signal] failed', error);
    }

    const result: MarketResult = {
        score,
        hasRealData,
        metrics: metrics.length ? metrics : [{ label: 'Status', value: 'Elemental data unavailable' }],
        evidence: evidence.length ? evidence : ['No market signals returned from Elemental sources'],
    };
    await writeScoringCache(event, cacheKey, result);
    return result;
}

