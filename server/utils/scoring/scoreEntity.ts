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
import { getContextPackage } from './contextPackage';
import { computeExecutiveScore } from './executive';
import { computeEventPressureScore } from './eventPressure';
import { computeMarketSignalScore } from './marketSignal';
import { computeNewsPressureScore } from './newsPressure';
import { computeNewsSummary24h } from './newsSummary24h';
import { computePolymarketOutlook } from './polymarketOutlook';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import {
    getSchema,
    normalizePidMap,
    getPropertyValues,
    extractPropertyFacts,
    type ElementalPropertyFact,
} from './elemental';
import { computeSignalAgreement } from './signalAgreement';
import { computeSolvencyScore } from './solvency';
import { readPreviousScore, writeLatestScore } from './state';
import type { ScoringSettings, ScoreComputationResult, SourceCoverageDetail } from './types';
import { DEFAULT_SCORING_SETTINGS } from './types';

async function queryFredSeriesCount(event: H3Event, neid: string): Promise<number> {
    try {
        const result = await callMcpTool(
            'elemental',
            'elemental_get_related',
            {
                entity_id: { id_type: 'neid', id: neid },
                related_flavor: 'fred_series',
                relationship_types: ['appears_in_fred_series'],
                direction: 'outgoing',
                limit: 1,
            },
            event
        );
        const data = extractMcpStructuredContent<{ total?: number }>(result);
        return data?.total ?? 0;
    } catch {
        return 0;
    }
}

