import type { H3Event } from 'h3';

import { confidence, deriveDrivers, detectConflicts, makeEntityRiskScore, DEFAULT_WEIGHTS } from './fuse';
import { computeExecutiveScore } from './executive';
import { computeMarketSignalScore } from './marketSignal';
import { computeNewsPressureScore } from './newsPressure';
import { computeSolvencyScore } from './solvency';
import { readPreviousScore, writeLatestScore } from './state';
import type { ScoreComputationResult, SourceFusionWeights } from './types';

export async function scoreEntity(
    event: H3Event,
    portfolioId: string,
    neid: string,
    weights?: SourceFusionWeights
): Promise<ScoreComputationResult> {
    const [solvency, executive, news, market] = await Promise.all([
        computeSolvencyScore(event, portfolioId, neid),
        computeExecutiveScore(event, portfolioId, neid),
        computeNewsPressureScore(event, portfolioId, neid),
        computeMarketSignalScore(event, portfolioId, neid),
    ]);

    const previous = readPreviousScore(portfolioId, neid);
    const scores = makeEntityRiskScore(
        {
            solvency: solvency.score,
            executive: executive.score,
            news: news.score,
            market: market.score,
        },
        weights ?? DEFAULT_WEIGHTS,
        previous?.fused
    );
    writeLatestScore(portfolioId, neid, scores);

    return {
        scores,
        drivers: deriveDrivers(
            neid,
            {
                solvency: scores.solvency,
                executive: scores.executive,
                news: scores.news,
                market: scores.market,
            }
        ),
        conflicts: detectConflicts(scores),
        confidenceLevel: confidence(scores),
        coverage: {
            sec: solvency.hasRealData || executive.hasRealData,
            news: news.hasRealData,
            stock: market.hasRealData,
            poly: false,
        },
    };
}

