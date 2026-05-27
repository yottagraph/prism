import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { resolveRefs } from './citations';
import {
    extractPropertyFacts,
    getPropertyValues,
    getSchema,
    normalizePidMap,
} from './elemental';
import { clampScore } from './hash';
import type { EvidenceItem, LensDetail } from './types';

interface SolvencyResult {
    score: number;
    hasRealData: boolean;
    detail: LensDetail;
}

function formatMoney(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toFixed(0)}`;
}

function parseFactNumber(value: string | number): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function parseFactDate(value?: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
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
    const metrics: LensDetail['metrics'] = [];
    const findings: EvidenceItem[] = [];

    try {
        const schema = await getSchema(event);
        const pid = normalizePidMap(schema);
        const debtPid = pid.total_debt ?? pid['us_gaap:total_debt'];
        const ebitdaPid = pid.ebitda ?? pid['us_gaap:ebitda'];
        const marginPid = pid.operating_margin ?? pid['us_gaap:operating_margin'];
        const interestPid = pid.interest_expense ?? pid['us_gaap:interest_expense'];
        const assetsPid = pid.assets ?? pid.total_assets ?? pid['us_gaap:assets'];
        const liabilitiesPid = pid.liabilities ?? pid.total_liabilities ?? pid['us_gaap:liabilities'];
        const filingPid = pid.filing_date ?? pid.report_date;
        const candidatePids = [
            debtPid,
            ebitdaPid,
            marginPid,
            interestPid,
            assetsPid,
            liabilitiesPid,
            filingPid,
        ].filter((v): v is number => typeof v === 'number');

        if (candidatePids.length) {
            const values = await getPropertyValues([neid], candidatePids, true, event);
            const debtFacts = debtPid ? extractPropertyFacts(values, debtPid) : [];
            const ebitdaFacts = ebitdaPid ? extractPropertyFacts(values, ebitdaPid) : [];
            const marginFacts = marginPid ? extractPropertyFacts(values, marginPid) : [];
            const interestFacts = interestPid ? extractPropertyFacts(values, interestPid) : [];
            const assetsFacts = assetsPid ? extractPropertyFacts(values, assetsPid) : [];
            const liabilitiesFacts = liabilitiesPid ? extractPropertyFacts(values, liabilitiesPid) : [];
            const filingFacts = filingPid ? extractPropertyFacts(values, filingPid) : [];

            const debt = parseFactNumber(debtFacts[0]?.value ?? '');
            const ebitda = parseFactNumber(ebitdaFacts[0]?.value ?? '');
            const opMargin = parseFactNumber(marginFacts[0]?.value ?? '');
            const interest = parseFactNumber(interestFacts[0]?.value ?? '');
            const assets = parseFactNumber(assetsFacts[0]?.value ?? '');
            const liabilities = parseFactNumber(liabilitiesFacts[0]?.value ?? '');
            const filingDates = filingFacts
                .map((fact) => parseFactDate(fact.date ?? (typeof fact.value === 'string' ? fact.value : undefined)))
                .filter((d): d is Date => !!d);

            const leverage = debt && ebitda ? Math.max(0, debt / Math.max(1, ebitda)) : null;
            const coverage =
                ebitda && interest ? Math.max(0, ebitda / Math.max(1, interest)) : null;
            const liabilityRatio =
                assets && liabilities ? Math.max(0, liabilities / Math.max(1, assets)) : null;
            const freshestDays =
                filingDates.length > 0
                    ? Math.round(
                          (Date.now() - Math.max(...filingDates.map((d) => d.getTime()))) / 86_400_000
                      )
                    : null;

            if (
                leverage !== null ||
                coverage !== null ||
                liabilityRatio !== null ||
                opMargin !== undefined ||
                freshestDays !== null
            ) {
                hasRealData = true;
                let raw = 45;
                if (leverage !== null) raw += Math.min(35, leverage * 4);
                if (coverage !== null) raw += Math.max(-20, 12 - coverage * 3);
                if (liabilityRatio !== null) raw += Math.min(20, Math.max(0, liabilityRatio - 0.5) * 30);
                if (typeof opMargin === 'number') raw += opMargin < 0 ? 18 : opMargin < 8 ? 10 : 0;
                if (freshestDays !== null)
                    raw += Math.min(15, Math.max(0, freshestDays - 120) / 12);
                score = clampScore(raw);

                if (leverage !== null)
                    metrics.push({ label: 'Net Debt / EBITDA', value: `${leverage.toFixed(2)}x` });
                if (coverage !== null)
                    metrics.push({ label: 'Interest Coverage', value: `${coverage.toFixed(2)}x` });
                if (liabilityRatio !== null)
                    metrics.push({ label: 'Liabilities / Assets', value: `${(liabilityRatio * 100).toFixed(1)}%` });
                if (typeof opMargin === 'number')
                    metrics.push({ label: 'Operating Margin', value: `${opMargin.toFixed(1)}%` });
                if (freshestDays !== null)
                    metrics.push({ label: 'Latest filing age', value: `${freshestDays}d` });

                const refs = [
                    debtFacts[0]?.ref,
                    ebitdaFacts[0]?.ref,
                    marginFacts[0]?.ref,
                    interestFacts[0]?.ref,
                    assetsFacts[0]?.ref,
                    liabilitiesFacts[0]?.ref,
                    filingFacts[0]?.ref,
                ].filter((ref): ref is string => !!ref);
                const citationMap = await resolveRefs(refs, event);
                const citations = refs
                    .map((ref) => citationMap.get(ref))
                    .filter((citation): citation is NonNullable<typeof citation> => !!citation);

                if (leverage !== null && debt !== null && ebitda !== null) {
                    findings.push({
                        text: `Net debt to EBITDA is ${leverage.toFixed(2)}x based on debt of ${formatMoney(
                            debt
                        )} and EBITDA of ${formatMoney(ebitda)}.`,
                        date: debtFacts[0]?.date || ebitdaFacts[0]?.date,
                        citations,
                    });
                }
                if (coverage !== null && interest !== null && ebitda !== null) {
                    findings.push({
                        text: `Interest coverage is ${coverage.toFixed(2)}x using EBITDA ${formatMoney(
                            ebitda
                        )} against interest expense ${formatMoney(interest)}.`,
                        date: interestFacts[0]?.date || ebitdaFacts[0]?.date,
                        citations,
                    });
                }
                if (typeof opMargin === 'number') {
                    findings.push({
                        text: `Operating margin is ${opMargin.toFixed(
                            1
                        )}% in the latest available filing window.`,
                        date: marginFacts[0]?.date,
                        citations,
                    });
                }
                if (liabilityRatio !== null && assets !== null && liabilities !== null) {
                    findings.push({
                        text: `Liabilities are ${(liabilityRatio * 100).toFixed(
                            1
                        )}% of assets (${formatMoney(liabilities)} liabilities vs ${formatMoney(
                            assets
                        )} assets).`,
                        date: liabilitiesFacts[0]?.date || assetsFacts[0]?.date,
                        citations,
                    });
                }
            }
        }
    } catch (error) {
        console.warn('[solvency] failed', error);
    }

    const result: SolvencyResult = {
        score,
        hasRealData,
        detail: {
            metrics: metrics.length
                ? metrics
                : [{ label: 'Status', value: 'Elemental solvency data unavailable' }],
            findings: findings.length
                ? findings
                : [
                      {
                          text: 'No solvency fundamentals were returned for this entity.',
                          citations: [],
                      },
                  ],
        },
    };
    await writeScoringCache(event, cacheKey, result);
    return result;
}
