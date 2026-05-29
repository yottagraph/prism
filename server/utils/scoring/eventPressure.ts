import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { resolveRefs } from './citations';
import type { ContextEvent, ContextPackage } from './contextPackage';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import { clampScore } from './hash';
import type { EventPressureSettings, EvidenceItem, LensDetail } from './types';
import { DEFAULT_SCORING_SETTINGS, EVENT_SEVERITY_WEIGHTS } from './types';

export interface EventPressureResult {
    score: number;
    hasRealData: boolean;
    detail: LensDetail;
}

const TERM_TO_KEY: Array<{ term: string; key: keyof EventPressureSettings['typeWeights'] }> = [
    { term: 'BANKRUPTCY', key: 'bankruptcy' },
    { term: 'DELIST', key: 'delisting' },
    { term: 'DEFAULT', key: 'default' },
    { term: 'AUDITOR', key: 'auditor' },
    { term: 'RESTRUCTUR', key: 'restructuring' },
    { term: 'OFFICER', key: 'officer' },
    { term: 'DIRECTOR', key: 'director' },
    { term: 'IMPAIR', key: 'impairment' },
];

function recencyMultiplier(date: string | undefined, recency: EventPressureSettings['recency']) {
    if (!date) return recency.multNoDate;
    const ts = Date.parse(date);
    if (!Number.isFinite(ts)) return recency.multNoDate;
    const days = Math.max(0, Math.round((Date.now() - ts) / 86_400_000));
    if (days <= recency.daysFresh) return recency.multFresh;
    if (days <= recency.daysRecent) return recency.multRecent;
    if (days <= recency.daysModerate) return recency.multModerate;
    return recency.multStale;
}

function processContextEvents(contextEvents: ContextEvent[], settings: EventPressureSettings) {
    const refs: string[] = [];
    const recentEventDates: number[] = [];
    const weightedEvents = contextEvents.map((ev) => {
        const eventType = ev.eventType.toUpperCase();
        const date = ev.date ?? '';
        const match = TERM_TO_KEY.find((entry) => eventType.includes(entry.term));
        const weight = match
            ? EVENT_SEVERITY_WEIGHTS[settings.typeWeights[match.key]]
            : settings.defaultWeight;
        const multiplier = recencyMultiplier(date || undefined, settings.recency);
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
    ctx?: ContextPackage,
    settings?: EventPressureSettings
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
        const ep = settings ?? DEFAULT_SCORING_SETTINGS.events;
        if (contextEvents.length > 0) {
            hasRealData = true;
            const { refs, recentEventDates, weightedEvents } = processContextEvents(
                contextEvents,
                ep
            );

            score = clampScore(
                ep.baseOffset + weightedEvents.reduce((sum, item) => sum + item.value, 0)
            );
            const clusterWindowMs = ep.cluster.windowDays * 86_400_000;
            const recentClusterCount = recentEventDates.filter(
                (ts) => Date.now() - ts <= clusterWindowMs
            ).length;
            if (recentClusterCount >= ep.cluster.countHigh)
                score = clampScore(score + ep.cluster.bonusHigh);
            else if (recentClusterCount >= ep.cluster.countMedium)
                score = clampScore(score + ep.cluster.bonusMedium);

            metrics.push({ label: 'Events scanned', value: `${contextEvents.length}` });
            metrics.push({
                label: `Events (${ep.cluster.windowDays}d)`,
                value: `${recentClusterCount}`,
            });
            const topType = weightedEvents.sort((a, b) => b.value - a.value)[0];
            if (topType) metrics.push({ label: 'Top pressure driver', value: topType.eventType });

            const citationMap = await resolveRefs(refs, event, ctx);
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
