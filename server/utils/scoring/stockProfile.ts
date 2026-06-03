import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { resolveRefs } from './citations';
import {
    extractPropertyFacts,
    getEntityName,
    getPropertyValues,
    getSchema,
    normalizePidMap,
    searchEntitiesByName,
    type ElementalPropertyFact,
} from './elemental';
import {
    anomalyScore,
    annualisedVol,
    atr,
    bollinger,
    classifyAnomalyType,
    dailyReturns,
    ema,
    fiftyTwoWeekHighLow,
    goldenDeathCross,
    macd,
    roc,
    rollingZscore,
    rsi,
    sma,
    trendSignal,
    volumeRatio,
} from './indicators';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import { scanFundamentals, stockBundle } from './prism';
import { buildStockNarrative } from './stockNarrative';
import type { CitationRef } from './types';
import {
    PREFIXED_TICKER_RE,
    BARE_TICKER_RE,
    ISIN_RE,
    parseInstrumentName,
    isEquityCandidate,
    rankInstrumentCandidates,
    tickerMatchScore,
    type RelatedInstrument,
} from './instruments';

export interface StockEntityProfile {
    neid: string;
    canonicalNeid: string | null;
    entityName: string;
    instrumentNeid: string | null;
    instrumentName: string | null;
    ticker: string | null;
    exchange: string | null;
    currency: string | null;
    sector: string | null;
    industry: string | null;
    latestClose: number | null;
    latestDate: string | null;
    returnPct: number | null;
    annualizedVolPct: number | null;
    periodHigh: number | null;
    periodLow: number | null;
    samples: number;
    analytics: {
        rsi14: number | null;
        macd: { macd: number; signal: number; histogram: number } | null;
        bollinger: { upper: number; middle: number; lower: number; percentB: number } | null;
        movingAverages: {
            sma20: number | null;
            sma50: number | null;
            sma200: number | null;
            ema12: number | null;
            ema26: number | null;
        };
        goldenCross: boolean;
        deathCross: boolean;
        atr14: number | null;
        roc10: number | null;
        annualisedVol20d: number | null;
        volumeRatio20d: number | null;
        fiftyTwoWeek: {
            high: number;
            low: number;
            daysSinceHigh: number;
            daysSinceLow: number;
        } | null;
        trend: 'bullish' | 'bearish' | 'neutral' | null;
        latestAnomaly: {
            returnZscore: number | null;
            volumeZscore: number | null;
            volatilityZscore: number | null;
            anomalyScore: number | null;
            anomalyType:
                | 'price_spike_up'
                | 'price_spike_down'
                | 'volume_surge'
                | 'high_volatility'
                | 'multi_signal'
                | null;
        } | null;
        recentAnomalies: Array<{
            priceDate: string;
            closePrice: number;
            dailyReturn: number | null;
            returnZscore: number | null;
            volumeZscore: number | null;
            volatilityZscore: number | null;
            anomalyScore: number;
            anomalyType:
                | 'price_spike_up'
                | 'price_spike_down'
                | 'volume_surge'
                | 'high_volatility'
                | 'multi_signal'
                | null;
        }>;
        narrative: string[];
    };
    fundamentals: {
        marketCap?: number;
        peRatio?: number;
        profitMargin?: number;
        roe?: number;
        roa?: number;
        debtToEquity?: number;
        dividendYield?: number;
        payoutRatio?: number;
        totalRevenue?: number;
        netIncome?: number;
        totalAssets?: number;
        totalLiabilities?: number;
        shareholdersEquity?: number;
        sharesOutstanding?: number;
        publicFloat?: number;
        employees?: number;
        longTermDebt?: number;
        epsBasic?: number;
        epsDiluted?: number;
        dividendsCommon?: number;
        grossProfit?: number;
        operatingCashFlow?: number;
        citations: CitationRef[];
    };
    prices: Array<{
        date: string;
        close: number;
        open?: number;
        high?: number;
        low?: number;
        volume?: number;
    }>;
    technical: Array<{ label: string; value: string }>;
    keyMetrics: Array<{ label: string; value: string }>;
    relatedInstruments: Array<{ neid: string; name: string }>;
    dataGaps: string[];
    citations: CitationRef[];
}

