import type { H3Event } from 'h3';
import type { SourceFusionWeights } from '~/server/utils/scoring/types';
import { pushActivity } from '~/server/utils/scoring/activity';
import { scoreEntity } from '~/server/utils/scoring/scoreEntity';
import { writeCoverage } from '~/server/utils/scoring/state';
import {
    getEntityName,
    searchEntitiesByName,
    searchEntitiesByNames,
} from '~/server/utils/scoring/elemental';

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
}

interface ScanDiagnostics {
    traceId: string;
    startedAt: number;
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

function makeTraceId() {
    return `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeDiagnostics(diag: ScanDiagnostics, total: number, done: number) {
    const finishedAt = Date.now();
    return {
        traceId: diag.traceId,
        startedAt: diag.startedAt,
        finishedAt,
        durationMs: finishedAt - diag.startedAt,
        totalEntities: total,
        processedEntities: done,
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

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const emit = (type: string, payload: unknown) => {
                controller.enqueue(
                    encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`)
                );
            };

            try {
                const entities = body.entities.map((entity) => ({ ...entity }));
                const total = entities.length;
                let done = 0;
                const output: any[] = Array.from({ length: total }).map(() => null);
                const coverage = { sec: 0, news: 0, stock: 0, poly: 0 };
                const diagnostics: ScanDiagnostics | null = diagnosticsEnabled
                    ? {
                          traceId: makeTraceId(),
                          startedAt: Date.now(),
                          resolution: {
                              mode: 'batch',
                              queriedNames: 0,
                              resolvedViaBatch: 0,
                              resolvedViaFallback: 0,
                          },
                          endpoints: {},
                          calls: [],
                      }
                    : null;
                if (diagnostics) {
                    (event.context as any).scanDiagnostics = diagnostics;
                }

                pushActivity({
                    portfolioId: body.portfolioId,
                    step: 'dialogue',
                    entity: body.portfolioId,
                    detail: `Scan requested for ${total} entities`,
                });

                const batchResolutions = await resolveEntitiesBatch(
                    event,
                    entities,
                    diagnostics || undefined
                );

                let cursor = 0;
                const workers = Math.min(8, Math.max(1, total));
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
                                        if (diagnostics)
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
                                    coverage: {
                                        sec: false,
                                        news: false,
                                        stock: false,
                                        poly: false,
                                    },
                                };
                                if (resolved.neid) {
                                    pushActivity({
                                        portfolioId: body.portfolioId,
                                        step: 'history',
                                        entity: resolved.resolvedName,
                                        detail: 'Fetching multi-source context',
                                    });
                                    const scored = await scoreEntity(
                                        event,
                                        body.portfolioId,
                                        resolved.neid,
                                        body.weights
                                    );
                                    pushActivity({
                                        portfolioId: body.portfolioId,
                                        step: 'query',
                                        entity: resolved.resolvedName,
                                        detail: `Scored fused risk ${scored.scores.fused}`,
                                    });
                                    result = { ...resolved, ...scored };
                                    coverage.sec += scored.coverage.sec ? 1 : 0;
                                    coverage.news += scored.coverage.news ? 1 : 0;
                                    coverage.stock += scored.coverage.stock ? 1 : 0;
                                    coverage.poly += scored.coverage.poly ? 1 : 0;
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
                                    coverage: {
                                        sec: false,
                                        news: false,
                                        stock: false,
                                        poly: false,
                                    },
                                    resolutionError: entityError?.message || 'Scoring failed',
                                };
                                output[idx] = failed;
                                emit('entity', { index: idx, entity: failed });
                            } finally {
                                done += 1;
                                emit('progress', { done, total });
                            }
                        }
                    })
                );

                writeCoverage(body.portfolioId, coverage);
                pushActivity({
                    portfolioId: body.portfolioId,
                    step: 'composition',
                    entity: body.portfolioId,
                    detail: `Scan complete (${done}/${total})`,
                });
                emit('done', {
                    entities: output,
                    coverage,
                    ...(diagnostics
                        ? { diagnostics: summarizeDiagnostics(diagnostics, total, done) }
                        : {}),
                });
                if (diagnostics) {
                    console.info(
                        '[scan diagnostics]',
                        JSON.stringify(summarizeDiagnostics(diagnostics, total, done))
                    );
                }
            } catch (error: any) {
                emit('error', { message: error?.message || 'Scan failed' });
            } finally {
                controller.close();
            }
        },
    });

    return sendStream(event, stream);
});
