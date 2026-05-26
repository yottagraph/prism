import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import {
    extractDates,
    extractNumeric,
    getPropertyValues,
    getSchema,
    normalizePidMap,
} from './elemental';
import { clampScore } from './hash';

interface SolvencyResult {
    score: number;
    hasRealData: boolean;
    metrics: Array<{ label: string; value: string }>;
    evidence: string[];
}

export async function computeSolvencyScore(
    event: H3Event,
    portfolioId: string,
    neid: string
): Promise<SolvencyResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'solvency');
    const cached = await readScoringCache<SolvencyResult>(event, cacheKey);
    if (cached) return cached;

    let score = 0;
    let hasRealData = false;
    const metrics: Array<{ label: string; value: string }> = [];
    const evidence: string[] = [];

    try {
        const schema = await getSchema(event);
        const pid = normalizePidMap(schema);
        const candidatePids = [
            pid.total_debt,
            pid.ebitda,
            pid.operating_margin,
            pid.interest_expense,
            pid.assets,
            pid.liabilities,
            pid.report_date,
            pid.filing_date,
        ].filter((v): v is number => typeof v === 'number');

        if (candidatePids.length) {
            const values = await getPropertyValues([neid], candidatePids, true, event);
            const debt = extractNumeric(values, pid.total_debt ?? -1)[0];
            const ebitda = extractNumeric(values, pid.ebitda ?? -1)[0];
            const opMargin = extractNumeric(values, pid.operating_margin ?? -1)[0];
            const interest = extractNumeric(values, pid.interest_expense ?? -1)[0];
            const filings = extractDates(values, pid.filing_date ?? pid.report_date ?? -1);

            const leverage = debt && ebitda ? Math.max(0, debt / Math.max(1, ebitda)) : null;
            const coverage =
                ebitda && interest ? Math.max(0, ebitda / Math.max(1, interest)) : null;
            const freshestDays =
                filings.length > 0
                    ? Math.round(
                          (Date.now() - Math.max(...filings.map((d) => d.getTime()))) / 86_400_000
                      )
                    : null;

            if (
                leverage !== null ||
                coverage !== null ||
                opMargin !== undefined ||
                freshestDays !== null
            ) {
                hasRealData = true;
                let raw = 45;
                if (leverage !== null) raw += Math.min(35, leverage * 4);
                if (coverage !== null) raw += Math.max(-20, 12 - coverage * 3);
                if (typeof opMargin === 'number') raw += opMargin < 0 ? 18 : opMargin < 8 ? 10 : 0;
                if (freshestDays !== null)
                    raw += Math.min(15, Math.max(0, freshestDays - 120) / 12);
                score = clampScore(raw);

                if (leverage !== null)
                    metrics.push({ label: 'Net Debt / EBITDA', value: `${leverage.toFixed(2)}x` });
                if (coverage !== null)
                    metrics.push({ label: 'Interest Coverage', value: `${coverage.toFixed(2)}x` });
                if (typeof opMargin === 'number')
                    metrics.push({ label: 'Operating Margin', value: `${opMargin.toFixed(1)}%` });
                if (freshestDays !== null)
                    metrics.push({ label: 'Latest filing age', value: `${freshestDays}d` });

                evidence.push('Computed from Elemental fundamentals and filing timestamps');
            }
        }
    } catch (error) {
        console.warn('[solvency] failed', error);
    }

    const result: SolvencyResult = {
        score,
        hasRealData,
        metrics: metrics.length
            ? metrics
            : [{ label: 'Status', value: 'Elemental data unavailable' }],
        evidence: evidence.length
            ? evidence
            : ['No solvency metrics returned from Elemental sources'],
    };
    await writeScoringCache(event, cacheKey, result);
    return result;
}
