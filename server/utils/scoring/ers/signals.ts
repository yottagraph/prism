import type { ContextEvent } from '../contextPackage';
import type { ErsThresholds } from '../types';
import type { ErsSignal, GovernanceSnapshot } from './types';

function classifyScore(score: number): ErsSignal['severity'] {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
}

const C_SUITE_PATTERN =
    /\b(CEO|CFO|COO|CMO|CTO|President|Chief\s+\w+\s+Officer|Principal\s+Executive|Principal\s+Financial)\b/i;

function recencyMultiplier(dateStr: string | null): number {
    if (!dateStr) return 0.5;
    const ts = Date.parse(dateStr);
    if (!Number.isFinite(ts)) return 0.5;
    const days = Math.max(0, Math.round((Date.now() - ts) / 86_400_000));
    if (days <= 30) return 1.0;
    if (days <= 90) return 0.85;
    if (days <= 180) return 0.7;
    if (days <= 365) return 0.5;
    return 0.3;
}

export function computeErsSignals(
    snapshot: GovernanceSnapshot,
    events?: ContextEvent[],
    thresholds?: ErsThresholds
): ErsSignal[] {
    const minOfficers = thresholds?.minOfficers ?? 3;
    const minCSuite = thresholds?.minCSuite ?? 2;
    const signals: ErsSignal[] = [];

    if (snapshot.officerCount === 0) {
        signals.push({
            signalType: 'officer_count',
            severity: 'critical',
            score: 50,
            description: 'No active officers found.',
            evidence: [],
        });
    } else if (snapshot.officerCount < minOfficers) {
        signals.push({
            signalType: 'officer_count',
            severity: 'medium',
            score: 20,
            description: `Only ${snapshot.officerCount} active officers found (threshold: ${minOfficers}).`,
            evidence: [],
        });
    }

    if (snapshot.officerCount > 0 && snapshot.cSuiteCount < minCSuite) {
        signals.push({
            signalType: 'c_suite_coverage',
            severity: 'high',
            score: 25,
            description: `Limited C-suite coverage (${snapshot.cSuiteCount} role${snapshot.cSuiteCount === 1 ? '' : 's'}, threshold: ${minCSuite}).`,
            evidence: [],
        });
    }

    // Signal 3: Officer departures
    if (snapshot.departures12m > 0) {
        const baseDepartureScore = Math.min(60, snapshot.departures12m * 15);
        const recencyMult =
            snapshot.departures90d >= 3 ? 1 : snapshot.departures90d >= 1 ? 0.85 : 0.6;
        const cSuitePremium = snapshot.cSuiteCount > 0 ? 1.2 : 1;
        const score = Math.min(60, Math.round(baseDepartureScore * recencyMult * cSuitePremium));
        signals.push({
            signalType: 'officer_departures',
            severity: classifyScore(score),
            score,
            description: `${snapshot.departures12m} officer/director departures over 12 months (${snapshot.departures90d} in 90d).`,
            evidence: [],
        });
    }

    // Signal 5: Auditor changes
    if (snapshot.auditorChanges12m > 0) {
        const score = Math.min(40, snapshot.auditorChanges12m * 20);
        signals.push({
            signalType: 'auditor_changes',
            severity: snapshot.auditorChanges12m >= 2 ? 'critical' : 'high',
            score,
            description: `${snapshot.auditorChanges12m} auditor change event${snapshot.auditorChanges12m === 1 ? '' : 's'} in 12 months.`,
            evidence: [],
        });
    }

    // Signal 6: Cumulative departure pattern (multiplier + systemic flag)
    if (snapshot.departures12m >= 2) {
        const multiplier =
            snapshot.departures12m >= 5
                ? 1.6
                : snapshot.departures12m >= 4
                  ? 1.5
                  : snapshot.departures12m >= 3
                    ? 1.3
                    : 1.15;
        const patternBonus = Math.round((multiplier - 1) * 20);
        const isSystemic = snapshot.departures12m >= 4;
        signals.push({
            signalType: 'cumulative_departure_pattern',
            severity: isSystemic ? 'critical' : 'high',
            score: patternBonus,
            description: `${isSystemic ? 'Systemic' : 'Cumulative'} departure pattern: ${snapshot.departures12m} departures in 12m (×${multiplier.toFixed(2)} multiplier).`,
            evidence: [],
        });
    }

    // Signal 8: 8-K Item 5.02 executive departure/appointment events
    if (events && events.length > 0) {
        const departureEvents = events.filter((ev) => {
            const type = ev.eventType.toUpperCase();
            return (
                type.includes('EXEC_DEPARTURE') ||
                type.includes('APPOINTMENT') ||
                type.includes('5.02') ||
                type.includes('ITEM 5.02') ||
                (type.includes('8-K') &&
                    (ev.description?.toUpperCase().includes('5.02') ||
                        ev.snippet?.toUpperCase().includes('5.02')))
            );
        });

        let signal8Total = 0;
        for (const ev of departureEvents) {
            const snippetText = (ev.snippet ?? ev.description ?? '').toUpperCase();
            const isCsuite = C_SUITE_PATTERN.test(snippetText);
            const mult = recencyMultiplier(ev.date);
            const baseScore = 10 * mult * (isCsuite ? 1.4 : 1.0);
            signal8Total += baseScore;
        }
        signal8Total = Math.min(50, Math.round(signal8Total));

        if (signal8Total > 0) {
            const severity =
                signal8Total >= 40
                    ? ('critical' as const)
                    : signal8Total >= 25
                      ? ('high' as const)
                      : signal8Total >= 10
                        ? ('medium' as const)
                        : ('low' as const);
            signals.push({
                signalType: '8k_item_5_02_events',
                severity,
                score: signal8Total,
                description: `${departureEvents.length} executive departure/appointment event${departureEvents.length === 1 ? '' : 's'} (8-K Item 5.02) detected.`,
                evidence: [],
            });
        }
    }

    return signals;
}
