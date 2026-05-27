import { clampScore } from '../hash';
import type { LensDetail } from '../types';
import type { ErsComputationResult, ErsSignal, GovernanceSnapshot } from './types';
import { computeKeyPersonRisk } from './keyPerson';

function classifyRiskLevel(score: number): ErsComputationResult['riskLevel'] {
    if (score >= 75) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
}

export function computeErsComposite(
    snapshot: GovernanceSnapshot & { references: string[] },
    signals: ErsSignal[],
    citations: Array<{
        ref?: string;
        url?: string;
        title?: string;
        source?: string;
        date?: string;
        snippet?: string;
    }>
): ErsComputationResult {
    const score = clampScore(signals.reduce((sum, signal) => sum + signal.score, 0));
    const confidence = clampScore(
        (snapshot.officerCount >= 5 && snapshot.directorCount >= 3
            ? 100
            : snapshot.officerCount >= 3
              ? 75
              : snapshot.officerCount >= 1
                ? 50
                : 10) *
            0.4 +
            (signals.length >= 5 ? 100 : signals.length >= 3 ? 75 : signals.length >= 1 ? 50 : 25) *
                0.35 +
            (snapshot.departures90d > 0 ? 100 : snapshot.departures12m > 0 ? 80 : 40) * 0.25
    );
    const confidenceLevel = confidence >= 75 ? 'High' : confidence >= 50 ? 'Medium' : 'Low';
    const keyPersonRisk = computeKeyPersonRisk(snapshot);
    const detail: LensDetail = {
        metrics: [
            { label: 'Officer count', value: `${snapshot.officerCount}` },
            { label: 'Director count', value: `${snapshot.directorCount}` },
            { label: 'C-suite count', value: `${snapshot.cSuiteCount}` },
            { label: 'Departures (90d)', value: `${snapshot.departures90d}` },
            { label: 'Departures (12m)', value: `${snapshot.departures12m}` },
            { label: 'Auditor changes (12m)', value: `${snapshot.auditorChanges12m}` },
            { label: 'Key person risk', value: keyPersonRisk },
        ],
        findings:
            signals.length > 0
                ? signals.map((signal) => ({
                      text: signal.description,
                      citations: citations.slice(0, 3),
                  }))
                : [{ text: 'No governance instability signals were returned.', citations: [] }],
    };

    return {
        score,
        riskLevel: classifyRiskLevel(score),
        confidence,
        confidenceLevel,
        keyPersonRisk,
        governanceSummary: {
            officerCount: snapshot.officerCount,
            directorCount: snapshot.directorCount,
            cSuiteCount: snapshot.cSuiteCount,
            cSuiteRoles: snapshot.cSuiteRoles,
            departures90d: snapshot.departures90d,
            departures12m: snapshot.departures12m,
            auditorChanges12m: snapshot.auditorChanges12m,
            isSystemic: snapshot.departures12m >= 4,
        },
        signals,
        detail,
        hasRealData: signals.length > 0 || snapshot.officerCount > 0 || snapshot.directorCount > 0,
    };
}
