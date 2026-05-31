import type { H3Event } from 'h3';
import type {
    PortfolioCoverageDetail,
    ScoringSettings,
    SourceFusionWeights,
} from '~/server/utils/scoring/types';
import { requireAuth } from '~/server/utils/requireAuth';
import { DEFAULT_SCORING_SETTINGS } from '~/server/utils/scoring/types';
import { pushActivity } from '~/server/utils/scoring/activity';
import { isGalaxyEnabled, getPropertyQuadsForEntities } from '~/server/utils/scoring/galaxy';
import { getSchema, normalizePidMap } from '~/server/utils/scoring/elemental';
import { scoreEntity } from '~/server/utils/scoring/scoreEntity';
import { writeCoverage } from '~/server/utils/scoring/state';
import { resetPolymarketLogging } from '~/server/utils/scoring/polymarketOutlook';
import { resetMarketSignalDiagnostics } from '~/server/utils/scoring/marketSignal';
import { prewarmStocks, resetMcpBreakers } from '~/server/utils/scoring/mcpGateway';
import {
    getEntityName,
    searchEntitiesByName,
    searchEntitiesByNames,
} from '~/server/utils/scoring/elemental';
import { buildRelationshipUniverse } from '~/server/utils/scoring/relationships';
import type { GalaxyQuad } from '~/server/utils/scoring/galaxy';
import { getEntityProfile } from '~/server/utils/scoring/profile';

interface ScanEntityInput {
    inputName: string;
    resolvedName: string;
    neid: string | null;
}

interface ScanRequest {
    portfolioId: string;
    entities: ScanEntityInput[];
    force?: boolean;
    debugLogs?: boolean;
    weights?: SourceFusionWeights;
    scoring?: ScoringSettings;
}

interface ScanDiagnostics {
    traceId: string;
    startedAt: number;
    totalRequests: number;
    resolution: {
        mode: 'batch' | 'per_entity_fallback';
        queriedNames: number;
        resolvedViaBatch: number;
        resolvedViaFallback: number;
    };
    endpoints: Record<string, number>;
    calls: Array<{
        endpoint: string;
        method: 'GET' | 'POST';
        at: number;
        details?: Record<string, unknown>;
    }>;
}

function minDate(a: string | null, b: string | null): string | null {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
}

function maxDate(a: string | null, b: string | null): string | null {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
}

function emptyPortfolioCoverageDetail(): PortfolioCoverageDetail {
    return {
        sec: { entities: 0, filings: 0, earliest: null, latest: null },
        news: { entities: 0, articles: 0, events: 0, earliest: null, latest: null },
        stock: { entities: 0, readings: 0, instruments: 0, earliest: null, latest: null },
        poly: { entities: 0, markets: 0, active: 0 },
        fred: { entities: 0, series: 0, earliest: null, latest: null },
        acs: 0,
        eventPressure: 0,
        velocity: 0,
        sanctions: 0,
        ownership: { entities: 0, links: 0 },
        fdic: 0,
    };
}

