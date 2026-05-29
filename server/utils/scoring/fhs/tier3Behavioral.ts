import type { H3Event } from 'h3';

import { resolveRefs } from '../citations';
import type { ContextPackage } from '../contextPackage';
import { extractPropertyFacts, getPropertyValues, getSchema, normalizePidMap } from '../elemental';
import { callMcpTool, extractMcpStructuredContent } from '../mcpGateway';
import type { EvidenceItem } from '../types';
import type { FhsSignal, FhsTierResult } from './types';

function recencyDays(value?: string): number | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.round((Date.now() - parsed) / 86_400_000));
}

function severityFromThresholds(
    count: number,
    thresholds: Array<{ min: number; severity: FhsSignal['severity']; score: number }>
) {
    const hit = thresholds.find((threshold) => count >= threshold.min);
    return hit ?? null;
}

export async function computeTier3Behavioral(
    event: H3Event,
    neid: string,
    ctx?: ContextPackage
): Promise<FhsTierResult> {
    const metrics: FhsTierResult['metrics'] = [];
    const findings: EvidenceItem[] = [];
    const signals: FhsSignal[] = [];
    const refs: string[] = [];

    try {
        // --- Filing gap ---
        let filingGapDays: number | null = null;
        let filingRef: string | undefined;
        if (ctx) {
            const filingFacts =
                ctx.seriesByPid['filing_date'] ??
                ctx.seriesByPid['report_date'] ??
                ctx.financials['filing_date'] ??
                ctx.financials['report_date'] ??
                [];
            const latest = filingFacts[0];
            if (latest) {
                filingGapDays = recencyDays(
                    latest.date ?? (typeof latest.value === 'string' ? latest.value : undefined)
                );
                filingRef = latest.ref;
            }
        } else {
            const schema = await getSchema(event);
            const pidMap = normalizePidMap(schema);
            const filingPid = pidMap.filing_date ?? pidMap.report_date;
            if (filingPid) {
                const values = await getPropertyValues([neid], [filingPid], true, event);
                const filingFacts = extractPropertyFacts(values, filingPid);
                const latest = filingFacts[0];
                if (latest) {
                    filingGapDays = recencyDays(
                        latest.date ?? (typeof latest.value === 'string' ? latest.value : undefined)
                    );
                    filingRef = latest.ref;
                }
            }
        }

        if (filingGapDays != null) {
            metrics.push({ label: 'Filing gap', value: `${filingGapDays}d` });
            const severity =
                filingGapDays >= 365
                    ? { severity: 'critical' as const, score: 90 }
                    : filingGapDays >= 180
                      ? { severity: 'high' as const, score: 65 }
                      : filingGapDays >= 90
                        ? { severity: 'medium' as const, score: 40 }
                        : null;
            if (severity) {
                signals.push({
                    signalType: 'filing_gap',
                    tier: 3,
                    severity: severity.severity,
                    score: severity.score,
                    weight: 1,
                    description: `Latest filing is ${filingGapDays} days old.`,
                    evidence: [],
                });
                if (filingRef) refs.push(filingRef);
            }
        }

        // --- Officer/director departures ---
        let departures90Count = 0;
        if (ctx) {
            const allPeople = [...ctx.officers, ...ctx.directors];
            departures90Count = allPeople.filter((p) => {
                const days = recencyDays(p.endDate ?? undefined);
                return days != null && days <= 90;
            }).length;
            allPeople.forEach((p) => {
                if (p.ref) refs.push(p.ref);
            });
        } else {
            const related = await callMcpTool(
                'elemental',
                'elemental_get_related',
                {
                    entity_id: { id_type: 'neid', id: neid },
                    related_flavor: 'person',
                    relationship_types: ['is_officer', 'is_director', 'board_member_of'],
                    related_properties: ['title', 'end_date'],
                    direction: 'incoming',
                    limit: 120,
                },
                event
            );
            const relatedStructured = extractMcpStructuredContent<{
                relationships?: Array<{
                    properties?: Record<string, { value?: unknown; ref?: string }>;
                }>;
            }>(related);
            const relationships = Array.isArray(relatedStructured?.relationships)
                ? relatedStructured.relationships
                : [];
            const departures90 = relationships.filter((row) => {
                const endDate = String(row?.properties?.end_date?.value || '');
                const days = recencyDays(endDate);
                return days != null && days <= 90;
            });
            departures90Count = departures90.length;
            departures90.forEach((row) => {
                const ref = row?.properties?.end_date?.ref || row?.properties?.title?.ref;
                if (ref) refs.push(ref);
            });
        }

        const officerSignal = severityFromThresholds(departures90Count, [
            { min: 3, severity: 'critical', score: 80 },
            { min: 2, severity: 'high', score: 60 },
            { min: 1, severity: 'medium', score: 40 },
        ]);
        if (officerSignal) {
            signals.push({
                signalType: 'officer_departures_90d',
                tier: 3,
                severity: officerSignal.severity,
                score: officerSignal.score,
                weight: 1.2,
                description: `${departures90Count} leadership departures in the last 90 days.`,
                evidence: [],
            });
        }
        metrics.push({ label: 'Departures (90d)', value: `${departures90Count}` });

        // --- Auditor changes ---
        let auditorChangeCount = 0;
        if (ctx) {
            auditorChangeCount = ctx.events.filter((e) =>
                e.eventType.toUpperCase().includes('AUDITOR')
            ).length;
            ctx.events.forEach((e) => {
                if (e.ref && e.eventType.toUpperCase().includes('AUDITOR')) refs.push(e.ref);
            });
        } else {
            const eventsResult = await callMcpTool(
                'elemental',
                'elemental_get_events',
                {
                    entity_id: { id_type: 'neid', id: neid },
                    categories: ['Accounting', 'Auditor Change'],
                    limit: 30,
                },
                event
            );
            const eventsStructured = extractMcpStructuredContent<{
                events?: Array<{
                    name?: string;
                    properties?: Record<string, { value?: unknown; ref?: string }>;
                }>;
            }>(eventsResult);
            const events = Array.isArray(eventsStructured?.events) ? eventsStructured.events : [];
            const auditorChanges = events.filter((row) =>
                String(row?.properties?.event_type?.value ?? row?.name ?? '')
                    .toUpperCase()
                    .includes('AUDITOR')
            );
            auditorChangeCount = auditorChanges.length;
            auditorChanges.forEach((row) => {
                const ref = row?.properties?.description?.ref || row?.properties?.event_type?.ref;
                if (ref) refs.push(ref);
            });
        }

        metrics.push({ label: 'Auditor changes (12m)', value: `${auditorChangeCount}` });
        if (auditorChangeCount >= 2) {
            signals.push({
                signalType: 'auditor_changes',
                tier: 3,
                severity: 'critical',
                score: 85,
                weight: 1.1,
                description: `${auditorChangeCount} auditor changes in the past 12 months.`,
                evidence: [],
            });
        } else if (auditorChangeCount === 1) {
            signals.push({
                signalType: 'auditor_changes',
                tier: 3,
                severity: 'high',
                score: 65,
                weight: 1.1,
                description: 'One auditor change in the past 12 months.',
                evidence: [],
            });
        }
        // --- Late filings (NT 10-K / NT 10-Q) ---
        const formTypeFacts = ctx
            ? (ctx.seriesByPid['form_type'] ?? ctx.financials['form_type'] ?? [])
            : [];
        const now12m = Date.now() - 365 * 86_400_000;
        const lateFilingCount = formTypeFacts.filter((f) => {
            const val = String(f.value ?? '').toUpperCase();
            const isLate = val.includes('NT 10-K') || val.includes('NT 10-Q');
            const ts = f.date ? Date.parse(f.date) : 0;
            return isLate && ts >= now12m;
        }).length;
        if (lateFilingCount > 0) {
            metrics.push({ label: 'Late filings (12m)', value: `${lateFilingCount}` });
            const severity =
                lateFilingCount >= 3
                    ? { severity: 'critical' as const, score: 85 }
                    : lateFilingCount >= 2
                      ? { severity: 'high' as const, score: 70 }
                      : { severity: 'medium' as const, score: 50 };
            signals.push({
                signalType: 'late_filings',
                tier: 3,
                severity: severity.severity,
                score: severity.score,
                weight: 1.0,
                description: `${lateFilingCount} late filing notification${lateFilingCount > 1 ? 's' : ''} (NT 10-K/NT 10-Q) in the past 12 months.`,
                evidence: [],
            });
        }

        // --- Amendment frequency (10-K/A, 10-Q/A, etc.) ---
        const amendmentCount = formTypeFacts.filter((f) => {
            const val = String(f.value ?? '');
            const isAmendment = /\/A$/i.test(val);
            const ts = f.date ? Date.parse(f.date) : 0;
            return isAmendment && ts >= now12m;
        }).length;
        if (amendmentCount >= 5) {
            metrics.push({ label: 'Amendments (12m)', value: `${amendmentCount}` });
            signals.push({
                signalType: 'amendment_frequency',
                tier: 3,
                severity: 'medium',
                score: 40,
                weight: 0.8,
                description: `${amendmentCount} amended filings in the past 12 months suggest potential disclosure revisions.`,
                evidence: [],
            });
        }
    } catch (error) {
        console.warn('[fhs:tier3] failed to compute behavioral signals', error);
    }

    const citationMap = await resolveRefs(refs, event, ctx);
    const citations = refs
        .map((ref) => citationMap.get(ref))
        .filter((citation): citation is NonNullable<typeof citation> => Boolean(citation));

    signals.forEach((signal) => {
        signal.evidence = [{ text: signal.description, citations: citations.slice(0, 3) }];
    });
    findings.push(
        ...signals.slice(0, 3).map((signal) => ({
            text: signal.description,
            citations:
                signal.evidence[0]?.citations && signal.evidence[0].citations.length > 0
                    ? signal.evidence[0].citations
                    : [],
        }))
    );

    const weightedNumerator = signals.reduce(
        (sum, signal) => sum + signal.score * signal.weight,
        0
    );
    const weightedDenominator = signals.reduce((sum, signal) => sum + signal.weight, 0);
    return {
        tier: 3,
        tierName: 'Behavioral Signals',
        score: weightedDenominator > 0 ? weightedNumerator / weightedDenominator : null,
        weight: 0.12,
        signalCount: signals.length,
        hasData: weightedDenominator > 0,
        metrics,
        findings,
        signals,
    };
}
