import type { H3Event } from 'h3';

import { getStockEntityProfile } from './stockProfile';

export interface PortfolioStockTickerRow {
    neid: string;
    entityName: string;
    ticker: string | null;
    latestClose: number | null;
    latestDate: string | null;
    rsi14: number | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    trend: 'bullish' | 'bearish' | 'neutral' | null;
    anomalyScore: number | null;
    anomalyType:
        | 'price_spike_up'
        | 'price_spike_down'
        | 'volume_surge'
        | 'high_volatility'
        | 'multi_signal'
        | null;
    returnZscore: number | null;
    volumeZscore: number | null;
    volatilityZscore: number | null;
    samples: number;
}

export interface PortfolioStockAnomalyRow {
    neid: string;
    ticker: string | null;
    entityName: string;
    priceDate: string;
    closePrice: number | null;
    dailyReturn: number | null;
    anomalyScore: number;
    anomalyType:
        | 'price_spike_up'
        | 'price_spike_down'
        | 'volume_surge'
        | 'high_volatility'
        | 'multi_signal'
        | null;
    returnZscore: number | null;
    volumeZscore: number | null;
    volatilityZscore: number | null;
}

export interface PortfolioStockAnalytics {
    generatedAt: string;
    tickers: PortfolioStockTickerRow[];
    anomalies: PortfolioStockAnomalyRow[];
    totalAnomalyCount: number;
    summary: {
        tickersAnalyzed: number;
        bullishCount: number;
        bearishCount: number;
        neutralCount: number;
        anomaliesCount: number;
        oversoldCount: number;
        overboughtCount: number;
        rsiNeutralCount: number;
    };
    dataGaps: string[];
}

async function mapConcurrent<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const out = new Array<R>(items.length);
    let cursor = 0;
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (cursor < items.length) {
            const current = cursor++;
            out[current] = await fn(items[current], current);
        }
    });
    await Promise.all(workers);
    return out;
}

export async function buildPortfolioStockAnalytics(
    event: H3Event,
    portfolioId: string,
    entities: Array<{ neid: string; name: string }>
): Promise<PortfolioStockAnalytics> {
    if (!entities.length) {
        return {
            generatedAt: new Date().toISOString(),
            tickers: [],
            anomalies: [],
            totalAnomalyCount: 0,
            summary: {
                tickersAnalyzed: 0,
                bullishCount: 0,
                bearishCount: 0,
                neutralCount: 0,
                anomaliesCount: 0,
                oversoldCount: 0,
                overboughtCount: 0,
                rsiNeutralCount: 0,
            },
            dataGaps: [],
        };
    }

    const dataGaps: string[] = [];
    const profiles = await mapConcurrent(entities, 6, async (entity) => {
        try {
            return await getStockEntityProfile(event, portfolioId, entity.neid, entity.name);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'stock profile fetch failed';
            dataGaps.push(`${entity.name}: ${message}`);
            return null;
        }
    });

    const tickers: PortfolioStockTickerRow[] = [];
    const anomalies: PortfolioStockAnomalyRow[] = [];

    for (const profile of profiles) {
        if (!profile) continue;
        if (profile.samples < 30) {
            dataGaps.push(`${profile.entityName}: fewer than 30 close_price samples`);
            continue;
        }

        tickers.push({
            neid: profile.neid,
            entityName: profile.entityName,
            ticker: profile.ticker,
            latestClose: profile.latestClose,
            latestDate: profile.latestDate,
            rsi14: profile.analytics.rsi14,
            macd: profile.analytics.macd,
            sma20: profile.analytics.movingAverages.sma20,
            sma50: profile.analytics.movingAverages.sma50,
            sma200: profile.analytics.movingAverages.sma200,
            trend: profile.analytics.trend,
            anomalyScore: profile.analytics.latestAnomaly?.anomalyScore ?? null,
            anomalyType: profile.analytics.latestAnomaly?.anomalyType ?? null,
            returnZscore: profile.analytics.latestAnomaly?.returnZscore ?? null,
            volumeZscore: profile.analytics.latestAnomaly?.volumeZscore ?? null,
            volatilityZscore: profile.analytics.latestAnomaly?.volatilityZscore ?? null,
            samples: profile.samples,
        });

        for (const row of profile.analytics.recentAnomalies) {
            anomalies.push({
                neid: profile.neid,
                ticker: profile.ticker,
                entityName: profile.entityName,
                priceDate: row.priceDate,
                closePrice: row.closePrice,
                dailyReturn: row.dailyReturn,
                anomalyScore: row.anomalyScore,
                anomalyType: row.anomalyType,
                returnZscore: row.returnZscore,
                volumeZscore: row.volumeZscore,
                volatilityZscore: row.volatilityZscore,
            });
        }
    }

    anomalies.sort((a, b) => b.anomalyScore - a.anomalyScore);
    const topAnomalies = anomalies.slice(0, 20);
    const uniqueAnomalyDates = new Set(topAnomalies.map((row) => row.priceDate));

    const summary = {
        tickersAnalyzed: tickers.length,
        bullishCount: tickers.filter((row) => row.trend === 'bullish').length,
        bearishCount: tickers.filter((row) => row.trend === 'bearish').length,
        neutralCount: tickers.filter((row) => row.trend === 'neutral').length,
        anomaliesCount: uniqueAnomalyDates.size,
        oversoldCount: tickers.filter((row) => row.rsi14 != null && row.rsi14 < 30).length,
        overboughtCount: tickers.filter((row) => row.rsi14 != null && row.rsi14 > 70).length,
        rsiNeutralCount: tickers.filter(
            (row) => row.rsi14 != null && row.rsi14 >= 30 && row.rsi14 <= 70
        ).length,
    };

    return {
        generatedAt: new Date().toISOString(),
        tickers,
        anomalies: topAnomalies,
        totalAnomalyCount: anomalies.length,
        summary,
        dataGaps: Array.from(new Set(dataGaps)),
    };
}
