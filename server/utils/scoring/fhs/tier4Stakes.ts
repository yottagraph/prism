import type { ContextPackage, ContextEvent } from '../contextPackage';
import type { EvidenceItem } from '../types';
import type { FhsSignal, FhsTierResult } from './types';

const ACTIVIST_EVENT_TYPES = new Set([
    'SC_13D',
    'SC_13G',
    'SC_13D/A',
    'SC_13G/A',
    'SC 13D',
    'SC 13G',
    'SC 13D/A',
    'SC 13G/A',
]);

function isStakeEvent(ev: ContextEvent): boolean {
    const upper = ev.eventType.toUpperCase().replace(/-/g, '_').replace(/\s+/g, '_');
    if (ACTIVIST_EVENT_TYPES.has(upper)) return true;
    const category = (ev.category ?? '').toUpperCase();
    if (category.includes('13D') || category.includes('13G')) return true;
    const desc = (ev.description ?? '').toUpperCase();
    return desc.includes('SCHEDULE 13D') || desc.includes('SCHEDULE 13G');
}

function recencyMultiplier(dateStr: string | null, nowMs: number): number {
    if (!dateStr) return 0.5;
    const ts = Date.parse(dateStr);
    if (!Number.isFinite(ts)) return 0.5;
    const days = Math.max(0, Math.round((nowMs - ts) / 86_400_000));
    if (days <= 30) return 1.0;
    if (days <= 90) return 0.85;
    if (days <= 180) return 0.7;
    if (days <= 365) return 0.5;
    return 0.3;
}

export function computeTier4Stakes(ctx: ContextPackage | undefined): FhsTierResult {
    const metrics: FhsTierResult['metrics'] = [];
    const findings: EvidenceItem[] = [];
    const signals: FhsSignal[] = [];

    if (!ctx) {
        return {
            tier: 4,
            tierName: 'Stake Changes',
            score: null,
            weight: 0.08,
            signalCount: 0,
            hasData: false,
            metrics: [],
            findings: [],
            signals: [],
        };
    }

    const stakeEvents = ctx.events.filter(isStakeEvent);
    if (stakeEvents.length === 0) {
        return {
            tier: 4,
            tierName: 'Stake Changes',
            score: null,
            weight: 0.08,
            signalCount: 0,
            hasData: false,
            metrics: [{ label: 'Stake events', value: '0' }],
            findings: [],
            signals: [],
        };
    }

    const nowMs = Date.now();
    metrics.push({ label: 'Stake events', value: `${stakeEvents.length}` });

    const filerMap = new Map<string, ContextEvent[]>();
    for (const ev of stakeEvents) {
        const filerKey = ev.description?.slice(0, 40) ?? ev.eventType;
        const arr = filerMap.get(filerKey) ?? [];
        arr.push(ev);
        filerMap.set(filerKey, arr);
    }

    const is13D = (ev: ContextEvent) => {
        const upper = ev.eventType.toUpperCase();
        return upper.includes('13D');
    };

    const new13DFilers = [...filerMap.entries()].filter(
        ([, events]) => events.length === 1 && is13D(events[0])
    );
    for (const [, events] of new13DFilers) {
        const ev = events[0];
        const mult = recencyMultiplier(ev.date, nowMs);
        signals.push({
            signalType: 'new_activist_stake',
            tier: 4,
            severity: 'high',
            score: Math.min(100, Math.round(20 * mult)),
            weight: 1.0,
            description: `New activist stake filing (13D) detected${ev.date ? ` on ${ev.date}` : ''}.`,
            evidence: [],
        });
    }

    const repeatedAmendments = [...filerMap.entries()].filter(([, events]) => events.length >= 2);
    for (const [, events] of repeatedAmendments) {
        const sorted = [...events].sort(
            (a, b) => (Date.parse(a.date ?? '') || 0) - (Date.parse(b.date ?? '') || 0)
        );
        const latest = sorted[sorted.length - 1];
        const mult = recencyMultiplier(latest.date, nowMs);
        signals.push({
            signalType: 'repeated_stake_amendments',
            tier: 4,
            severity: events.length >= 4 ? 'critical' : 'high',
            score: Math.min(100, Math.round(30 * mult)),
            weight: 1.2,
            description: `${events.length} stake amendment filings by the same filer — possible ownership buildup.`,
            evidence: [],
        });
    }

    const is13G = (ev: ContextEvent) => {
        const upper = ev.eventType.toUpperCase();
        return upper.includes('13G') && !upper.includes('13G/A');
    };
    const exitEvents = stakeEvents.filter(is13G);
    for (const ev of exitEvents) {
        const mult = recencyMultiplier(ev.date, nowMs);
        signals.push({
            signalType: 'stake_exit',
            tier: 4,
            severity: 'medium',
            score: Math.min(100, Math.round(10 * mult)),
            weight: 0.8,
            description: `Stake exit or passive filing (13G) detected${ev.date ? ` on ${ev.date}` : ''}.`,
            evidence: [],
        });
    }

    const totalScore = Math.min(
        100,
        signals.reduce((sum, s) => sum + s.score, 0)
    );

    findings.push(
        ...signals.slice(0, 4).map((s) => ({
            text: s.description,
            citations: [] as Array<{
                ref?: string;
                url?: string;
                title?: string;
                source?: string;
                date?: string;
                snippet?: string;
            }>,
        }))
    );

    return {
        tier: 4,
        tierName: 'Stake Changes',
        score: totalScore,
        weight: 0.08,
        signalCount: signals.length,
        hasData: signals.length > 0,
        metrics,
        findings,
        signals,
    };
}
