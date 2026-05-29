import type { H3Event } from 'h3';

import { resolveRefs } from '../citations';
import type { ContextPackage } from '../contextPackage';
import { extractPropertyFacts, getPropertyValues, getSchema, normalizePidMap } from '../elemental';
import type { EvidenceItem } from '../types';
import type { FhsSignal, FhsTierResult } from './types';

function asNumber(value: string | number | undefined): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function resolveFromCtx(
    ctx: ContextPackage,
    ...names: string[]
): ReturnType<typeof extractPropertyFacts>[0] | undefined {
    for (const name of names) {
        const facts = ctx.seriesByPid[name] ?? ctx.financials[name];
        if (facts?.length) return facts[0];
    }
    return undefined;
}

export async function computeTier5Instruments(
    event: H3Event,
    neid: string,
    ctx?: ContextPackage
): Promise<FhsTierResult> {
    const metrics: FhsTierResult['metrics'] = [];
    const findings: EvidenceItem[] = [];
    const signals: FhsSignal[] = [];
    const refs: string[] = [];

    try {
        let debtDueFact: ReturnType<typeof extractPropertyFacts>[0] | undefined;
        let cashFact: ReturnType<typeof extractPropertyFacts>[0] | undefined;
        let longDebtFact: ReturnType<typeof extractPropertyFacts>[0] | undefined;

        if (ctx) {
            debtDueFact = resolveFromCtx(
                ctx,
                'debt_due_18m',
                'current_portion_long_term_debt',
                'us_gaap:long_term_debt_current'
            );
            cashFact = resolveFromCtx(
                ctx,
                'cash_and_cash_equivalents',
                'cash',
                'us_gaap:cash_and_cash_equivalents_at_carrying_value'
            );
            longDebtFact = resolveFromCtx(
                ctx,
                'long_term_debt',
                'us_gaap:long_term_debt_noncurrent'
            );
        } else {
            const schema = await getSchema(event);
            const pid = normalizePidMap(schema);
            const debtDue18m =
                pid.debt_due_18m ??
                pid.current_portion_long_term_debt ??
                pid['us_gaap:long_term_debt_current'];
            const cashPid =
                pid.cash_and_cash_equivalents ??
                pid.cash ??
                pid['us_gaap:cash_and_cash_equivalents_at_carrying_value'];
            const longTermDebt = pid.long_term_debt ?? pid['us_gaap:long_term_debt_noncurrent'];
            const pids = [debtDue18m, cashPid, longTermDebt].filter((value): value is string =>
                Boolean(value)
            );
            if (pids.length) {
                const values = await getPropertyValues([neid], pids, true, event);
                debtDueFact = debtDue18m ? extractPropertyFacts(values, debtDue18m)[0] : undefined;
                cashFact = cashPid ? extractPropertyFacts(values, cashPid)[0] : undefined;
                longDebtFact = longTermDebt
                    ? extractPropertyFacts(values, longTermDebt)[0]
                    : undefined;
            }
        }

        {
            const debtDue = asNumber(debtDueFact?.value);
            const cash = asNumber(cashFact?.value);
            const longDebt = asNumber(longDebtFact?.value);
            if (debtDueFact?.ref) refs.push(debtDueFact.ref);
            if (cashFact?.ref) refs.push(cashFact.ref);
            if (longDebtFact?.ref) refs.push(longDebtFact.ref);

            if (debtDue != null && cash != null && debtDue > 0) {
                const coverage = cash / debtDue;
                metrics.push({
                    label: 'Debt due (<18m)',
                    value: `$${Math.round(debtDue).toLocaleString()}`,
                });
                metrics.push({ label: 'Cash', value: `$${Math.round(cash).toLocaleString()}` });
                metrics.push({
                    label: 'Maturity coverage',
                    value: `${(coverage * 100).toFixed(0)}%`,
                });

                if (coverage < 0.5) {
                    signals.push({
                        signalType: 'maturity_wall',
                        tier: 5,
                        severity: 'critical',
                        score: 85,
                        weight: 2,
                        description: `Cash covers only ${(coverage * 100).toFixed(0)}% of near-term debt maturities.`,
                        evidence: [],
                    });
                } else if (coverage < 0.8) {
                    signals.push({
                        signalType: 'maturity_wall',
                        tier: 5,
                        severity: 'high',
                        score: 65,
                        weight: 2,
                        description: `Cash covers ${(coverage * 100).toFixed(0)}% of near-term debt maturities.`,
                        evidence: [],
                    });
                } else if (coverage < 1.2) {
                    signals.push({
                        signalType: 'maturity_wall',
                        tier: 5,
                        severity: 'medium',
                        score: 45,
                        weight: 2,
                        description: `Cash coverage of maturities is ${(coverage * 100).toFixed(0)}%, close to stress threshold.`,
                        evidence: [],
                    });
                }
            }

            if (longDebt != null && longDebt > 0 && debtDue != null) {
                const dueShare = debtDue / longDebt;
                metrics.push({
                    label: 'Near-term debt share',
                    value: `${(dueShare * 100).toFixed(1)}%`,
                });
                if (dueShare > 0.4) {
                    signals.push({
                        signalType: 'indenture_maturity_wall',
                        tier: 5,
                        severity: dueShare > 0.6 ? 'high' : 'medium',
                        score: dueShare > 0.6 ? 70 : 50,
                        weight: 2,
                        description: `${(dueShare * 100).toFixed(1)}% of long-term debt matures within 18 months.`,
                        evidence: [],
                    });
                }
            }
        }
    } catch (error) {
        console.warn('[fhs:tier5] failed to compute instrument signals', error);
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
        tier: 5,
        tierName: 'Instrument Signals',
        score: weightedDenominator > 0 ? weightedNumerator / weightedDenominator : null,
        weight: 0.15,
        signalCount: signals.length,
        hasData: weightedDenominator > 0,
        metrics,
        findings,
        signals,
    };
}
