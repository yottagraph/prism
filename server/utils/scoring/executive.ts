import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { resolveRefs } from './citations';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import { clampScore } from './hash';
import type { EvidenceItem, LensDetail } from './types';

interface ExecutiveResult {
    score: number;
    hasRealData: boolean;
    detail: LensDetail;
}

export async function computeExecutiveScore(
    event: H3Event,
    portfolioId: string,
    neid: string
): Promise<ExecutiveResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'executive');
    const cached = await readScoringCache<ExecutiveResult>(event, cacheKey);
    if (cached) return cached;

    let score = 0;
    let hasRealData = false;
    const metrics: LensDetail['metrics'] = [];
    const findings: EvidenceItem[] = [];

    try {
        const relatedResult = await callMcpTool(
            'elemental',
            'elemental_get_related',
            {
                entity_id: { id_type: 'neid', id: neid },
                related_flavor: 'person',
                relationship_types: ['is_officer', 'is_director', 'board_member_of'],
                related_properties: ['title', 'departure_date', 'start_date'],
                direction: 'incoming',
                limit: 50,
            },
            event
        );
        const relatedStructured = extractMcpStructuredContent<{
            relationships?: Array<{
                name?: string;
                relationship_types?: string[];
                properties?: Record<string, { value?: unknown; ref?: string }>;
            }>;
        }>(relatedResult);
        const relationships = Array.isArray(relatedStructured?.relationships)
            ? relatedStructured.relationships
            : [];

        const eventsResult = await callMcpTool(
            'elemental',
            'elemental_get_events',
            {
                entity_id: { id_type: 'neid', id: neid },
                categories: ['Officer Change', 'Director Change', 'Auditor Change'],
                include_participants: true,
                limit: 20,
            },
            event
        );
        const eventsStructured = extractMcpStructuredContent<{
            events?: Array<{
                name?: string;
                properties?: Record<string, { value?: unknown; ref?: string }>;
            }>;
        }>(eventsResult);
        const governanceEvents = Array.isArray(eventsStructured?.events)
            ? eventsStructured.events
            : [];

        if (relationships.length || governanceEvents.length) {
            hasRealData = true;
            const departureCount = governanceEvents.length;
            const governanceLinks = relationships.length;
            const turnoverProxy =
                departureCount > 5 ? 28 : departureCount > 2 ? 18 : governanceLinks > 25 ? 12 : 5;
            score = clampScore(35 + turnoverProxy);
            metrics.push({ label: 'Governance links', value: `${governanceLinks}` });
            metrics.push({ label: 'Departure events', value: `${departureCount}` });
            metrics.push({ label: 'Turnover proxy', value: `${turnoverProxy}` });

            const refs = [
                ...relationships.flatMap((row) =>
                    Object.values(row.properties || {})
                        .map((prop) => prop?.ref)
                        .filter((ref): ref is string => typeof ref === 'string')
                ),
                ...governanceEvents.flatMap((row) =>
                    Object.values(row.properties || {})
                        .map((prop) => prop?.ref)
                        .filter((ref): ref is string => typeof ref === 'string')
                ),
            ];
            const citationMap = await resolveRefs(refs, event);

            governanceEvents.slice(0, 6).forEach((eventRow) => {
                const category = String(
                    eventRow?.properties?.category?.value || 'Governance event'
                );
                const eventDate = String(eventRow?.properties?.date?.value || '');
                const description = String(
                    eventRow?.properties?.description?.value || eventRow?.name || category
                );
                const eventRef =
                    eventRow?.properties?.description?.ref || eventRow?.properties?.date?.ref;
                const citation = eventRef ? citationMap.get(eventRef) : undefined;
                findings.push({
                    text: `${description} (${category})${eventDate ? ` on ${eventDate}` : ''}.`,
                    date: eventDate || undefined,
                    citations: citation ? [citation] : [],
                });
            });

            if (!findings.length) {
                relationships.slice(0, 6).forEach((person) => {
                    const title = String(person?.properties?.title?.value || 'executive');
                    const departureDate = String(person?.properties?.departure_date?.value || '');
                    const relationship =
                        (person?.relationship_types || []).join(', ') || 'governance role';
                    const refsForRow = Object.values(person.properties || {})
                        .map((prop) => prop?.ref)
                        .filter((ref): ref is string => typeof ref === 'string');
                    const citations = refsForRow
                        .map((ref) => citationMap.get(ref))
                        .filter((citation): citation is NonNullable<typeof citation> => !!citation);
                    findings.push({
                        text: `${person?.name || 'Unknown person'} is linked as ${title} (${relationship})${
                            departureDate ? ` with departure date ${departureDate}` : ''
                        }.`,
                        date: departureDate || undefined,
                        citations,
                    });
                });
            }
        }
    } catch (error) {
        console.warn('[executive] failed', error);
    }

    const result: ExecutiveResult = {
        score,
        hasRealData,
        detail: {
            metrics: metrics.length
                ? metrics
                : [{ label: 'Status', value: 'Elemental governance data unavailable' }],
            findings: findings.length
                ? findings
                : [
                      {
                          text: 'No executive departure or governance events were returned.',
                          citations: [],
                      },
                  ],
        },
    };
    await writeScoringCache(event, cacheKey, result);
    return result;
}
