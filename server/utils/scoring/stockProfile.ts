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
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import type { CitationRef } from './types';

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

interface RelatedInstrument {
    neid: string;
    name: string;
    flavor?: string;
}

const PREFIXED_TICKER_RE = /^(NYSE|NASDAQ|AMEX|NYSEARCA|BATS|OTC):\s*([A-Z][A-Z0-9\-\.]*)$/i;
// Bare US equity tickers: 1-5 uppercase letters, optionally with a class suffix
// like BRK.B, BRK-B, EXE.O. Excludes pure digits and longer strings (ISINs are
// always 12 chars with two-letter country prefix, e.g. US693070AD69).
const BARE_TICKER_RE = /^\$?[A-Z]{1,5}(?:[.\-][A-Z]{1,2})?$/;
// ISIN/CUSIP detector to explicitly de-prioritise debt instruments.
const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

function parseInstrumentName(name: string): { ticker: string | null; exchange: string | null } {
    if (!name) return { ticker: null, exchange: null };
    const prefixed = name.match(PREFIXED_TICKER_RE);
    if (prefixed) return { exchange: prefixed[1].toUpperCase(), ticker: prefixed[2].toUpperCase() };
    if (BARE_TICKER_RE.test(name)) {
        return { exchange: null, ticker: name.replace(/^\$/, '').toUpperCase() };
    }
    return { ticker: null, exchange: null };
}

function isEquityCandidate(name: string): boolean {
    if (!name) return false;
    if (ISIN_RE.test(name)) return false;
    return PREFIXED_TICKER_RE.test(name) || BARE_TICKER_RE.test(name);
}

function rankInstrumentCandidates(items: RelatedInstrument[]): RelatedInstrument[] {
    // Equities first, then everything else. Within equities, prefer prefixed
    // names (NASDAQ:CCL) over bare tickers (CCL) — but we'll later probe both
    // for actual price data and choose whichever has OHLCV populated.
    return [...items].sort((a, b) => {
        const aEq = isEquityCandidate(a.name) ? 0 : 1;
        const bEq = isEquityCandidate(b.name) ? 0 : 1;
        if (aEq !== bEq) return aEq - bEq;
        const aPref = PREFIXED_TICKER_RE.test(a.name) ? 0 : 1;
        const bPref = PREFIXED_TICKER_RE.test(b.name) ? 0 : 1;
        return aPref - bPref;
    });
}

function computeAnnualizedVol(closes: number[]): number | null {
    if (closes.length < 3) return null;
    const dailyReturns: number[] = [];
    for (let i = 1; i < closes.length; i++) {
        const prev = closes[i - 1];
        if (!prev || !Number.isFinite(prev)) continue;
        dailyReturns.push((closes[i] - prev) / prev);
    }
    if (dailyReturns.length < 2) return null;
    const mean = dailyReturns.reduce((sum, value) => sum + value, 0) / dailyReturns.length;
    const variance =
        dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / dailyReturns.length;
    return Math.sqrt(variance) * Math.sqrt(252) * 100;
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

interface OhlcvRow {
    date: string;
    close: number;
    open?: number;
    high?: number;
    low?: number;
    volume?: number;
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
    const cacheKey = makeCacheKey(portfolioId, neid, 'stock-profile-v2');
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
            // Pick the candidate with the most close_price rows. Fall back to
            // first-in-ranking if every candidate is empty.
            primary =
                equityCandidates
                    .slice()
                    .sort(
                        (a, b) => (countByEid.get(b.neid) || 0) - (countByEid.get(a.neid) || 0)
                    )[0] || null;
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
    let series: OhlcvRow[] = [];

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

                // Trim to the most recent ~120 trading days for the panel.
                series = ohlcv.slice(-120);

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

    const closes = series.map((row) => row.close);
    const latestClose = closes.length > 0 ? closes[closes.length - 1] : null;
    const latestDate = series.length > 0 ? series[series.length - 1].date : null;
    const firstClose = closes.length > 0 ? closes[0] : null;
    const returnPct =
        firstClose && latestClose
            ? ((latestClose - firstClose) / Math.max(firstClose, 1e-6)) * 100
            : null;
    const annualizedVolPct = computeAnnualizedVol(closes);
    const periodHigh = closes.length > 0 ? Math.max(...closes) : null;
    const periodLow = closes.length > 0 ? Math.min(...closes) : null;

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
