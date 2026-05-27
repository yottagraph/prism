import type { ErsSignal, GovernanceSnapshot } from './types';

function classifyScore(score: number): ErsSignal['severity'] {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
}

export function computeErsSignals(snapshot: GovernanceSnapshot): ErsSignal[] {
    const signals: ErsSignal[] = [];

    if (snapshot.officerCount === 0) {
        signals.push({
            signalType: 'officer_count',
            severity: 'critical',
            score: 50,
            description: 'No active officers found.',
            evidence: [],
        });
    } else if (snapshot.officerCount < 3) {
        signals.push({
            signalType: 'officer_count',
            severity: 'medium',
            score: 20,
            description: `Only ${snapshot.officerCount} active officers found.`,
            evidence: [],
        });
    }

    if (snapshot.officerCount > 0 && snapshot.cSuiteCount < 2) {
        signals.push({
            signalType: 'c_suite_coverage',
            severity: 'high',
            score: 25,
            description: `Limited C-suite coverage (${snapshot.cSuiteCount} role${snapshot.cSuiteCount === 1 ? '' : 's'}).`,
            evidence: [],
        });
    }

    if (snapshot.departures12m > 0) {
        const baseDepartureScore = Math.min(60, snapshot.departures12m * 15);
        const recencyMultiplier =
            snapshot.departures90d >= 3 ? 1 : snapshot.departures90d >= 1 ? 0.85 : 0.6;
        const cSuitePremium = snapshot.cSuiteCount > 0 ? 1.2 : 1;
        const score = Math.min(
            60,
            Math.round(baseDepartureScore * recencyMultiplier * cSuitePremium)
        );
        signals.push({
            signalType: 'officer_departures',
            severity: classifyScore(score),
            score,
            description: `${snapshot.departures12m} officer/director departures over 12 months (${snapshot.departures90d} in 90d).`,
            evidence: [],
        });
    }

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
        signals.push({
            signalType: 'cumulative_departure_pattern',
            severity: snapshot.departures12m >= 4 ? 'critical' : 'high',
            score: patternBonus,
            description: `Systemic departure pattern detected across 12 months (${snapshot.departures12m} departures).`,
            evidence: [],
        });
    }

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

    return signals;
}
