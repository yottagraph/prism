import type { H3Event } from 'h3';

import { resolveRefs } from '../citations';
import { callMcpTool, extractMcpStructuredContent } from '../mcpGateway';
import type { EvidenceItem } from '../types';
import type { FhsSignal, FhsTierResult } from './types';

const DISTRESS_EVENT_MAP: Array<{
    eventType: string;
    signalType: string;
    severity: FhsSignal['severity'];
    baseScore: number;
    weight: number;
}> = [
    {
        eventType: 'FINANCING_BANKRUPTCY',
        signalType: 'BANKRUPTCY_EVENT',
        severity: 'critical',
        baseScore: 100,
        weight: 3.0,
    },
    {
        eventType: 'DELISTING_NOTICE',
        signalType: 'DELISTING_EVENT',
        severity: 'critical',
        baseScore: 90,
        weight: 2.5,
    },
    {
        eventType: 'ACCOUNTING_NON_RELIANCE',
        signalType: 'NON_RELIANCE_EVENT',
        severity: 'critical',
        baseScore: 85,
        weight: 2.0,
    },
    {
        eventType: 'FINANCING_TRIGGERING_EVENTS',
        signalType: 'TRIGGERING_EVENT',
        severity: 'high',
        baseScore: 70,
        weight: 1.5,
    },
    {
        eventType: 'FINANCIAL_IMPAIRMENT',
        signalType: 'IMPAIRMENT_EVENT',
        severity: 'high',
        baseScore: 60,
        weight: 1.0,
    },
    {
        eventType: 'FINANCING_TERMINATION',
        signalType: 'TERMINATION_EVENT',
        severity: 'medium',
        baseScore: 50,
        weight: 1.0,
    },
];

function recencyMultiplier(eventDate: string | undefined, nowMs: number): number {
    if (!eventDate) return 0.25;
    const ts = Date.parse(eventDate);
    if (!Number.isFinite(ts)) return 0.25;
    const days = Math.max(0, Math.round((nowMs - ts) / 86_400_000));
    if (days >= 730) return 0.25;
    const progress = days / 730;
    return 1 - progress * 0.75;
}

export async function computeTier2Events(
    event: H3Event,
    neid: string,
    nowMs: number
): Promise<FhsTierResult> {
    const metrics: FhsTierResult['metrics'] = [];
    const findings: EvidenceItem[] = [];
    const signals: FhsSignal[] = [];

    try {
        const result = await callMcpTool(
            'elemental',
            'elemental_get_events',
            {
                entity_id: { id_type: 'neid', id: neid },
                limit: 100,
            },
            event
        );
        const structured = extractMcpStructuredContent<{
            events?: Array<{
                name?: string;
                properties?: Record<string, { value?: unknown; ref?: string }>;
            }>;
        }>(result);
        const events = Array.isArray(structured?.events) ? structured.events : [];

        const refs: string[] = [];
        for (const row of events) {
            const eventType = String(
                row?.properties?.event_type?.value ??
                    row?.properties?.category?.value ??
                    row?.name ??
                    ''
            ).toUpperCase();
            const mapped = DISTRESS_EVENT_MAP.find((entry) => eventType.includes(entry.eventType));
            if (!mapped) continue;
            const date = String(
                row?.properties?.event_date?.value ?? row?.properties?.date?.value ?? ''
            );
            const multiplier = recencyMultiplier(date || undefined, nowMs);
            const score = mapped.baseScore * multiplier;
            const description = String(
                row?.properties?.description?.value ?? row?.name ?? mapped.signalType
            );
            const ref =
                row?.properties?.description?.ref ||
                row?.properties?.event_type?.ref ||
                row?.properties?.date?.ref;
            if (ref) refs.push(ref);
            signals.push({
                signalType: mapped.signalType,
                tier: 2,
                severity: mapped.severity,
                score,
                weight: mapped.weight,
                description,
                evidence: [],
            });
        }

        const citationMap = await resolveRefs(refs, event);
        signals.forEach((signal) => {
            const citation = refs.map((ref) => citationMap.get(ref)).find(Boolean);
            if (citation) {
                signal.evidence = [
                    {
                        text: signal.description,
                        citations: [citation],
                    },
                ];
            }
        });

        const groupedCounts = signals.reduce<Record<string, number>>((acc, signal) => {
            acc[signal.signalType] = (acc[signal.signalType] || 0) + 1;
            return acc;
        }, {});
        Object.entries(groupedCounts).forEach(([signalType, count]) => {
            metrics.push({ label: signalType.replaceAll('_', ' '), value: `${count}` });
        });
        findings.push(
            ...signals.slice(0, 4).map((signal) => ({
                text: `${signal.description} (${signal.signalType.replaceAll('_', ' ')})`,
                citations:
                    signal.evidence[0]?.citations && signal.evidence[0].citations.length > 0
                        ? signal.evidence[0].citations
                        : [],
            }))
        );
    } catch (error) {
        console.warn('[fhs:tier2] failed to compute distress events', error);
    }

    const weightedNumerator = signals.reduce(
        (sum, signal) => sum + signal.score * signal.weight,
        0
    );
    const weightedDenominator = signals.reduce((sum, signal) => sum + signal.weight, 0);
    return {
        tier: 2,
        tierName: 'Distress Events',
        score: weightedDenominator > 0 ? weightedNumerator / weightedDenominator : null,
        weight: 0.2,
        signalCount: signals.length,
        hasData: weightedDenominator > 0,
        metrics,
        findings,
        signals,
    };
}
