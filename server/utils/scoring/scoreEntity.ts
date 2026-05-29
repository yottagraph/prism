import type { H3Event } from 'h3';

import {
    confidence,
    deriveDriversFromLenses,
    detectConflicts,
    makeEntityRiskScore,
    DEFAULT_WEIGHTS,
} from './fuse';
import { computeAcsScore, type AcsFociData, type AcsJurisdictionHit } from './acs';
import type { FhsDistressEventCount } from './fhs';
import { computeCikVelocity } from './cikVelocity';
import { getContextPackage, type ContextPackage } from './contextPackage';
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
    searchEntitiesByName,
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
 * Look up `sector` / `industry` from the `financial_instrument` entity for a
 * given ticker symbol. The NASDAQ screener populates these with clean GICS-style
 * strings (e.g. "Technology", "Consumer Discretionary") on the instrument entity,
 * not on the org. We search for the instrument by ticker name, take the first hit,
 * and read its sector/industry properties.
 *
 * Returns the first non-empty value from sector → industry, or null.
 */
async function fetchInstrumentSectorByTicker(
    event: H3Event,
    ticker: string
): Promise<string | null> {
    try {
        const schema = await getSchema(event);
        const pid = normalizePidMap(schema);
        const instrPids = [pid.sector, pid.industry].filter(
            (p): p is string => typeof p === 'string' && p.length > 0
        );
        if (instrPids.length === 0) return null;

        // Search for the financial_instrument entity whose name is the ticker.
        // The Alpha Vantage pipeline names instruments by ticker (e.g. "GME" or
        // "GME stock"), so this reliably returns the right entity.
        const matches = await searchEntitiesByName(ticker, 3, event);
        if (!matches.length) return null;

        // Take the first match. For a bare ticker like "GME", the top result is
        // typically the equity instrument. Read sector/industry from it.
        const instrNeid = matches[0].neid;
        const instrValues = await getPropertyValues([instrNeid], instrPids, false, event);
        for (const p of instrPids) {
            const resolved = latestStringFact(extractPropertyFacts(instrValues, p));
            if (resolved) return resolved;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Resolve an entity's industry/sector string for the macro-regime overlay.
 *
 * Resolution order (first non-empty value wins):
 *   1. `sector` / `industry` on the `financial_instrument` reached via the
 *      ticker already resolved by the market signal lens — clean GICS-style
 *      strings from the NASDAQ screener (e.g. "Technology", "Consumer
 *      Discretionary"). This is the primary signal for public companies.
 *   2. `sector` / `industry` on instruments linked in the ContextPackage graph
 *      (for entities where `elemental_get_related` finds the link).
 *   3. `sic_description` on the `organization` — EDGAR SIC text, present for
 *      any SEC-registered issuer but absent for news-only org stubs.
 *   4. `sector` / `industry` directly on the `organization` — rarely populated.
 */
async function fetchEntityIndustry(
    event: H3Event,
    neid: string,
    ctx?: ContextPackage,
    marketTicker?: string | null
): Promise<string | null> {
    try {
        const schema = await getSchema(event);
        const pid = normalizePidMap(schema);

        // --- 1: ticker-based lookup (primary signal for public companies) ---
        if (marketTicker) {
            const instrSector = await fetchInstrumentSectorByTicker(event, marketTicker);
            if (instrSector) return instrSector;
        }

        // --- 2: graph-linked instruments from ContextPackage ---
        if (ctx && ctx.instruments.length > 0) {
            const instrPids = [pid.sector, pid.industry].filter(
                (p): p is string => typeof p === 'string' && p.length > 0
            );
            if (instrPids.length > 0) {
                // Try all linked instruments in one batch — all are financial_instruments
                // per the MCP call that populated ctx.instruments.
                const instrNeids = ctx.instruments.map((i) => i.neid).filter(Boolean) as string[];
                if (instrNeids.length > 0) {
                    const instrValues = await getPropertyValues(
                        instrNeids,
                        instrPids,
                        false,
                        event
                    );
                    for (const p of instrPids) {
                        const resolved = latestStringFact(extractPropertyFacts(instrValues, p));
                        if (resolved) return resolved;
                    }
                }
            }
        }

        // --- 3 & 4: org-level fallback ---
        const orgPids = [pid.sic_description, pid.sector, pid.industry].filter(
            (p): p is string => typeof p === 'string' && p.length > 0
        );
        if (orgPids.length === 0) return null;

        const orgValues = await getPropertyValues([neid], orgPids, false, event);
        for (const p of orgPids) {
            const resolved = latestStringFact(extractPropertyFacts(orgValues, p));
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
                leverageLatest: null,
                leveragePrevious: null,
                trendDirection: null,
                distressEventCounts: {
                    bankruptcy: 0,
                    delisting: 0,
                    nonReliance: 0,
                    triggering: 0,
                    impairment: 0,
                    termination: 0,
                },
                totalDistressEvents: 0,
                latestDistressDate: null,
                freshestFilingDays: null,
            }
        ),
        withTimeout(
            computeExecutiveScore(event, portfolioId, neid, ctx, resolvedScoring.ers),
            4_000,
            {
                score: 0,
                hasRealData: false,
                detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
                departures12m: 0,
                departures90d: 0,
                officerCount: 0,
                directorCount: 0,
                cSuiteCount: 0,
                cSuiteRoles: [],
                auditorChanges12m: 0,
                isSystemic: false,
                governanceFlags: [],
                keyPersonRisk: 'low',
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
            directMatchCount: 0,
            pathMatchCount: 0,
            graphNodesScreened: 0,
            foci: {
                foreignOwnershipPct: 0,
                foreignBoardPct: 0,
                foreignOfficerPct: 0,
                overallRisk: 'low' as const,
            },
            jurisdictionHits: [],
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
        withTimeout(computeNewsSummary24h(event, portfolioId, neid, ctx), 15_000, {
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
            mcpStatus: 'ok' as const,
            detail: { metrics: [{ label: 'Status', value: 'timeout' }], findings: [] },
        }),
    ]);

    const [fredSeriesCount, entityIndustry, auxCoverage] = await Promise.all([
        withTimeout(queryFredSeriesCount(event, neid), 3_000, 0),
        withTimeout(fetchEntityIndustry(event, neid, ctx, market.ticker), 3_000, null),
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

    // Collect per-lens warnings to surface in the scan-details panel.
    const warnings: string[] = [];
    const isTimeout = (lens: {
        hasRealData: boolean;
        detail: { metrics: Array<{ label: string; value: string | number | null }> };
    }) => !lens.hasRealData && lens.detail.metrics[0]?.value === 'timeout';

    if (isTimeout(solvency))
        warnings.push('FHS (solvency) timed out — SEC/FDIC data may be incomplete');
    if (isTimeout(executive))
        warnings.push('ERS (executive) timed out — leadership data may be incomplete');
    if (isTimeout(news)) warnings.push('News pressure score timed out');
    if (isTimeout(market))
        warnings.push('Stock prices unavailable — market MCP did not respond in time');
    if (isTimeout(eventPressure)) warnings.push('Event pressure timed out');
    if (isTimeout(cikVelocity)) warnings.push('CIK velocity (EDGAR) timed out');
    if (isTimeout(news24h)) warnings.push('24h news summary timed out');
    if (!news24h.hasRealData && !isTimeout(news24h))
        warnings.push('No article data found — entity may not be indexed for news');
    if (news24h.mentionRatioLabel === 'insufficient_data')
        warnings.push('News activity: low mention volume (<1 article/day avg over 30d)');
    if (isTimeout(polymarket)) warnings.push('Polymarket data timed out');

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
        warnings: warnings.length > 0 ? warnings : undefined,
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
            stockVolatility30d: market.annualizedVolPct ?? null,
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
            fhs: {
                leverageLatest: solvency.leverageLatest ?? null,
                leveragePrevious: solvency.leveragePrevious ?? null,
                trendDirection: solvency.trendDirection ?? null,
                distressEventCounts: solvency.distressEventCounts ?? {
                    bankruptcy: 0,
                    delisting: 0,
                    nonReliance: 0,
                    triggering: 0,
                    impairment: 0,
                    termination: 0,
                },
                totalDistressEvents: solvency.totalDistressEvents ?? 0,
                latestDistressDate: solvency.latestDistressDate ?? null,
                freshestFilingDays: solvency.freshestFilingDays ?? null,
            } as {
                leverageLatest: number | null;
                leveragePrevious: number | null;
                trendDirection: 'worsening' | 'stable' | 'improving' | null;
                distressEventCounts: FhsDistressEventCount;
                totalDistressEvents: number;
                latestDistressDate: string | null;
                freshestFilingDays: number | null;
            },
            ers: {
                departures12m: executive.departures12m ?? 0,
                departures90d: executive.departures90d ?? 0,
                officerCount: executive.officerCount ?? 0,
                directorCount: executive.directorCount ?? 0,
                cSuiteCount: executive.cSuiteCount ?? 0,
                cSuiteRoles: executive.cSuiteRoles ?? [],
                auditorChanges12m: executive.auditorChanges12m ?? 0,
                isSystemic: executive.isSystemic ?? false,
                governanceFlags: executive.governanceFlags ?? [],
                keyPersonRisk: executive.keyPersonRisk ?? 'low',
            } as {
                departures12m: number;
                departures90d: number;
                officerCount: number;
                directorCount: number;
                cSuiteCount: number;
                cSuiteRoles: string[];
                auditorChanges12m: number;
                isSystemic: boolean;
                governanceFlags: string[];
                keyPersonRisk: string;
            },
            acsDetail: {
                directMatchCount: acs.directMatchCount ?? 0,
                pathMatchCount: acs.pathMatchCount ?? 0,
                graphNodesScreened: acs.graphNodesScreened ?? 0,
                foci: acs.foci ?? {
                    foreignOwnershipPct: 0,
                    foreignBoardPct: 0,
                    foreignOfficerPct: 0,
                    overallRisk: 'low',
                },
                jurisdictionHits: acs.jurisdictionHits ?? [],
            } as {
                directMatchCount: number;
                pathMatchCount: number;
                graphNodesScreened: number;
                foci: AcsFociData;
                jurisdictionHits: AcsJurisdictionHit[];
            },
        },
    };
}
