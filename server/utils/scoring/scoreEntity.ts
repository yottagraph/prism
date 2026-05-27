import type { H3Event } from 'h3';

import {
    confidence,
    deriveDriversFromLenses,
    detectConflicts,
    makeEntityRiskScore,
    DEFAULT_WEIGHTS,
} from './fuse';
import { computeAcsScore } from './acs';
import { computeCikVelocity } from './cikVelocity';
import { computeExecutiveScore } from './executive';
import { computeEventPressureScore } from './eventPressure';
import { computeMarketSignalScore } from './marketSignal';
import { computeNewsPressureScore } from './newsPressure';
import { computeNewsSummary24h } from './newsSummary24h';
import { computePolymarketOutlook } from './polymarketOutlook';
import { computeSignalAgreement } from './signalAgreement';
import { computeSolvencyScore } from './solvency';
import { readPreviousScore, writeLatestScore } from './state';
import type { ScoreComputationResult, SourceFusionWeights } from './types';

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(fallback), timeoutMs);
        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch(() => {
                clearTimeout(timer);
                resolve(fallback);
            });
    });
}

export async function scoreEntity(
    event: H3Event,
    portfolioId: string,
    neid: string,
    weights?: SourceFusionWeights
): Promise<ScoreComputationResult> {
    const [
        solvency,
        executive,
        news,
        market,
        acs,
        eventPressure,
        cikVelocity,
        news24h,
        polymarket,
    ] = await Promise.all([
        withTimeout(computeSolvencyScore(event, portfolioId, neid), 8_000, {
            score: 0,
            hasRealData: false,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
        withTimeout(computeExecutiveScore(event, portfolioId, neid), 8_000, {
            score: 0,
            hasRealData: false,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
        withTimeout(computeNewsPressureScore(event, portfolioId, neid), 6_000, {
            score: 0,
            hasRealData: false,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
        withTimeout(computeMarketSignalScore(event, portfolioId, neid), 6_000, {
            score: 0,
            hasRealData: false,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
        withTimeout(computeAcsScore(event, portfolioId, neid), 8_000, {
            score: 0,
            hasRealData: false,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
        withTimeout(computeEventPressureScore(event, portfolioId, neid), 6_000, {
            score: 0,
            hasRealData: false,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
        withTimeout(computeCikVelocity(event, portfolioId, neid), 6_000, {
            trend: null,
            qoqPct: null,
            latestMentions: null,
            prevMentions: null,
            latestQuarter: null,
            prevQuarter: null,
            avgMentions: null,
            avgDiffPct: null,
            divergenceScore: null,
            divergenceLabel: null,
            hasRealData: false,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
        withTimeout(computeNewsSummary24h(event, portfolioId, neid), 4_000, {
            headlineSummary: null,
            mentionRatioLabel: 'normal',
            mentionRatioToday: null,
            mentionDailyAvg30d: null,
            sentimentAvg30d: null,
            sentimentTrend: null,
            mentionVelocity: null,
            hasRealData: false,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
        withTimeout(computePolymarketOutlook(event, portfolioId, neid), 4_000, {
            outlook: null,
            outlookScore: null,
            marketCount: 0,
            positiveMarkets: 0,
            negativeMarkets: 0,
            markets: [],
            hasRealData: false,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
    ]);

    const previous = readPreviousScore(portfolioId, neid);
    const subs = {
        solvency: solvency.score,
        executive: executive.score,
        news: news.score,
        market: market.score,
        eventPressure: eventPressure.score,
        compliance: acs.score,
    };
    const scores = makeEntityRiskScore(subs, weights ?? DEFAULT_WEIGHTS, previous?.fused);
    writeLatestScore(portfolioId, neid, scores);

    const lensDetails = {
        solvency: solvency.detail,
        executive: executive.detail,
        news: news.detail,
        market: market.detail,
        eventPressure: eventPressure.detail,
        compliance: acs.detail,
    };

    const signalAgreement = computeSignalAgreement({
        sec: {
            available: solvency.hasRealData || executive.hasRealData,
            risky: solvency.score >= 50 || executive.score >= 50,
        },
        news: {
            available: news.hasRealData || news24h.hasRealData,
            risky:
                (news24h.sentimentAvg30d != null && news24h.sentimentAvg30d < -0.2) ||
                (news24h.mentionRatioToday != null && news24h.mentionRatioToday > 3),
        },
        stock: {
            available: market.hasRealData,
            risky: market.score >= 50,
        },
        risk: {
            available: true,
            risky: scores.fused >= 50,
        },
    });

    return {
        scores,
        drivers: deriveDriversFromLenses(lensDetails, subs),
        conflicts: detectConflicts({
            solvency: scores.solvency,
            executive: scores.executive,
            news: scores.news,
            market: scores.market,
        }),
        confidenceLevel: confidence(scores),
        coverage: {
            sec: solvency.hasRealData || executive.hasRealData,
            news: news.hasRealData || news24h.hasRealData,
            stock: market.hasRealData,
            poly: polymarket.hasRealData,
            acs: acs.hasRealData,
            eventPressure: eventPressure.hasRealData,
            velocity: cikVelocity.hasRealData,
            polymarket: polymarket.hasRealData,
        },
        lensDetails,
        monitor: {
            riskCategory: scores.fused >= 70 ? 'HIGH' : scores.fused >= 40 ? 'MEDIUM' : 'LOW',
            signalAgreement: signalAgreement.signalAgreement,
            sourcesAvailable: signalAgreement.sourcesAvailable,
            sourcesRisky: signalAgreement.sourcesRisky,
            signalSummary: signalAgreement.signalSummary,
            headlineSummary: news24h.headlineSummary,
            mentionRatioLabel: news24h.mentionRatioLabel,
            mentionRatioToday: news24h.mentionRatioToday,
            mentionDailyAvg30d: news24h.mentionDailyAvg30d,
            sentimentAvg30d: news24h.sentimentAvg30d,
            sentimentTrend: news24h.sentimentTrend,
            mentionVelocity: news24h.mentionVelocity,
            stockPrice: null,
            stockChangePercent: null,
            stockChange30dPercent: null,
            stockTrendSignal:
                market.score >= 60 ? 'bearish' : market.score >= 40 ? 'neutral' : 'bullish',
            stockRsiSignal:
                market.detail.metrics.find((metric) => metric.label.toLowerCase().includes('rsi'))
                    ?.value ?? null,
            stockMacdSignal: null,
            stockVolatility30d: null,
            edgarTrend: cikVelocity.trend,
            edgarQoqPct: cikVelocity.qoqPct,
            edgarLatestMentions: cikVelocity.latestMentions,
            edgarPrevMentions: cikVelocity.prevMentions,
            edgarLatestQuarter: cikVelocity.latestQuarter,
            edgarPrevQuarter: cikVelocity.prevQuarter,
            edgarAvgMentions: cikVelocity.avgMentions,
            edgarAvgDiffPct: cikVelocity.avgDiffPct,
            edgarDivergenceScore: cikVelocity.divergenceScore,
            edgarDivergenceLabel: cikVelocity.divergenceLabel,
            polymarketOutlook: polymarket.outlook,
            polymarketOutlookScore: polymarket.outlookScore,
            polymarketCount: polymarket.marketCount,
            polymarketPositiveMarkets: polymarket.positiveMarkets,
            polymarketNegativeMarkets: polymarket.negativeMarkets,
            polymarketMarkets: polymarket.markets,
        },
    };
}
