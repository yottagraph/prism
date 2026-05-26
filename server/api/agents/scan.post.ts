import type { SourceFusionWeights } from '~/server/utils/scoring/types';
import { pushActivity } from '~/server/utils/scoring/activity';
import { scoreEntity } from '~/server/utils/scoring/scoreEntity';
import { writeCoverage } from '~/server/utils/scoring/state';
import { getEntityName, searchEntitiesByName } from '~/server/utils/scoring/elemental';

interface ScanEntityInput {
    inputName: string;
    resolvedName: string;
    neid: string | null;
}

interface ScanRequest {
    portfolioId: string;
    entities: ScanEntityInput[];
    force?: boolean;
    weights?: SourceFusionWeights;
}

async function resolveEntity(entity: ScanEntityInput): Promise<ScanEntityInput & { resolutionError?: string }> {
    if (entity.neid) {
        try {
            const name = await getEntityName(entity.neid);
            return { ...entity, resolvedName: name || entity.resolvedName };
        } catch {
            return entity;
        }
    }
    try {
        const matches = await searchEntitiesByName(entity.inputName, 1);
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

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const emit = (type: string, payload: unknown) => {
                controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`));
            };

            try {
                const entities = body.entities.map((entity) => ({ ...entity }));
                const total = entities.length;
                let done = 0;
                const output: any[] = Array.from({ length: total }).map(() => null);
                const coverage = { sec: 0, news: 0, stock: 0, poly: 0 };

                pushActivity({
                    portfolioId: body.portfolioId,
                    step: 'dialogue',
                    entity: body.portfolioId,
                    detail: `Scan requested for ${total} entities`,
                });

                let cursor = 0;
                const workers = Math.min(8, Math.max(1, total));
                await Promise.all(
                    Array.from({ length: workers }, async () => {
                        while (cursor < total) {
                            const idx = cursor++;
                            const entity = entities[idx];
                            try {
                                const resolved = await resolveEntity(entity);
                                let result: any = {
                                    ...resolved,
                                    scores: null,
                                    drivers: [],
                                    conflicts: [],
                                    confidenceLevel: 'Low',
                                    coverage: { sec: false, news: false, stock: false, poly: false },
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
                                    coverage: { sec: false, news: false, stock: false, poly: false },
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
                });
            } catch (error: any) {
                emit('error', { message: error?.message || 'Scan failed' });
            } finally {
                controller.close();
            }
        },
    });

    return sendStream(event, stream);
});