function pickLatestStringFact(facts: ElementalPropertyFact[]): string | null {
    if (!facts.length) return null;
    const sorted = [...facts].sort((a, b) => {
        const ad = a.date ? Date.parse(a.date) : 0;
        const bd = b.date ? Date.parse(b.date) : 0;
        return bd - ad;
    });
    const v = sorted[0]?.value;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function pickLatestNumericFact(facts: ElementalPropertyFact[]): number | null {
    if (!facts.length) return null;
    const sorted = [...facts].sort((a, b) => {
        const ad = a.date ? Date.parse(a.date) : 0;
        const bd = b.date ? Date.parse(b.date) : 0;
        return bd - ad;
    });
    for (const fact of sorted) {
        const value = typeof fact.value === 'number' ? fact.value : Number(fact.value);
        if (Number.isFinite(value)) return value;
    }
    return null;
}

function firstPid(pidMap: Record<string, string>, ...candidates: string[]): string | undefined {
    for (const key of candidates) {
        if (pidMap[key]) return pidMap[key];
    }
    return undefined;
}

function stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

interface OhlcvRow {
    date: string;
    close: number;
    open?: number;
    high?: number;
    low?: number;
    volume?: number;
}

function toOhlcvRows(
    rows: Array<{
        date: string;
        open?: number;
        high?: number;
        low?: number;
        close: number;
        volume?: number;
    }>
): OhlcvRow[] {
    return rows
        .filter((r) => typeof r.close === 'number' && Number.isFinite(r.close) && r.close > 0)
        .map((r) => ({
            date: r.date,
            open: r.open,
            high: r.high,
            low: r.low,
            close: r.close,
            volume: r.volume,
        }))
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

function buildOhlcvSeries(values: {
    closes: ElementalPropertyFact[];
    opens: ElementalPropertyFact[];
    highs: ElementalPropertyFact[];
    lows: ElementalPropertyFact[];
    volumes: ElementalPropertyFact[];
}): OhlcvRow[] {
    const byDate = new Map<string, OhlcvRow>();
    const set = (
        bucket: 'close' | 'open' | 'high' | 'low' | 'volume',
        facts: ElementalPropertyFact[]
    ) => {
        for (const fact of facts) {
            const num = typeof fact.value === 'number' ? fact.value : Number(fact.value);
            if (!Number.isFinite(num)) continue;
            const date = fact.date;
            if (!date) continue;
            const row = byDate.get(date) || { date, close: 0 };
            (row as any)[bucket] = num;
            if (bucket === 'close') row.close = num;
            byDate.set(date, row);
        }
    };
    set('close', values.closes);
    set('open', values.opens);
    set('high', values.highs);
    set('low', values.lows);
    set('volume', values.volumes);

    return Array.from(byDate.values())
        .filter((row) => Number.isFinite(row.close) && row.close > 0)
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

async function fetchInstruments(neid: string, event: H3Event): Promise<RelatedInstrument[]> {
    try {
        const result = await callMcpTool(
            'elemental',
            'elemental_get_related',
            {
                entity_id: { id_type: 'neid', id: neid },
                related_flavor: 'financial_instrument',
                direction: 'both',
                limit: 25,
            },
            event
        );
        const structured = extractMcpStructuredContent<{
            relationships?: Array<{ neid?: string; name?: string; flavor?: string }>;
        }>(result);
        const rows = Array.isArray(structured?.relationships) ? structured.relationships : [];
        return rows
            .filter(
                (row): row is { neid: string; name: string; flavor?: string } =>
                    typeof row?.neid === 'string' && typeof row?.name === 'string'
            )
            .map((row) => ({ neid: row.neid, name: row.name, flavor: row.flavor }));
    } catch (error) {
        console.warn('[stock profile] elemental_get_related failed', error);
        return [];
    }
}

function buildCitation(
    sourceLabel: string,
    fact: ElementalPropertyFact | undefined
): CitationRef | null {
    if (!fact) return null;
    return {
        ref: fact.ref,
        source: sourceLabel,
        date: fact.date,
    };
}

export async function getStockEntityProfile(
    event: H3Event,
    portfolioId: string,
    neid: string,
    nameHint?: string
): Promise<StockEntityProfile> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'stock-profile-v4');
    const cached = await readScoringCache<StockEntityProfile>(event, cacheKey);
    if (cached) return cached;

    const dataGaps: string[] = [];
    const citations: CitationRef[] = [];

    // 1) Try to resolve the entity name. For orphan NEIDs the REST endpoint
    //    returns an empty string — in that case we fall back to the caller's
    //    nameHint (which the entity page passes in from the portfolio entry).
    let entityName = '';
    try {
        const resolved = await getEntityName(neid, event);
        entityName = resolved && resolved !== neid ? resolved : '';
    } catch {
        entityName = '';
    }
    if (!entityName && nameHint) entityName = nameHint;
    if (!entityName) entityName = neid;

    try {
        const stock = await stockBundle([neid], 500);
        const row = stock?.bundles?.find((b) => b.neid === neid) ?? stock?.bundles?.[0];
        if (row?.instrument) {
            const instrument = row.instrument;
            const series = toOhlcvRows(row.ohlcv ?? []).slice(-500);
            const closes = series.map((r) => r.close);
            const latestClose = closes.length ? closes[closes.length - 1] : null;
            const firstClose = closes.length ? closes[0] : null;
            const latestDate = series.length ? series[series.length - 1].date : null;
            const returnPct =
                firstClose && latestClose
                    ? ((latestClose - firstClose) / Math.max(firstClose, 1e-6)) * 100
                    : null;
            const rsi14 = rsi(closes, 14);
            const macdLatest = macd(closes);
            const bollingerLatest = bollinger(closes, 20, 2);
            const sma20 = sma(closes, 20);
            const sma50 = sma(closes, 50);
            const sma200 = sma(closes, 200);
            const ema12 = ema(closes, 12);
            const ema26 = ema(closes, 26);
            const crosses = goldenDeathCross(closes);
            const atr14 = atr(series, 14);
            const roc10 = roc(closes, 10);
            const annualisedVol20d = annualisedVol(closes, 20);
            const volumeRatio20d = volumeRatio(series, 20);
            const fiftyTwoWeek = fiftyTwoWeekHighLow(series, latestDate);
            const trend = trendSignal({
                latestClose,
                sma50,
                sma200,
                rsi14,
                macd: macdLatest,
            });
            const periodHigh = closes.length ? Math.max(...closes) : null;
            const periodLow = closes.length ? Math.min(...closes) : null;
            const annualizedVolPct = annualisedVol(
                closes,
                Math.min(20, Math.max(2, closes.length - 1))
            );
            const narrative = buildStockNarrative(
                instrument.ticker ?? null,
                {
                    rsi14,
                    trend,
                    macd: macdLatest,
                    annualisedVol20d,
                    volumeRatio20d,
                    fiftyTwoWeek,
                },
                {}
            );

            const fundamentalsRes = await scanFundamentals([neid], 540).catch(() => null);
            const fundamentals: Record<string, number> = {};
            const fundamentalRow =
                (
                    fundamentalsRes?.organizations as Array<Record<string, unknown>> | undefined
                )?.[0] ?? null;
            if (fundamentalRow && typeof fundamentalRow === 'object') {
                const values = (fundamentalRow.values ?? fundamentalRow.fundamentals) as
                    | Record<string, unknown>
                    | undefined;
                if (values && typeof values === 'object') {
                    for (const [k, v] of Object.entries(values)) {
                        if (typeof v === 'number' && Number.isFinite(v)) fundamentals[k] = v;
                    }
                }
            }

            const profile: StockEntityProfile = {
                neid,
                canonicalNeid: null,
                entityName,
                instrumentNeid: instrument.neid,
                instrumentName: instrument.name ?? null,
                ticker: instrument.ticker ?? null,
                exchange: instrument.exchange ?? null,
                currency: instrument.currency ?? null,
                sector: instrument.sector ?? null,
                industry: instrument.industry ?? null,
                latestClose,
                latestDate,
                returnPct,
                annualizedVolPct,
                periodHigh,
                periodLow,
                samples: closes.length,
                analytics: {
                    rsi14,
                    macd: macdLatest,
                    bollinger: bollingerLatest,
                    movingAverages: { sma20, sma50, sma200, ema12, ema26 },
                    goldenCross: crosses.goldenCross,
                    deathCross: crosses.deathCross,
                    atr14,
                    roc10,
                    annualisedVol20d,
                    volumeRatio20d,
                    fiftyTwoWeek,
                    trend,
                    latestAnomaly: null,
                    recentAnomalies: [],
                    narrative,
                },
                fundamentals: {
                    ...fundamentals,
                    citations: [],
                },
                prices: series.map((r) => ({
                    date: r.date,
                    close: r.close,
                    open: r.open,
                    high: r.high,
                    low: r.low,
                    volume: r.volume,
                })),
                technical: [],
                keyMetrics: [],
                relatedInstruments: [],
                dataGaps: [],
                citations: [],
            };
            await writeScoringCache(event, cacheKey, profile);
            return profile;
        }
    } catch (error) {
        console.warn('[stock profile] stock-bundle fast path failed', error);
    }

    // 2) Try to fetch related instruments using the stored NEID first.
    let activeNeid = neid;
    let canonicalNeid: string | null = null;
    let allInstruments = await fetchInstruments(activeNeid, event);

    // 3) If the stored NEID is orphaned (no name, no relationships) but we
    //    have a usable name hint, search for the canonical NEID and retry.
    //    This recovers portfolios that were seeded by older scans where the
    //    NEID may have been corrupted by the JS-Number int64 precision bug
    //    or otherwise pointed at a stub entity.
    const recoveryName = nameHint || (entityName !== neid ? entityName : '');
    if (allInstruments.length === 0 && recoveryName) {
        try {
            const matches = await searchEntitiesByName(recoveryName, 1, event);
            const candidate = matches[0]?.neid;
            if (candidate && candidate !== neid) {
                const retryInstruments = await fetchInstruments(candidate, event);
                if (retryInstruments.length > 0) {
                    canonicalNeid = candidate;
                    activeNeid = candidate;
                    allInstruments = retryInstruments;
                    if (matches[0]?.name) entityName = matches[0].name;
                    dataGaps.push(
                        `Stored NEID ${neid} is orphaned in Elemental; using canonical NEID ${candidate} resolved from "${recoveryName}". Re-scan the portfolio to refresh stored NEIDs.`
                    );
                }
            }
        } catch (error) {
            console.warn('[stock profile] canonical NEID recovery search failed', error);
        }
    }

    if (!allInstruments.length) {
        dataGaps.push('No related financial instruments returned by Elemental');
    }
    const ranked = rankInstrumentCandidates(allInstruments);
    const equityCandidates = ranked.filter((row) => isEquityCandidate(row.name));

    // Pick the equity candidate that actually has close_price history. The
    // graph often has *two* CCL-style entities — a pretty alias like
    // "NASDAQ:CCL" with no atomized prices, plus a bare-ticker entity ("CCL")
    // populated by the Alpha Vantage pipeline. Batch-probe close_price across
    // every equity candidate so we land on the one with real data instead of
    // picking the first match alphabetically.
    let primary: RelatedInstrument | null = null;
    let primaryClosePid: string | undefined;
    let primaryCloseProbe: Array<{ eid: string; close: number; date: string }> = [];
    try {
        const schema = await getSchema(event);
        const pidMap = normalizePidMap(schema);
        primaryClosePid = pidMap.close_price;
        if (primaryClosePid && equityCandidates.length > 0) {
            const probeNeids = equityCandidates.slice(0, 8).map((row) => row.neid);
            const probeRows = await getPropertyValues(probeNeids, [primaryClosePid], false, event);
            const countByEid = new Map<string, number>();
            for (const row of probeRows) {
                if (!row.eid) continue;
                if (String(row.pid) !== primaryClosePid) continue;
                if (typeof row.value !== 'number') continue;
                countByEid.set(row.eid, (countByEid.get(row.eid) || 0) + 1);
            }
            // Pick the best candidate. Among those with close_price data,
            // prefer the one whose ticker most closely matches the company name
            // (e.g. prefer "F" for Ford over "RIVN" even if RIVN has more rows).
            // Only fall back to pure row-count when name matching is a tie.
            primary =
                equityCandidates.slice().sort((a, b) => {
                    const countA = countByEid.get(a.neid) || 0;
                    const countB = countByEid.get(b.neid) || 0;
                    // Prefer candidates that actually have price data
                    const hasA = countA > 0 ? 1 : 0;
                    const hasB = countB > 0 ? 1 : 0;
                    if (hasA !== hasB) return hasB - hasA;
                    // Among equals, prefer the one whose ticker matches the company name
                    const { ticker: tA } = parseInstrumentName(a.name);
                    const { ticker: tB } = parseInstrumentName(b.name);
                    const scoreA = tickerMatchScore(tA, entityName);
                    const scoreB = tickerMatchScore(tB, entityName);
                    if (scoreA !== scoreB) return scoreB - scoreA;
                    // Final tiebreak: most price rows
                    return countB - countA;
                })[0] || null;
            // Build a tiny seed series from the probe so we can keep going
            // without a second roundtrip if there's data.
            if (primary && (countByEid.get(primary.neid) || 0) > 0) {
                primaryCloseProbe = probeRows
                    .filter(
                        (row) =>
                            row.eid === primary!.neid &&
                            String(row.pid) === primaryClosePid &&
                            typeof row.value === 'number'
                    )
                    .map((row) => ({
                        eid: String(row.eid),
                        close: row.value as number,
                        date: String((row as any).recorded_at || ''),
                    }));
            }
        }
    } catch (error) {
        console.warn('[stock profile] equity OHLCV probe failed', error);
    }
    if (!primary) primary = equityCandidates[0] || ranked[0] || null;

    let instrumentNeid = primary?.neid ?? null;
    let instrumentName = primary?.name ?? null;
    const { ticker: nameTicker, exchange: nameExchange } = parseInstrumentName(primary?.name || '');
    let ticker = nameTicker;
    let exchange = nameExchange;
    let currency: string | null = null;
    let sector: string | null = null;
    let industry: string | null = null;
    let fullSeries: OhlcvRow[] = [];
    let series: OhlcvRow[] = [];
    const fundamentalMetrics: Omit<StockEntityProfile['fundamentals'], 'citations'> = {};
    const fundamentalCitations: CitationRef[] = [];

    if (instrumentNeid) {
        try {
            const schema = await getSchema(event);
            const pid = normalizePidMap(schema);
            const identityPids = [
                pid.ticker_symbol,
                pid.exchange,
                pid.currency,
                pid.sector,
                pid.industry,
                pid.company_name,
            ].filter((value): value is string => typeof value === 'string' && value.length > 0);
            const ohlcvPids = [
                pid.close_price,
                pid.open_price,
                pid.high_price,
                pid.low_price,
                pid.trading_volume,
            ].filter((value): value is string => typeof value === 'string' && value.length > 0);

            const wantPids = [...new Set([...identityPids, ...ohlcvPids])];
            if (wantPids.length === 0) {
                dataGaps.push('Stock property PIDs not in Elemental schema');
            } else {
                const values = await getPropertyValues([instrumentNeid], wantPids, true, event);

                const tickerFacts = pid.ticker_symbol
                    ? extractPropertyFacts(values, pid.ticker_symbol)
                    : [];
                const exchangeFacts = pid.exchange
                    ? extractPropertyFacts(values, pid.exchange)
                    : [];
                const currencyFacts = pid.currency
                    ? extractPropertyFacts(values, pid.currency)
                    : [];
                const sectorFacts = pid.sector ? extractPropertyFacts(values, pid.sector) : [];
                const industryFacts = pid.industry
                    ? extractPropertyFacts(values, pid.industry)
                    : [];

                ticker = pickLatestStringFact(tickerFacts) ?? ticker;
                exchange = pickLatestStringFact(exchangeFacts) ?? exchange;
                currency = pickLatestStringFact(currencyFacts);
                sector = pickLatestStringFact(sectorFacts);
                industry = pickLatestStringFact(industryFacts);

                const ohlcv = buildOhlcvSeries({
                    closes: pid.close_price ? extractPropertyFacts(values, pid.close_price) : [],
                    opens: pid.open_price ? extractPropertyFacts(values, pid.open_price) : [],
                    highs: pid.high_price ? extractPropertyFacts(values, pid.high_price) : [],
                    lows: pid.low_price ? extractPropertyFacts(values, pid.low_price) : [],
                    volumes: pid.trading_volume
                        ? extractPropertyFacts(values, pid.trading_volume)
                        : [],
                });

                fullSeries = ohlcv;
                // Keep up to ~1 year of bars for the panel; server analytics can
                // compute over the full history while the UI only renders a window.
                series = ohlcv.slice(-500);

                const identityCites: Array<CitationRef | null> = [
                    buildCitation('Elemental · ticker', tickerFacts[0]),
                    buildCitation('Elemental · exchange', exchangeFacts[0]),
                    buildCitation('Elemental · currency', currencyFacts[0]),
                    buildCitation('Elemental · sector', sectorFacts[0]),
                    buildCitation('Elemental · industry', industryFacts[0]),
                ];

                const priceCloseFacts = pid.close_price
                    ? extractPropertyFacts(values, pid.close_price)
                    : [];
                if (priceCloseFacts.length > 0) {
                    const sortedCloses = [...priceCloseFacts].sort((a, b) => {
                        const ad = a.date ? Date.parse(a.date) : 0;
                        const bd = b.date ? Date.parse(b.date) : 0;
                        return bd - ad;
                    });
                    const latestClose = sortedCloses[0];
                    identityCites.push(
                        buildCitation('Elemental · close_price (latest)', latestClose)
                    );
                    const earliest = sortedCloses[sortedCloses.length - 1];
                    if (earliest) {
                        identityCites.push(
                            buildCitation('Elemental · close_price (history)', earliest)
                        );
                    }
                }

                const seenRefs = new Set<string>();
                identityCites.forEach((cite) => {
                    if (!cite) return;
                    const key = `${cite.source || ''}|${cite.ref || ''}|${cite.date || ''}`;
                    if (seenRefs.has(key)) return;
                    seenRefs.add(key);
                    citations.push(cite);
                });

                // Best-effort: enrich citations with display title/url if we have refs.
                const refs = citations
                    .map((cite) => cite.ref)
                    .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);
                if (refs.length > 0) {
                    try {
                        const map = await resolveRefs(refs, event);
                        for (let i = 0; i < citations.length; i++) {
                            const cite = citations[i];
                            if (!cite.ref) continue;
                            const resolved = map.get(cite.ref);
                            if (!resolved) continue;
                            citations[i] = {
                                ...cite,
                                title: cite.title || resolved.title,
                                url: cite.url || resolved.url,
                                source: cite.source || resolved.source,
                                date: cite.date || resolved.date,
                                snippet: cite.snippet || resolved.snippet,
                            };
                        }
                    } catch {
                        // ref resolution is best-effort; ignore failures.
                    }
                }
            }
        } catch (error) {
            console.warn('[stock profile] elemental property fetch failed', error);
            dataGaps.push('Elemental property fetch failed');
        }
    }

    // Fetch organization-level EDGAR fundamentals directly from the company NEID.
    // This complements instrument-level OHLCV and enables FSI-parity fundamentals
    // without relying on external finance APIs.
    try {
        const schema = await getSchema(event);
        const pid = normalizePidMap(schema);
        const pidByMetric = {
            totalRevenue: firstPid(pid, 'total_revenue', 'us_gaap:revenues', 'ifrs:revenue'),
            netIncome: firstPid(pid, 'net_income', 'us_gaap:net_income_loss', 'ifrs:profit_loss'),
            totalAssets: firstPid(pid, 'total_assets', 'assets', 'us_gaap:assets', 'ifrs:assets'),
            totalLiabilities: firstPid(
                pid,
                'total_liabilities',
                'liabilities',
                'us_gaap:liabilities',
                'ifrs:liabilities'
            ),
            shareholdersEquity: firstPid(
                pid,
                'shareholders_equity',
                'shareholders_equity',
                'us_gaap:stockholders_equity',
                'ifrs:equity'
            ),
            sharesOutstanding: firstPid(
                pid,
                'shares_outstanding',
                'dei:common_shares_outstanding',
                'us_gaap:common_shares_outstanding'
            ),
            epsBasic: firstPid(pid, 'eps_basic', 'us_gaap:eps_basic_xbrl'),
            epsDiluted: firstPid(pid, 'eps_diluted', 'us_gaap:eps_diluted_xbrl'),
            dividendsCommon: firstPid(pid, 'us_gaap:dividends_common'),
            grossProfit: firstPid(pid, 'us_gaap:gross_profit'),
            operatingCashFlow: firstPid(
                pid,
                'operating_cash_flow',
                'us_gaap:operating_cash_flow',
                'ifrs:operating_cash_flow'
            ),
            longTermDebt: firstPid(pid, 'long_term_debt', 'us_gaap:long_term_debt', 'total_debt'),
            publicFloat: firstPid(pid, 'dei:public_float'),
            employees: firstPid(pid, 'dei:number_of_employees'),
        } as const;

        const orgPids = Array.from(new Set(Object.values(pidByMetric).filter(Boolean) as string[]));
        if (orgPids.length > 0) {
            const orgValues = await getPropertyValues([activeNeid], orgPids, true, event);
            const metricFacts = {
                totalRevenue: pidByMetric.totalRevenue
                    ? extractPropertyFacts(orgValues, pidByMetric.totalRevenue)
                    : [],
                netIncome: pidByMetric.netIncome
                    ? extractPropertyFacts(orgValues, pidByMetric.netIncome)
                    : [],
                totalAssets: pidByMetric.totalAssets
                    ? extractPropertyFacts(orgValues, pidByMetric.totalAssets)
                    : [],
                totalLiabilities: pidByMetric.totalLiabilities
                    ? extractPropertyFacts(orgValues, pidByMetric.totalLiabilities)
                    : [],
                shareholdersEquity: pidByMetric.shareholdersEquity
                    ? extractPropertyFacts(orgValues, pidByMetric.shareholdersEquity)
                    : [],
                sharesOutstanding: pidByMetric.sharesOutstanding
                    ? extractPropertyFacts(orgValues, pidByMetric.sharesOutstanding)
                    : [],
                epsBasic: pidByMetric.epsBasic
                    ? extractPropertyFacts(orgValues, pidByMetric.epsBasic)
                    : [],
                epsDiluted: pidByMetric.epsDiluted
                    ? extractPropertyFacts(orgValues, pidByMetric.epsDiluted)
                    : [],
                dividendsCommon: pidByMetric.dividendsCommon
                    ? extractPropertyFacts(orgValues, pidByMetric.dividendsCommon)
                    : [],
                grossProfit: pidByMetric.grossProfit
                    ? extractPropertyFacts(orgValues, pidByMetric.grossProfit)
                    : [],
                operatingCashFlow: pidByMetric.operatingCashFlow
                    ? extractPropertyFacts(orgValues, pidByMetric.operatingCashFlow)
                    : [],
                longTermDebt: pidByMetric.longTermDebt
                    ? extractPropertyFacts(orgValues, pidByMetric.longTermDebt)
                    : [],
                publicFloat: pidByMetric.publicFloat
                    ? extractPropertyFacts(orgValues, pidByMetric.publicFloat)
                    : [],
                employees: pidByMetric.employees
                    ? extractPropertyFacts(orgValues, pidByMetric.employees)
                    : [],
            };

            const latestByMetric = {
                totalRevenue: pickLatestNumericFact(metricFacts.totalRevenue),
                netIncome: pickLatestNumericFact(metricFacts.netIncome),
                totalAssets: pickLatestNumericFact(metricFacts.totalAssets),
                totalLiabilities: pickLatestNumericFact(metricFacts.totalLiabilities),
                shareholdersEquity: pickLatestNumericFact(metricFacts.shareholdersEquity),
                sharesOutstanding: pickLatestNumericFact(metricFacts.sharesOutstanding),
                epsBasic: pickLatestNumericFact(metricFacts.epsBasic),
                epsDiluted: pickLatestNumericFact(metricFacts.epsDiluted),
                dividendsCommon: pickLatestNumericFact(metricFacts.dividendsCommon),
                grossProfit: pickLatestNumericFact(metricFacts.grossProfit),
                operatingCashFlow: pickLatestNumericFact(metricFacts.operatingCashFlow),
                longTermDebt: pickLatestNumericFact(metricFacts.longTermDebt),
                publicFloat: pickLatestNumericFact(metricFacts.publicFloat),
                employees: pickLatestNumericFact(metricFacts.employees),
            } as const;

            if (latestByMetric.totalRevenue != null)
                fundamentalMetrics.totalRevenue = latestByMetric.totalRevenue;
            if (latestByMetric.netIncome != null)
                fundamentalMetrics.netIncome = latestByMetric.netIncome;
            if (latestByMetric.totalAssets != null)
                fundamentalMetrics.totalAssets = latestByMetric.totalAssets;
            if (latestByMetric.totalLiabilities != null)
                fundamentalMetrics.totalLiabilities = latestByMetric.totalLiabilities;
            if (latestByMetric.shareholdersEquity != null)
                fundamentalMetrics.shareholdersEquity = latestByMetric.shareholdersEquity;
            if (latestByMetric.sharesOutstanding != null)
                fundamentalMetrics.sharesOutstanding = latestByMetric.sharesOutstanding;
            if (latestByMetric.epsBasic != null)
                fundamentalMetrics.epsBasic = latestByMetric.epsBasic;
            if (latestByMetric.epsDiluted != null)
                fundamentalMetrics.epsDiluted = latestByMetric.epsDiluted;
            if (latestByMetric.dividendsCommon != null)
                fundamentalMetrics.dividendsCommon = latestByMetric.dividendsCommon;
            if (latestByMetric.grossProfit != null)
                fundamentalMetrics.grossProfit = latestByMetric.grossProfit;
            if (latestByMetric.operatingCashFlow != null)
                fundamentalMetrics.operatingCashFlow = latestByMetric.operatingCashFlow;
            if (latestByMetric.longTermDebt != null)
                fundamentalMetrics.longTermDebt = latestByMetric.longTermDebt;
            if (latestByMetric.publicFloat != null)
                fundamentalMetrics.publicFloat = latestByMetric.publicFloat;
            if (latestByMetric.employees != null)
                fundamentalMetrics.employees = latestByMetric.employees;

            const citationRows: Array<[string, ElementalPropertyFact[]]> = [
                ['Elemental · total_revenue', metricFacts.totalRevenue],
                ['Elemental · net_income', metricFacts.netIncome],
                ['Elemental · total_assets', metricFacts.totalAssets],
                ['Elemental · total_liabilities', metricFacts.totalLiabilities],
                ['Elemental · shareholders_equity', metricFacts.shareholdersEquity],
                ['Elemental · shares_outstanding', metricFacts.sharesOutstanding],
                ['Elemental · eps_basic', metricFacts.epsBasic],
                ['Elemental · eps_diluted', metricFacts.epsDiluted],
                ['Elemental · dividends_common', metricFacts.dividendsCommon],
                ['Elemental · gross_profit', metricFacts.grossProfit],
                ['Elemental · operating_cash_flow', metricFacts.operatingCashFlow],
                ['Elemental · long_term_debt', metricFacts.longTermDebt],
                ['Elemental · public_float', metricFacts.publicFloat],
                ['Elemental · number_of_employees', metricFacts.employees],
            ];
            for (const [label, facts] of citationRows) {
                const cite = buildCitation(label, facts[0]);
                if (cite) fundamentalCitations.push(cite);
            }
        }
    } catch (error) {
        console.warn('[stock profile] organization fundamentals fetch failed', error);
        dataGaps.push('Organization fundamentals could not be loaded from Elemental');
    }

    const closes = series.map((row) => row.close);
    const fullCloses = (fullSeries.length ? fullSeries : series).map((row) => row.close);
    const analyticsSeries = fullSeries.length ? fullSeries : series;
    const latestClose = closes.length > 0 ? closes[closes.length - 1] : null;
    const latestDate = series.length > 0 ? series[series.length - 1].date : null;
    const firstClose = closes.length > 0 ? closes[0] : null;
    const returnPct =
        firstClose && latestClose
            ? ((latestClose - firstClose) / Math.max(firstClose, 1e-6)) * 100
            : null;
    const annualizedVolPct = annualisedVol(
        fullCloses,
        Math.min(20, Math.max(2, fullCloses.length - 1))
    );
    const periodHigh = closes.length > 0 ? Math.max(...closes) : null;
    const periodLow = closes.length > 0 ? Math.min(...closes) : null;
    const rsi14 = rsi(fullCloses, 14);
    const macdLatest = macd(fullCloses);
    const bollingerLatest = bollinger(fullCloses, 20, 2);
    const sma20 = sma(fullCloses, 20);
    const sma50 = sma(fullCloses, 50);
    const sma200 = sma(fullCloses, 200);
    const ema12 = ema(fullCloses, 12);
    const ema26 = ema(fullCloses, 26);
    const crosses = goldenDeathCross(fullCloses);
    const atr14 = atr(analyticsSeries, 14);
    const roc10 = roc(fullCloses, 10);
    const annualisedVol20d = annualisedVol(fullCloses, 20);
    const volumeRatio20d = volumeRatio(analyticsSeries, 20);
    const fiftyTwoWeek = fiftyTwoWeekHighLow(analyticsSeries, latestDate);
    const trend = trendSignal({
        latestClose,
        sma50,
        sma200,
        rsi14,
        macd: macdLatest,
    });
    const returnsSeries = dailyReturns(fullCloses);
    const volatilitySeries: Array<number | null> = new Array(fullCloses.length).fill(null);
    for (let i = 0; i < fullCloses.length; i++) {
        if (i < 20) continue;
        const window = returnsSeries.slice(i - 19, i + 1).filter((v): v is number => v != null);
        if (window.length < 20) continue;
        volatilitySeries[i] = window.length > 1 ? Math.sqrt(252) * stdDev(window) : null;
    }
    const volumeSeries = (fullSeries.length ? fullSeries : series).map((row) =>
        typeof row.volume === 'number' && row.volume >= 0 ? row.volume : null
    );
    const logVolumeSeries = volumeSeries.map((v) => (v == null ? null : Math.log1p(v)));
    const returnZscores = rollingZscore(returnsSeries, 252, 20);
    const volumeZscores = rollingZscore(logVolumeSeries, 252, 20);
    const volatilityZscores = rollingZscore(volatilitySeries, 252, 20);
    const anomalyRows = (fullSeries.length ? fullSeries : series).map((row, i) => {
        const returnZscore = returnZscores[i];
        const volumeZscore = volumeZscores[i];
        const volatilityZscore = volatilityZscores[i];
        const score = anomalyScore(returnZscore, volumeZscore, volatilityZscore);
        const anomalyType = classifyAnomalyType(returnZscore, volumeZscore, volatilityZscore, 2);
        return {
            priceDate: row.date,
            closePrice: row.close,
            dailyReturn: returnsSeries[i],
            returnZscore,
            volumeZscore,
            volatilityZscore,
            anomalyScore: score,
            anomalyType,
        };
    });
    const latestAnomalyRaw = anomalyRows.length ? anomalyRows[anomalyRows.length - 1] : null;
    const latestAnomaly = latestAnomalyRaw
        ? {
              returnZscore: latestAnomalyRaw.returnZscore,
              volumeZscore: latestAnomalyRaw.volumeZscore,
              volatilityZscore: latestAnomalyRaw.volatilityZscore,
              anomalyScore: latestAnomalyRaw.anomalyScore,
              anomalyType: latestAnomalyRaw.anomalyType,
          }
        : null;
    const recentAnomalies = anomalyRows
        .slice(-20)
        .filter((row) => row.anomalyScore >= 50)
        .sort((a, b) => b.anomalyScore - a.anomalyScore);

    const sharesOutstanding = fundamentalMetrics.sharesOutstanding;
    const epsForPe = fundamentalMetrics.epsDiluted ?? fundamentalMetrics.epsBasic;
    const totalRevenue = fundamentalMetrics.totalRevenue;
    const netIncome = fundamentalMetrics.netIncome;
    const totalAssets = fundamentalMetrics.totalAssets;
    const totalLiabilities = fundamentalMetrics.totalLiabilities;
    const shareholdersEquity = fundamentalMetrics.shareholdersEquity;

    const marketCap =
        latestClose != null && sharesOutstanding != null
            ? latestClose * sharesOutstanding
            : undefined;
    const peRatio =
        latestClose != null && epsForPe != null && epsForPe !== 0
            ? latestClose / epsForPe
            : undefined;
    const profitMargin =
        netIncome != null && totalRevenue != null && totalRevenue !== 0
            ? netIncome / totalRevenue
            : undefined;
    const roe =
        netIncome != null && shareholdersEquity != null && shareholdersEquity !== 0
            ? netIncome / shareholdersEquity
            : undefined;
    const roa =
        netIncome != null && totalAssets != null && totalAssets !== 0
            ? netIncome / totalAssets
            : undefined;
    const debtToEquity =
        totalLiabilities != null && shareholdersEquity != null && shareholdersEquity !== 0
            ? totalLiabilities / shareholdersEquity
            : undefined;
    const dividendYield =
        fundamentalMetrics.dividendsCommon != null && marketCap != null && marketCap !== 0
            ? fundamentalMetrics.dividendsCommon / marketCap
            : undefined;
    const payoutRatio =
        fundamentalMetrics.dividendsCommon != null && netIncome != null && netIncome !== 0
            ? fundamentalMetrics.dividendsCommon / netIncome
            : undefined;

    if (marketCap != null) fundamentalMetrics.marketCap = marketCap;
    if (peRatio != null) fundamentalMetrics.peRatio = peRatio;
    if (profitMargin != null) fundamentalMetrics.profitMargin = profitMargin;
    if (roe != null) fundamentalMetrics.roe = roe;
    if (roa != null) fundamentalMetrics.roa = roa;
    if (debtToEquity != null) fundamentalMetrics.debtToEquity = debtToEquity;
    if (dividendYield != null) fundamentalMetrics.dividendYield = dividendYield;
    if (payoutRatio != null) fundamentalMetrics.payoutRatio = payoutRatio;
    const narrative = buildStockNarrative(
        ticker,
        {
            rsi14,
            trend,
            macd: macdLatest,
            annualisedVol20d,
            volumeRatio20d,
            fiftyTwoWeek,
        },
        fundamentalMetrics
    );

    if (!ticker) dataGaps.push('Ticker symbol unavailable in Elemental property values');
    if (!instrumentNeid)
        dataGaps.push('No financial_instrument entity linked to this organization');
    if (closes.length === 0) dataGaps.push('No close_price history returned from Elemental');
    else if (closes.length < 5) dataGaps.push('Fewer than 5 close_price samples returned');

    const technical: Array<{ label: string; value: string }> = [];
    if (annualizedVolPct !== null)
        technical.push({
            label: 'Annualized Vol (window)',
            value: `${annualizedVolPct.toFixed(1)}%`,
        });
    if (typeof returnPct === 'number')
        technical.push({ label: 'Window Return', value: `${returnPct.toFixed(1)}%` });

    const keyMetrics: Array<{ label: string; value: string }> = [];
    if (latestClose !== null)
        keyMetrics.push({ label: 'Latest Close', value: `$${latestClose.toFixed(2)}` });
    if (periodHigh !== null)
        keyMetrics.push({ label: 'Period High', value: `$${periodHigh.toFixed(2)}` });
    if (periodLow !== null)
        keyMetrics.push({ label: 'Period Low', value: `$${periodLow.toFixed(2)}` });
    if (closes.length) keyMetrics.push({ label: 'Samples (window)', value: `${closes.length}` });
    if (sector) keyMetrics.push({ label: 'Sector', value: sector });
    if (industry) keyMetrics.push({ label: 'Industry', value: industry });
    if (fiftyTwoWeek?.high !== undefined)
        keyMetrics.push({ label: '52W High', value: `$${fiftyTwoWeek.high.toFixed(2)}` });
    if (fiftyTwoWeek?.low !== undefined)
        keyMetrics.push({ label: '52W Low', value: `$${fiftyTwoWeek.low.toFixed(2)}` });

    const uniqueFundamentalCitations = Array.from(
        new Map(
            fundamentalCitations.map((cite) => [
                `${cite.source || ''}|${cite.ref || ''}|${cite.date || ''}`,
                cite,
            ])
        ).values()
    );
    const fundamentalRefs = uniqueFundamentalCitations
        .map((cite) => cite.ref)
        .filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);
    if (fundamentalRefs.length > 0) {
        try {
            const map = await resolveRefs(fundamentalRefs, event);
            for (let i = 0; i < uniqueFundamentalCitations.length; i++) {
                const cite = uniqueFundamentalCitations[i];
                if (!cite.ref) continue;
                const resolved = map.get(cite.ref);
                if (!resolved) continue;
                uniqueFundamentalCitations[i] = {
                    ...cite,
                    title: cite.title || resolved.title,
                    url: cite.url || resolved.url,
                    source: cite.source || resolved.source,
                    date: cite.date || resolved.date,
                    snippet: cite.snippet || resolved.snippet,
                };
            }
        } catch {
            // fundamentals citation enrichment is best-effort.
        }
    }

    const profile: StockEntityProfile = {
        neid,
        canonicalNeid,
        entityName,
        instrumentNeid,
        instrumentName,
        ticker,
        exchange,
        currency,
        sector,
        industry,
        latestClose,
        latestDate,
        returnPct,
        annualizedVolPct,
        periodHigh,
        periodLow,
        samples: closes.length,
        analytics: {
            rsi14,
            macd: macdLatest,
            bollinger: bollingerLatest,
            movingAverages: {
                sma20,
                sma50,
                sma200,
                ema12,
                ema26,
            },
            goldenCross: crosses.goldenCross,
            deathCross: crosses.deathCross,
            atr14,
            roc10,
            annualisedVol20d,
            volumeRatio20d,
            fiftyTwoWeek,
            trend,
            latestAnomaly,
            recentAnomalies,
            narrative,
        },
        fundamentals: {
            ...fundamentalMetrics,
            citations: uniqueFundamentalCitations,
        },
        prices: series.map((row) => ({
            date: row.date,
            close: row.close,
            open: row.open,
            high: row.high,
            low: row.low,
            volume: row.volume,
        })),
        technical,
        keyMetrics,
        relatedInstruments: allInstruments
            .filter((row) => row.neid !== instrumentNeid)
            .slice(0, 8)
            .map((row) => ({ neid: row.neid, name: row.name })),
        dataGaps: Array.from(new Set(dataGaps)),
        citations,
    };

    await writeScoringCache(event, cacheKey, profile);
    return profile;
}