function latestStringFact(facts: ElementalPropertyFact[]): string | null {
    if (!facts.length) return null;
    const sorted = [...facts].sort((a, b) => {
        const ad = a.date ? Date.parse(a.date) : 0;
        const bd = b.date ? Date.parse(b.date) : 0;
        return bd - ad;
    });
    const v = sorted[0]?.value;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Resolve an entity's industry/sector string for the macro-regime overlay.
 *
 * Industry data lives in different datasets depending on coverage:
 *   • `sic_description` — EDGAR, a string on the `organization` flavor. Present
 *     for any SEC-registered issuer, so this is the broadest source for credit
 *     portfolios.
 *   • `sector` / `industry` — NASDAQ-screener strings on the linked
 *     `financial_instrument`; only present when stock data resolved.
 *
 * The previous implementation queried only the `industry` property (which is a
 * NASDAQ-screener field that is empty unless stock data is present), so books
 * without market coverage classified every entity as "unclassified". We now
 * prefer `sic_description` and fall back to the stock fields. Reads go through
 * the same PID-based property endpoint the rest of scoring uses.
 */
async function fetchEntityIndustry(event: H3Event, neid: string): Promise<string | null> {
    try {
        const schema = await getSchema(event);
        const pid = normalizePidMap(schema);
        const pids = [pid.sic_description, pid.sector, pid.industry].filter(
            (p): p is string => typeof p === 'string' && p.length > 0
        );
        if (pids.length === 0) return null;

        const values = await getPropertyValues([neid], pids, true, event);
        for (const p of pids) {
            const resolved = latestStringFact(extractPropertyFacts(values, p));
            if (resolved) return resolved;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Detect per-entity coverage from sources that aren't part of the core lens
 * fetches: OpenSanctions screening and FDIC bank data. Both write
 * source-specific properties onto the `organization` flavor, so a single
 * property-value read tells us whether the entity is present in each dataset.
 *   • Sanctions — `sanctions_topic` / `sanctioned` only appear on listed
 *     entities (OpenSanctions / OFAC / CSL), so any fact means a screening hit.
 *   • FDIC — `fdic_certificate_number` and the call-report metrics are
 *     bank-only markers (depository institutions).
 */
async function fetchAuxiliaryCoverage(
    event: H3Event,
    neid: string
): Promise<{ sanctions: boolean; fdic: boolean }> {
    try {
        const schema = await getSchema(event);
        const pid = normalizePidMap(schema);
        const sanctionsPids = ['sanctions_topic', 'sanctioned', 'sanctions_id']
            .map((n) => pid[n])
            .filter((p): p is string => typeof p === 'string' && p.length > 0);
        const fdicPids = [
            'fdic_certificate_number',
            'total_deposits',
            'net_interest_margin',
            'insured_deposits',
            'failure_date',
        ]
            .map((n) => pid[n])
            .filter((p): p is string => typeof p === 'string' && p.length > 0);
        const allPids = [...new Set([...sanctionsPids, ...fdicPids])];
        if (allPids.length === 0) return { sanctions: false, fdic: false };

        const values = await getPropertyValues([neid], allPids, true, event);
        const sanctions = sanctionsPids.some((p) => extractPropertyFacts(values, p).length > 0);
        const fdic = fdicPids.some((p) => extractPropertyFacts(values, p).length > 0);
        return { sanctions, fdic };
    } catch {
        return { sanctions: false, fdic: false };
    }
}

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
    scoring?: ScoringSettings
): Promise<ScoreComputationResult> {
    const resolvedScoring = scoring ?? DEFAULT_SCORING_SETTINGS;
    const ctx = await getContextPackage(event, neid);

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
        withTimeout(
            computeSolvencyScore(
                event,
                portfolioId,
                neid,
                ctx,
                resolvedScoring.fhs,
                resolvedScoring.fhs.distressEvents
            ),
            4_000,
            {
                score: 0,
                hasRealData: false,
                detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
            }
        ),
        withTimeout(
            computeExecutiveScore(event, portfolioId, neid, ctx, resolvedScoring.ers),
            4_000,
            {
                score: 0,
                hasRealData: false,
                detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
            }
        ),
        withTimeout(computeNewsPressureScore(event, portfolioId, neid, ctx), 3_000, {
            score: 0,
            hasRealData: false,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
        // The stocks MCP price pull (get_daily_stock_prices) routinely takes
        // 10s+ even when healthy, so a tight timeout silently zeroes out stock
        // coverage. Give it enough headroom to actually land.
        withTimeout(computeMarketSignalScore(event, portfolioId, neid, ctx), 15_000, {
            score: 0,
            hasRealData: false,
            priceCount: 0,
            earliestPriceDate: null,
            latestPriceDate: null,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
        withTimeout(computeAcsScore(event, portfolioId, neid, ctx, resolvedScoring.acs), 6_000, {
            score: 0,
            hasRealData: false,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
        withTimeout(
            computeEventPressureScore(event, portfolioId, neid, ctx, resolvedScoring.events),
            3_000,
            {
                score: 0,
                hasRealData: false,
                detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
            }
        ),
        withTimeout(computeCikVelocity(event, portfolioId, neid, ctx), 3_000, {
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
        withTimeout(computeNewsSummary24h(event, portfolioId, neid, ctx), 3_000, {
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
        withTimeout(computePolymarketOutlook(event, portfolioId, neid, ctx), 4_000, {
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

    const [fredSeriesCount, entityIndustry, auxCoverage] = await Promise.all([
        withTimeout(queryFredSeriesCount(event, neid), 3_000, 0),
        withTimeout(fetchEntityIndustry(event, neid), 3_000, null),
        withTimeout(fetchAuxiliaryCoverage(event, neid), 3_000, {
            sanctions: false,
            fdic: false,
        }),
    ]);

    // Ownership / GLEIF graph depth: beneficial owners, subsidiaries, plus the
    // governance links (officers, directors) that ownership-path screening walks.
    const ownershipLinks =
        ctx.ownership.length + ctx.subsidiaries.length + ctx.officers.length + ctx.directors.length;

    const previous = readPreviousScore(portfolioId, neid);
    const subs = {
        solvency: solvency.score,
        executive: executive.score,
        news: news.score,
        market: market.score,
        eventPressure: eventPressure.score,
        compliance: acs.score,
    };
    const scores = makeEntityRiskScore(
        subs,
        resolvedScoring.weights,
        previous?.fused,
        resolvedScoring.tiers
    );
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

    // --- Build per-entity coverage detail from ContextPackage + lens outputs ---

    // SEC filings: collect dates from all financial properties (each date-stamped
    // fact originates from a filing). Deduplicate to approximate unique filings.
    const allFinancialDates = new Set<string>();
    for (const facts of Object.values(ctx.financials)) {
        for (const f of facts) {
            const d = f.date ?? (typeof f.value === 'string' ? f.value : null);
            if (d && d.length >= 7) allFinancialDates.add(d);
        }
    }
    // Also pull dates from lens evidence when ctx.financials is sparse
    if (allFinancialDates.size === 0 && (solvency.hasRealData || executive.hasRealData)) {
        for (const finding of [...solvency.detail.findings, ...executive.detail.findings]) {
            if (finding.date) allFinancialDates.add(finding.date);
        }
    }
    const filingDates = [...allFinancialDates].sort();
    const filingCount = filingDates.length;

    const articleDates = ctx.articles
        .map((a) => a.publishedDate)
        .filter((d): d is string => d != null && d.length > 0)
        .sort();
    const eventDates = ctx.events
        .map((e) => e.date)
        .filter((d): d is string => d != null && d.length > 0)
        .sort();
    const allNewsDates = [...articleDates, ...eventDates].sort();

    // Stock readings: count ONLY actual market data points — daily price rows
    // from the stocks MCP (Path B) or scalar aggregates resolved from Elemental
    // (Path A). Linked instrument entities are tracked separately under
    // `instruments` so the coverage UI doesn't conflate "has tradeable tickers
    // in the graph" with "we actually retrieved prices".
    let stockReadings = market.priceCount;
    const stockEarliest = market.earliestPriceDate;
    const stockLatest = market.latestPriceDate;
    if (stockReadings === 0 && market.hasRealData) {
        // Path A yielded scalar aggregates (return_30d, vol, rsi) — count metrics
        stockReadings = market.detail.metrics.filter(
            (m) => m.value !== 'timeout' && m.value !== 'Elemental market data unavailable'
        ).length;
    }
    const stockInstruments = ctx.instruments.length;

    const coverageDetail: SourceCoverageDetail = {
        sec: {
            filings: filingCount,
            earliest: filingDates[0] ?? null,
            latest: filingDates[filingDates.length - 1] ?? null,
        },
        news: {
            articles: ctx.articles.length,
            events: ctx.events.length,
            earliest: allNewsDates[0] ?? null,
            latest: allNewsDates[allNewsDates.length - 1] ?? null,
        },
        stock: {
            readings: stockReadings,
            instruments: stockInstruments,
            earliest: stockEarliest,
            latest: stockLatest,
        },
        poly: {
            markets: polymarket.marketCount,
            active: polymarket.markets.filter((m) => m.active).length,
        },
        fred: { series: fredSeriesCount, earliest: null, latest: null },
        acs: acs.hasRealData,
        eventPressure: eventPressure.hasRealData,
        velocity: cikVelocity.hasRealData,
        sanctions: auxCoverage.sanctions,
        ownership: ownershipLinks,
        fdic: auxCoverage.fdic,
    };

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
        coverageDetail,
        coverage: {
            sec: solvency.hasRealData || executive.hasRealData,
            news: news.hasRealData || news24h.hasRealData,
            stock: market.hasRealData,
            poly: polymarket.hasRealData,
            acs: acs.hasRealData,
            eventPressure: eventPressure.hasRealData,
            velocity: cikVelocity.hasRealData,
            polymarket: polymarket.hasRealData,
            sanctions: auxCoverage.sanctions,
            ownership: ownershipLinks > 0,
            fdic: auxCoverage.fdic,
        },
        lensDetails,
        monitor: {
            riskCategory:
                scores.fused >= resolvedScoring.categoryBands.high
                    ? 'HIGH'
                    : scores.fused >= resolvedScoring.categoryBands.medium
                      ? 'MEDIUM'
                      : 'LOW',
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
            sector: entityIndustry,
            sanctions: acs.sanctions
                ? {
                      listed: true,
                      authority: acs.sanctions.programs[0] ?? null,
                      sector: acs.sanctions.sectors[0] ?? null,
                      topic: acs.sanctions.topics[0] ?? null,
                      since: acs.sanctions.startDate,
                      listId: acs.sanctions.listIds[0] ?? null,
                      url: acs.sanctions.sourceUrls[0] ?? null,
                  }
                : null,
        },
    };
}
