import type { EntityRiskScore } from './types';

type SnapshotKey = string;

const latestScores = new Map<SnapshotKey, EntityRiskScore>();
const latestCoverage = new Map<
    string,
    { sec: number; news: number; stock: number; poly: number }
>();

function key(portfolioId: string, neid: string) {
    return `${portfolioId}:${neid}`;
}

export function readPreviousScore(portfolioId: string, neid: string): EntityRiskScore | null {
    return latestScores.get(key(portfolioId, neid)) ?? null;
}

export function writeLatestScore(portfolioId: string, neid: string, score: EntityRiskScore) {
    latestScores.set(key(portfolioId, neid), score);
}

export function writeCoverage(
    portfolioId: string,
    coverage: { sec: number; news: number; stock: number; poly: number }
) {
    latestCoverage.set(portfolioId, coverage);
}

export function readCoverage(portfolioId: string): {
    sec: number;
    news: number;
    stock: number;
    poly: number;
} {
    return latestCoverage.get(portfolioId) ?? { sec: 0, news: 0, stock: 0, poly: 0 };
}
