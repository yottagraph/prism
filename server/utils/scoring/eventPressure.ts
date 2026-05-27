import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { resolveRefs } from './citations';
import type { ContextEvent, ContextPackage } from './contextPackage';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import { clampScore } from './hash';
import type { EvidenceItem, LensDetail } from './types';

export interface EventPressureResult {
    score: number;
    hasRealData: boolean;
    detail: LensDetail;
}

const EVENT_WEIGHTS: Array<{ term: string; weight: number }> = [
    { term: 'BANKRUPTCY', weight: 28 },
    { term: 'DELIST', weight: 24 },
    { term: 'DEFAULT', weight: 22 },
    { term: 'AUDITOR', weight: 18 },
    { term: 'RESTRUCTUR', weight: 16 },
    { term: 'OFFICER', weight: 12 },
    { term: 'DIRECTOR', weight: 10 },
    { term: 'IMPAIR', weight: 12 },
];

function recencyMultiplier(date: string | undefined) {
    if (!date) return 0.55;
    const ts = Date.parse(date);
    if (!Number.isFinite(ts)) return 0.55;
    const days = Math.max(0, Math.round((Date.now() - ts) / 86_400_000));
    if (days <= 14) return 1;
    if (days <= 30) return 0.85;
    if (days <= 90) return 0.6;
    return 0.35;
}

function processContextEvents(contextEvents: ContextEvent[]) {
    const refs: string[] = [];
    const recentEventDates: number[] = [];
    const weightedEvents = contextEvents.map((ev) => {
        const eventType = ev.eventType.toUpperCase();
        const date = ev.date ?? '';
        const weight = EVENT_WEIGHTS.find((entry) => eventType.includes(entry.term))?.weight ?? 6;
        const multiplier = recencyMultiplier(date || undefined);
        if (date) {
            const ts = Date.parse(date);
            if (Number.isFinite(ts)) recentEventDates.push(ts);
        }
        if (ev.ref) refs.push(ev.ref);
        return { eventType, date, weight, value: weight * multiplier };
    });
    return { refs, recentEventDates, weightedEvents };
}

export async function computeEventPressureScore(
    event: H3Event,
    portfolioId: string,
    neid: string,
    ctx?: ContextPackage
): Promise<EventPressureResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'event-pressure');
    const cached = await readScoringCache<EventPressureResult>(event, cacheKey);
    if (cached) return cached;

    let score = 0;
    let hasRealData = false;
    const metrics: LensDetail['metrics'] = [];
    const findings: EvidenceItem[] = [];

    try {
        let contextEvents: ContextEvent[];
        if (ctx) {
            contextEvents = ctx.events;
        } else {
            const eventsResult = await callMcpTool(
                'elemental',
                'elemental_get_events',
                { entity_id: { id_type: 'neid', id: neid }, limit: 120 },
                event
            );
            const structured = extractMcpStructuredContent<{
                events?: Array<{
                    name?: string;
                    properties?: Record<string, { value?: unknown; ref?: string }>;
                }>;
            }>(eventsResult);
            const rawEvents = Array.isArray(structured?.events) ? structured.events : [];
            contextEvents = rawEvents.map((row) => ({
                eventType: String(
                    row?.properties?.event_type?.value ??
                        row?.properties?.category?.value ??
                        row?.name ??
                        ''
                ),
                date: row?.properties?.event_date?.value
                    ? String(row.properties.event_date.value)
                    : row?.properties?.date?.value
                      ? String(row.properties.date.value)
                      : null,
                description: row?.properties?.description?.value
                    ? String(row.properties.description.value)
                    : (row?.name ?? null),
                snippet: null,
                category: null,
                ref:
                    (row?.properties?.description?.ref ||
                        row?.properties?.event_type?.ref ||
                        row?.properties?.date?.ref) ??
                    null,
                raw: row as unknown as Record<string, unknown>,
            }));
        }
        if (contextEvents.length > 0) {
            hasRealData = true;
            const { refs, recentEventDates, weightedEvents } = processContextEvents(contextEvents);

            score = clampScore(20 + weightedEvents.reduce((sum, item) => sum + item.value, 0));
            const recent14dCount = recentEventDates.filter(
                (ts) => Date.now() - ts <= 14 * 86_400_000
            ).length;
            if (recent14dCount >= 5) score = clampScore(score + 40);
            else if (recent14dCount >= 3) score = clampScore(score + 25);

            metrics.push({ label: 'Events scanned', value: `${contextEvents.length}` });
            metrics.push({ label: 'Events (14d)', value: `${recent14dCount}` });
            const topType = weightedEvents.sort((a, b) => b.value - a.value)[0];
            if (topType) metrics.push({ label: 'Top pressure driver', value: topType.eventType });

            const citationMap = await resolveRefs(refs, event);
            findings.push(
                ...weightedEvents.slice(0, 5).map((item) => ({
                    text: `${item.eventType} event${item.date ? ` on ${item.date}` : ''} contributes ${item.value.toFixed(
                        1
                    )} pressure points.`,
                    date: item.date || undefined,
                    citations: refs
                        .map((ref) => citationMap.get(ref))
                        .filter((citation): citation is NonNullable<typeof citation> =>
                            Boolean(citation)
                        )
                        .slice(0, 2),
                }))
            );
        }
    } catch (error) {
        console.warn('[event pressure] failed', error);
    }

    const out: EventPressureResult = {
        score,
        hasRealData,
        detail: {
            metrics: metrics.length
                ? metrics
                : [{ label: 'Status', value: 'No event-pressure signals available' }],
            findings: findings.length
                ? findings
                : [
                      {
                          text: 'No event pressure signals were returned for this entity.',
                          citations: [],
                      },
                  ],
        },
    };
    await writeScoringCache(event, cacheKey, out, 6 * 60 * 60);
    return out;
}