function makeTraceId() {
    return `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeDiagnostics(diag: ScanDiagnostics, total: number, done: number) {
    const finishedAt = Date.now();
    const totalRequests = Object.values(diag.endpoints).reduce((a, b) => a + b, 0);
    return {
        traceId: diag.traceId,
        startedAt: diag.startedAt,
        finishedAt,
        durationMs: finishedAt - diag.startedAt,
        totalEntities: total,
        processedEntities: done,
        totalRequests,
        resolution: diag.resolution,
        endpointCallCounts: diag.endpoints,
        sampleCalls: diag.calls.slice(0, 40),
    };
}

async function resolveEntitiesBatch(
    event: H3Event,
    entities: ScanEntityInput[],
    diagnostics?: ScanDiagnostics
) {
    const unresolvedNames = Array.from(
        new Set(
            entities
                .filter((entity) => !entity.neid)
                .map((entity) => entity.inputName.trim())
                .filter(Boolean)
        )
    );
    if (diagnostics) diagnostics.resolution.queriedNames = unresolvedNames.length;
    if (!unresolvedNames.length) {
        return new Map<
            string,
            { neid: string | null; resolvedName: string; resolutionError?: string }
        >();
    }

    const resolvedByName = new Map<
        string,
        { neid: string | null; resolvedName: string; resolutionError?: string }
    >();

    try {
        const matchesByName = await searchEntitiesByNames(unresolvedNames, 1, event);
        unresolvedNames.forEach((name) => {
            const matches = matchesByName[name] ?? [];
            if (matches.length > 0) {
                resolvedByName.set(name, {
                    neid: matches[0].neid,
                    resolvedName: matches[0].name || name,
                });
                if (diagnostics) diagnostics.resolution.resolvedViaBatch += 1;
            } else {
                resolvedByName.set(name, {
                    neid: null,
                    resolvedName: name,
                    resolutionError: 'No match in knowledge graph',
                });
            }
        });
        return resolvedByName;
    } catch (error) {
        if (diagnostics) diagnostics.resolution.mode = 'per_entity_fallback';
        console.warn('[scan] batch entity resolution failed, falling back per entity', error);
        return resolvedByName;
    }
}

async function resolveEntity(
    event: H3Event,
    entity: ScanEntityInput
): Promise<ScanEntityInput & { resolutionError?: string }> {
    if (entity.neid) {
        try {
            const name = await getEntityName(entity.neid, event);
            return { ...entity, resolvedName: name || entity.resolvedName };
        } catch {
            return entity;
        }
    }
    try {
        const matches = await searchEntitiesByName(entity.inputName, 1, event);
        if (matches.length > 0) {
            return {
                ...entity,
                neid: matches[0].neid,
                resolvedName: matches[0].name || entity.inputName,
            };
        }
        return { ...entity, resolutionError: 'No match in knowledge graph' };
    } catch (error: any) {
        return { ...entity, resolutionError: error?.message || 'Resolution failed' };
    }
}

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const body = await readBody<ScanRequest>(event);
    if (!body?.portfolioId || !Array.isArray(body.entities)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'portfolioId and entities are required',
        });
    }

    setHeader(event, 'Content-Type', 'text/event-stream');
    setHeader(event, 'Cache-Control', 'no-cache');
    setHeader(event, 'Connection', 'keep-alive');
    const diagnosticsEnabled = !!body.debugLogs;
    (event.context as any).forceScoring = !!body.force;
    // Per-scan reset of the one-shot polymarket log suppression flags so a
    // fresh scan can re-emit its diagnostic warn/error if the same condition
    // recurs across scans.
    resetPolymarketLogging();
    resetMarketSignalDiagnostics();
    resetMcpBreakers();

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const emit = (type: string, payload: unknown) => {
                controller.enqueue(
                    encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`)
                );
            };

            // Keep the SSE connection alive across long scoring waves so
            // proxies and load balancers don't treat silence as a dead socket.
            // Comment frames (`: ping\n\n`) are ignored by parseScanSSEBlock.
            const keepalive = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': ping\n\n'));
                } catch {
                    // Stream already closed — interval will be cleared in finally.
                }
            }, 10_000);

            try {
                const entities = body.entities.map((entity) => ({ ...entity }));
                const total = entities.length;
                let done = 0;
                const output: any[] = Array.from({ length: total }).map(() => null);
                const coverage = { sec: 0, news: 0, stock: 0, poly: 0 };
                const coverageDetail = emptyPortfolioCoverageDetail();
                emit('status', {
                    phase: 'init',
                    message: `Initializing scan for ${total} entities`,
                });
                const diagnostics: ScanDiagnostics = {
                    traceId: makeTraceId(),
                    startedAt: Date.now(),
                    totalRequests: 0,
                    resolution: {
                        mode: 'batch',
                        queriedNames: 0,
                        resolvedViaBatch: 0,
                        resolvedViaFallback: 0,
                    },
                    endpoints: {},
                    calls: [],
                };
                (event.context as any).scanDiagnostics = diagnostics;

                pushActivity({
                    portfolioId: body.portfolioId,
                    step: 'dialogue',
                    entity: body.portfolioId,
                    detail: `Scan requested for ${total} entities`,
                });

                const batchResolutions = await resolveEntitiesBatch(event, entities, diagnostics);
                emit('status', {
                    phase: 'resolution',
                    message: `Resolved ${diagnostics.resolution.resolvedViaBatch}/${total} entities in batch lookup`,
                });

                // Warm the stocks MCP cache in the background. Cold symbols
                // exceed the gateway's 30s timeout (the server takes ~60s),
                // so these calls will mostly 502 on a cold cache — but they
                // still warm the upstream cache, so the market-signal lookups
                // below (and the next scan) resolve in seconds instead of
                // timing out. Fire-and-forget; never blocks the scan.
                // Cap at 15 names: the 5-slot stocks semaphore can't warm
                // more in parallel anyway, and excess queued calls would
                // compete with the live market-signal lens lookups.
                const PREWARM_CAP = 15;
                prewarmStocks(
                    entities
                        .slice(0, PREWARM_CAP)
                        .map(
                            (e) =>
                                e.resolvedName ||
                                batchResolutions.get(e.inputName.trim())?.resolvedName ||
                                e.inputName
                        ),
                    event
                );

                // --- Fast-mode: batch-fetch a few key PIDs across all entities ---
                const resolvedNeids = entities
                    .map((e) => {
                        if (e.neid) return e.neid;
                        const batch = batchResolutions.get(e.inputName.trim());
                        return batch?.neid ?? null;
                    })
                    .filter((n): n is string => Boolean(n));

                const galaxyAvailable = await isGalaxyEnabled(event);
                if (galaxyAvailable && resolvedNeids.length > 0) {
                    try {
                        const schema = await getSchema(event);
                        const pidMap = normalizePidMap(schema);
                        const fastPids: Record<string, string | undefined> = {
                            liabilities: pidMap.total_liabilities ?? pidMap.liabilities,
                            equity: pidMap.stockholders_equity ?? pidMap.shareholders_equity,
                            filingDate: pidMap.filing_date ?? pidMap.report_date,
                        };

                        const fastResults: Record<
                            string,
                            Record<string, string | number | null>
                        > = {};
                        const pidEntries = Object.entries(fastPids).filter(
                            (e): e is [string, string] => Boolean(e[1])
                        );

                        const FAST_BATCH_SIZE = 50;
                        for (const [label, pid] of pidEntries) {
                            for (let i = 0; i < resolvedNeids.length; i += FAST_BATCH_SIZE) {
                                const chunk = resolvedNeids.slice(i, i + FAST_BATCH_SIZE);
                                try {
                                    const quads = await getPropertyQuadsForEntities(pid, chunk);
                                    for (const q of quads) {
                                        if (!fastResults[q.source]) fastResults[q.source] = {};
                                        fastResults[q.source][label] = q.destination;
                                    }
                                } catch {
                                    // Non-critical — full scoring will fill in
                                }
                            }
                        }

                        entities.forEach((entity, idx) => {
                            const neid =
                                entity.neid ?? batchResolutions.get(entity.inputName.trim())?.neid;
                            if (!neid) return;
                            const fast = fastResults[neid];
                            const resolvedName =
                                entity.resolvedName ||
                                batchResolutions.get(entity.inputName.trim())?.resolvedName ||
                                entity.inputName;
                            emit('fast-row', {
                                index: idx,
                                neid,
                                resolvedName,
                                inputName: entity.inputName,
                                fast: fast ?? {},
                            });
                        });

                        emit('status', {
                            phase: 'fast-mode',
                            message: `Fast-mode batch complete for ${resolvedNeids.length} entities`,
                        });
                    } catch (err) {
                        console.warn(
                            '[scan] fast-mode batch failed, continuing with full scan',
                            err
                        );
                    }
                }

                let cursor = 0;
                // Per-server semaphores (elemental:10, stocks:5, polymarket:5)
                // protect upstreams — more workers just reduces idle waves.
                const workers = Math.min(6, Math.max(1, total));
                await Promise.all(
                    Array.from({ length: workers }, async () => {
                        while (cursor < total) {
                            const idx = cursor++;
                            const entity = entities[idx];
                            try {
                                let resolved: ScanEntityInput & { resolutionError?: string } =
                                    entity;
                                if (entity.neid) {
                                    resolved = await resolveEntity(event, entity);
                                } else {
                                    const batchResolved = batchResolutions.get(
                                        entity.inputName.trim()
                                    );
                                    if (batchResolved) {
                                        resolved = {
                                            ...entity,
                                            neid: batchResolved.neid,
                                            resolvedName: batchResolved.resolvedName,
                                            resolutionError: batchResolved.resolutionError,
                                        };
                                    } else {
                                        diagnostics.resolution.resolvedViaFallback += 1;
                                        resolved = await resolveEntity(event, entity);
                                    }
                                }
                                let result: any = {
                                    ...resolved,
                                    scores: null,
                                    drivers: [],
                                    conflicts: [],
                                    confidenceLevel: 'Low',
                                    monitor: null,
                                    coverage: {
                                        sec: false,
                                        news: false,
                                        stock: false,
                                        poly: false,
                                        acs: false,
                                        eventPressure: false,
                                        velocity: false,
                                        polymarket: false,
                                    },
                                };
                                if (resolved.neid) {
                                    emit('status', {
                                        phase: 'scoring',
                                        message: `Scoring ${resolved.resolvedName}`,
                                    });
                                    pushActivity({
                                        portfolioId: body.portfolioId,
                                        step: 'history',
                                        entity: resolved.resolvedName,
                                        detail: 'Fetching multi-source context',
                                    });
                                    const resolvedScoring: ScoringSettings = body.scoring
                                        ? { ...DEFAULT_SCORING_SETTINGS, ...body.scoring }
                                        : body.weights
                                          ? { ...DEFAULT_SCORING_SETTINGS, weights: body.weights }
                                          : DEFAULT_SCORING_SETTINGS;
                                    const scored = await scoreEntity(
                                        event,
                                        body.portfolioId,
                                        resolved.neid,
                                        resolvedScoring
                                    );
                                    pushActivity({
                                        portfolioId: body.portfolioId,
                                        step: 'query',
                                        entity: resolved.resolvedName,
                                        detail: `Scored fused risk ${scored.scores.fused}`,
                                    });
                                    if (scored.warnings?.length) {
                                        for (const w of scored.warnings) {
                                            emit('status', {
                                                phase: 'warning',
                                                message: `${resolved.resolvedName}: ${w}`,
                                            });
                                        }
                                    }
                                    result = { ...resolved, ...scored };
                                    coverage.sec += scored.coverage.sec ? 1 : 0;
                                    coverage.news += scored.coverage.news ? 1 : 0;
                                    coverage.stock += scored.coverage.stock ? 1 : 0;
                                    coverage.poly += scored.coverage.poly ? 1 : 0;

                                    const cd = scored.coverageDetail;
                                    if (cd.sec.filings > 0 || scored.coverage.sec) {
                                        coverageDetail.sec.entities++;
                                        coverageDetail.sec.filings += cd.sec.filings;
                                        coverageDetail.sec.earliest = minDate(
                                            coverageDetail.sec.earliest,
                                            cd.sec.earliest
                                        );
                                        coverageDetail.sec.latest = maxDate(
                                            coverageDetail.sec.latest,
                                            cd.sec.latest
                                        );
                                    }
                                    if (
                                        cd.news.articles > 0 ||
                                        cd.news.events > 0 ||
                                        scored.coverage.news
                                    ) {
                                        coverageDetail.news.entities++;
                                        coverageDetail.news.articles += cd.news.articles;
                                        coverageDetail.news.events += cd.news.events;
                                        coverageDetail.news.earliest = minDate(
                                            coverageDetail.news.earliest,
                                            cd.news.earliest
                                        );
                                        coverageDetail.news.latest = maxDate(
                                            coverageDetail.news.latest,
                                            cd.news.latest
                                        );
                                    }
                                    // Instruments accumulate independently of price
                                    // readings: an entity can have linked tickers in
                                    // the graph even when no prices were retrieved.
                                    coverageDetail.stock.instruments += cd.stock.instruments;
                                    if (cd.stock.readings > 0 || scored.coverage.stock) {
                                        coverageDetail.stock.entities++;
                                        coverageDetail.stock.readings += cd.stock.readings;
                                        coverageDetail.stock.earliest = minDate(
                                            coverageDetail.stock.earliest,
                                            cd.stock.earliest
                                        );
                                        coverageDetail.stock.latest = maxDate(
                                            coverageDetail.stock.latest,
                                            cd.stock.latest
                                        );
                                    }
                                    if (cd.poly.markets > 0) {
                                        coverageDetail.poly.entities++;
                                        coverageDetail.poly.markets += cd.poly.markets;
                                        coverageDetail.poly.active += cd.poly.active;
                                    }
                                    if (cd.fred.series > 0) {
                                        coverageDetail.fred.entities++;
                                        coverageDetail.fred.series += cd.fred.series;
                                        coverageDetail.fred.earliest = minDate(
                                            coverageDetail.fred.earliest,
                                            cd.fred.earliest
                                        );
                                        coverageDetail.fred.latest = maxDate(
                                            coverageDetail.fred.latest,
                                            cd.fred.latest
                                        );
                                    }
                                    if (cd.acs) coverageDetail.acs++;
                                    if (cd.eventPressure) coverageDetail.eventPressure++;
                                    if (cd.velocity) coverageDetail.velocity++;
                                    if (cd.sanctions) coverageDetail.sanctions++;
                                    if (cd.ownership > 0) {
                                        coverageDetail.ownership.entities++;
                                        coverageDetail.ownership.links += cd.ownership;
                                    }
                                    if (cd.fdic) coverageDetail.fdic++;
                                }
                                output[idx] = result;
                                emit('entity', { index: idx, entity: result });
                            } catch (entityError: any) {
                                const failed = {
                                    ...entity,
                                    scores: null,
                                    drivers: [],
                                    conflicts: [],
                                    confidenceLevel: 'Low',
                                    monitor: null,
                                    coverage: {
                                        sec: false,
                                        news: false,
                                        stock: false,
                                        poly: false,
                                        acs: false,
                                        eventPressure: false,
                                        velocity: false,
                                        polymarket: false,
                                    },
                                    resolutionError: entityError?.message || 'Scoring failed',
                                };
                                output[idx] = failed;
                                emit('entity', { index: idx, entity: failed });
                            } finally {
                                done += 1;
                                emit('progress', { done, total });
                                if (done === total || done % 5 === 0) {
                                    emit('status', {
                                        phase: 'progress',
                                        message: `Processed ${done}/${total} entities`,
                                    });
                                }
                            }
                        }
                    })
                );

                writeCoverage(body.portfolioId, coverage);
                const failedEntities = output.filter((entity) => entity?.resolutionError).length;
                pushActivity({
                    portfolioId: body.portfolioId,
                    step: 'composition',
                    entity: body.portfolioId,
                    detail: `Scan complete (${done}/${total})`,
                });
                emit('status', {
                    phase: 'complete',
                    message:
                        failedEntities > 0
                            ? `Scan complete with ${failedEntities} unresolved/scoring issues`
                            : `Scan complete (${done}/${total})`,
                });

                // Build relationship universe reusing Galaxy quads already fetched
                // during scoring — avoids a second round of getEntityQuads calls.
                const contextPackages = (event.context as any).__contextPackages as
                    | Map<string, Promise<any>>
                    | undefined;
                const preloadedQuads = new Map<string, GalaxyQuad[]>();
                if (contextPackages) {
                    for (const [neid, pkgPromise] of contextPackages) {
                        const pkg = await pkgPromise.catch(() => null);
                        if (pkg?.rawQuads?.length) preloadedQuads.set(neid, pkg.rawQuads);
                    }
                }
                const resolvedSeeds = output
                    .filter((e: any) => e?.neid)
                    .map((e: any) => ({ neid: e.neid as string, name: e.resolvedName }));
                let universe: Awaited<ReturnType<typeof buildRelationshipUniverse>> | null = null;
                if (resolvedSeeds.length > 0) {
                    try {
                        universe = await buildRelationshipUniverse(
                            event,
                            resolvedSeeds,
                            preloadedQuads
                        );
                    } catch (err) {
                        console.warn('[scan] relationship universe build failed', err);
                    }
                }

                const summary = summarizeDiagnostics(diagnostics, total, done);
                emit('done', {
                    entities: output,
                    coverage,
                    coverageDetail,
                    failedEntities,
                    universe,
                    ...(diagnosticsEnabled ? { diagnostics: summary } : {}),
                });
                if (diagnosticsEnabled) {
                    console.info('[scan diagnostics]', JSON.stringify(summary));
                }
                if (summary.totalRequests > 1000) {
                    console.warn(
                        `[scan] request budget exceeded: ${summary.totalRequests} requests for ${total} entities (threshold: 1000)`
                    );
                }

                // Pre-build entity profiles in parallel while the stream is still
                // open. Passes precomputed scoring so getEntityProfile skips
                // re-running scoreEntity. Client already has the done payload and
                // will see near-instant cache hits when it navigates to a profile.
                const profileEntities = output.filter((e: any) => e?.neid && e?.scores);
                if (profileEntities.length > 0) {
                    await Promise.allSettled(
                        profileEntities.map((e: any) =>
                            getEntityProfile(event, body.portfolioId, e.neid, e).catch(() => null)
                        )
                    );
                }
            } catch (error: any) {
                emit('status', { phase: 'error', message: error?.message || 'Scan failed' });
                emit('error', { message: error?.message || 'Scan failed' });
            } finally {
                clearInterval(keepalive);
                controller.close();
            }
        },
    });

    return sendStream(event, stream);
});
