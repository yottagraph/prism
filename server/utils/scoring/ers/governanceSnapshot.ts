import type { H3Event } from 'h3';

import type { ContextPackage } from '../contextPackage';
import { callMcpTool, extractMcpStructuredContent } from '../mcpGateway';
import type { GovernanceSnapshot } from './types';

const C_SUITE_TERMS = [
    'CEO',
    'CFO',
    'CTO',
    'COO',
    'CMO',
    'CHIEF',
    'PRESIDENT',
    'PRINCIPAL EXECUTIVE',
    'PRINCIPAL FINANCIAL',
];

function parseDaysFromDate(value: string | undefined): number | null {
    if (!value) return null;
    const ts = Date.parse(value);
    if (!Number.isFinite(ts)) return null;
    return Math.max(0, Math.round((Date.now() - ts) / 86_400_000));
}

export async function buildGovernanceSnapshot(
    event: H3Event,
    neid: string,
    ctx?: ContextPackage
): Promise<GovernanceSnapshot & { references: string[] }> {
    let officerCount = 0;
    let directorCount = 0;
    const cSuiteRoles = new Set<string>();
    let departures90d = 0;
    let departures12m = 0;
    let auditorChanges12m = 0;
    const references: string[] = [];

    if (ctx) {
        officerCount = ctx.officers.length;
        directorCount = ctx.directors.length;
        const allPeople = [...ctx.officers, ...ctx.directors];
        for (const person of allPeople) {
            const title = (person.title ?? '').toUpperCase();
            if (C_SUITE_TERMS.some((term) => title.includes(term))) {
                cSuiteRoles.add(title || 'C-SUITE');
            }
            const days = parseDaysFromDate(person.endDate ?? undefined);
            if (days != null) {
                if (days <= 90) departures90d += 1;
                if (days <= 365) departures12m += 1;
            }
            if (person.ref) references.push(person.ref);
        }
        auditorChanges12m = ctx.events.filter((e) =>
            e.eventType.toUpperCase().includes('AUDITOR')
        ).length;
        ctx.events.forEach((e) => {
            if (e.ref) references.push(e.ref);
        });
    } else {
        try {
            const relatedResult = await callMcpTool(
                'elemental',
                'elemental_get_related',
                {
                    entity_id: { id_type: 'neid', id: neid },
                    related_flavor: 'person',
                    relationship_types: ['is_officer', 'is_director', 'board_member_of'],
                    related_properties: ['title', 'start_date', 'end_date'],
                    direction: 'incoming',
                    limit: 200,
                },
                event
            );
            const related = extractMcpStructuredContent<{
                relationships?: Array<{
                    relationship_types?: string[];
                    properties?: Record<string, { value?: unknown; ref?: string }>;
                }>;
            }>(relatedResult);
            const relationships = Array.isArray(related?.relationships)
                ? related.relationships
                : [];
            for (const row of relationships) {
                const types = (row.relationship_types || []).map((value) =>
                    String(value).toLowerCase()
                );
                const title = String(row?.properties?.title?.value || '').toUpperCase();
                if (types.some((value) => value.includes('officer'))) officerCount += 1;
                if (types.some((value) => value.includes('director') || value.includes('board')))
                    directorCount += 1;
                if (C_SUITE_TERMS.some((term) => title.includes(term)))
                    cSuiteRoles.add(title || 'C-SUITE');
                const endDate = String(row?.properties?.end_date?.value || '');
                const days = parseDaysFromDate(endDate);
                if (days != null) {
                    if (days <= 90) departures90d += 1;
                    if (days <= 365) departures12m += 1;
                }
                const rowRefs = Object.values(row.properties || {})
                    .map((property) => property?.ref)
                    .filter((ref): ref is string => Boolean(ref));
                references.push(...rowRefs);
            }
        } catch (error) {
            console.warn('[ers] failed to load governance relationships', error);
        }

        try {
            const eventsResult = await callMcpTool(
                'elemental',
                'elemental_get_events',
                {
                    entity_id: { id_type: 'neid', id: neid },
                    categories: ['Auditor Change', 'Officer Change', 'Director Change'],
                    limit: 50,
                },
                event
            );
            const eventsData = extractMcpStructuredContent<{
                events?: Array<{
                    name?: string;
                    properties?: Record<string, { value?: unknown; ref?: string }>;
                }>;
            }>(eventsResult);
            const events = Array.isArray(eventsData?.events) ? eventsData.events : [];
            for (const row of events) {
                const eventType = String(
                    row?.properties?.event_type?.value ??
                        row?.properties?.category?.value ??
                        row?.name ??
                        ''
                ).toUpperCase();
                if (eventType.includes('AUDITOR')) auditorChanges12m += 1;
                const eventRefs = Object.values(row?.properties || {})
                    .map((property) => property?.ref)
                    .filter((ref): ref is string => Boolean(ref));
                references.push(...eventRefs);
            }
        } catch (error) {
            console.warn('[ers] failed to load governance events', error);
        }
    }

    return {
        officerCount,
        directorCount,
        cSuiteCount: cSuiteRoles.size,
        cSuiteRoles: [...cSuiteRoles],
        departures90d,
        departures12m,
        auditorChanges12m,
        references: [...new Set(references)],
    };
}
