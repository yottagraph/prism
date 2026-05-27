import type { H3Event } from 'h3';

import { resolveRefs } from '../citations';
import { extractPropertyFacts, getPropertyValues, getSchema, normalizePidMap } from '../elemental';
import type { EvidenceItem } from '../types';
import type { FhsSignal, FhsTierResult } from './types';

type Fact = ReturnType<typeof extractPropertyFacts>[number];

function asNumber(value: string | number | undefined): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function latestFact(facts: Fact[]): Fact | null {
    if (!facts.length) return null;
    return [...facts].sort((a, b) => {
        const ad = a.date ? Date.parse(a.date) : 0;
        const bd = b.date ? Date.parse(b.date) : 0;
        return bd - ad;
    })[0]!;
}

function severityScore(
    value: number,
    thresholds: Array<{
        when: (v: number) => boolean;
        severity: FhsSignal['severity'];
        score: number;
    }>
) {
    const hit = thresholds.find((threshold) => threshold.when(value));
    return hit ?? { severity: 'low' as const, score: 10 };
}

function formatPercent(value: number) {
    return `${(value * 100).toFixed(1)}%`;
}

export interface Tier1Output extends FhsTierResult {
    freshestFilingDays: number | null;
    leverageLatest: number | null;
    leveragePrevious: number | null;
}

export async function computeTier1Financials(event: H3Event, neid: string): Promise<Tier1Output> {
    const schema = await getSchema(event);
    const pid = normalizePidMap(schema);
    const pids = {
        assets: pid.total_assets ?? pid.assets ?? pid['us_gaap:assets'],
        liabilities: pid.total_liabilities ?? pid.liabilities ?? pid['us_gaap:liabilities'],
        equity:
            pid.stockholders_equity ??
            pid.shareholders_equity ??
            pid.partners_capital ??
            pid['us_gaap:stockholders_equity'],
        revenue: pid.total_revenue ?? pid.revenue ?? pid['us_gaap:revenues'],
        netIncome: pid.net_income ?? pid['us_gaap:net_income_loss'],
        currentAssets: pid.current_assets ?? pid['us_gaap:assets_current'],
        currentLiabilities: pid.current_liabilities ?? pid['us_gaap:liabilities_current'],
        cash:
            pid.cash_and_cash_equivalents ??
            pid.cash ??
            pid['us_gaap:cash_and_cash_equivalents_at_carrying_value'],
        operatingIncome: pid.operating_income ?? pid['us_gaap:operating_income_loss'],
        interestExpense: pid.interest_expense ?? pid['us_gaap:interest_expense'],
        operatingCashFlow:
            pid.operating_cash_flow ??
            pid['us_gaap:net_cash_provided_by_used_in_operating_activities'],
        filingDate: pid.filing_date ?? pid.report_date,
    };
    const selectedPids = Object.values(pids).filter((value): value is string => Boolean(value));

    if (!selectedPids.length) {
        return {
            tier: 1,
            tierName: 'Hard Financials',
            score: null,
            weight: 0.45,
            signalCount: 0,
            hasData: false,
            metrics: [],
            findings: [],
            signals: [],
            freshestFilingDays: null,
            leverageLatest: null,
            leveragePrevious: null,
        };
    }

    const values = await getPropertyValues([neid], selectedPids, true, event);
    const facts = Object.fromEntries(
        Object.entries(pids).map(([key, pidValue]) => [
            key,
            pidValue ? extractPropertyFacts(values, pidValue) : [],
        ])
    ) as Record<keyof typeof pids, Fact[]>;

    const assets = asNumber(latestFact(facts.assets)?.value);
    const liabilities = asNumber(latestFact(facts.liabilities)?.value);
    const equity = asNumber(latestFact(facts.equity)?.value);
    const revenue = asNumber(latestFact(facts.revenue)?.value);
    const netIncome = asNumber(latestFact(facts.netIncome)?.value);
    const currentAssets = asNumber(latestFact(facts.currentAssets)?.value);
    const currentLiabilities = asNumber(latestFact(facts.currentLiabilities)?.value);
    const cash = asNumber(latestFact(facts.cash)?.value);
    const operatingIncome = asNumber(latestFact(facts.operatingIncome)?.value);
    const interestExpense = asNumber(latestFact(facts.interestExpense)?.value);
    const operatingCashFlow = asNumber(latestFact(facts.operatingCashFlow)?.value);

    const leverageRatio =
        liabilities != null && equity != null && equity !== 0 ? liabilities / equity : null;
    const equityRatio = assets != null && equity != null && assets !== 0 ? equity / assets : null;
    const netMargin =
        revenue != null && netIncome != null && revenue !== 0 ? netIncome / revenue : null;
    const currentRatio =
        currentAssets != null && currentLiabilities != null && currentLiabilities !== 0
            ? currentAssets / currentLiabilities
            : null;
    const cashRatio =
        cash != null && currentLiabilities != null && currentLiabilities !== 0
            ? cash / currentLiabilities
            : null;
    const interestCoverage =
        operatingIncome != null && interestExpense != null && interestExpense !== 0
            ? operatingIncome / interestExpense
            : null;
    const ocfToLiabilities =
        operatingCashFlow != null && liabilities != null && liabilities !== 0
            ? operatingCashFlow / liabilities
            : null;

    const filingDates = facts.filingDate
        .map((row) =>
            row.date
                ? Date.parse(row.date)
                : typeof row.value === 'string'
                  ? Date.parse(row.value)
                  : NaN
        )
        .filter((value) => Number.isFinite(value));
    const freshestFilingDays =
        filingDates.length > 0
            ? Math.round((Date.now() - Math.max(...filingDates)) / 86_400_000)
            : null;

    const leverageSeries = [...facts.liabilities]
        .slice(0, 2)
        .map((row, index) => {
            const liabilitiesValue = asNumber(row.value);
            const equityFact = facts.equity[index];
            const equityValue = asNumber(equityFact?.value);
            return liabilitiesValue != null && equityValue != null && equityValue !== 0
                ? liabilitiesValue / equityValue
                : null;
        })
        .filter((value): value is number => value != null);

    const leverageLatest = leverageSeries[0] ?? leverageRatio;
    const leveragePrevious = leverageSeries[1] ?? null;

    const signals: FhsSignal[] = [];
    const findings: EvidenceItem[] = [];
    const metrics: FhsTierResult['metrics'] = [];

    if (leverageRatio != null) {
        const mapped = severityScore(leverageRatio, [
            { when: (value) => value > 5, severity: 'critical', score: 90 },
            { when: (value) => value > 3, severity: 'high', score: 70 },
            { when: (value) => value > 2, severity: 'medium', score: 45 },
        ]);
        signals.push({
            signalType: 'leverage_ratio',
            tier: 1,
            severity: mapped.severity,
            score: mapped.score,
            weight: 1.5,
            description: `Liabilities to equity is ${leverageRatio.toFixed(2)}x`,
            evidence: [],
        });
        metrics.push({ label: 'Leverage ratio', value: `${leverageRatio.toFixed(2)}x` });
    }

    if (equityRatio != null) {
        const mapped = severityScore(equityRatio, [
            { when: (value) => value < 0, severity: 'critical', score: 95 },
            { when: (value) => value < 0.1, severity: 'high', score: 75 },
            { when: (value) => value < 0.2, severity: 'medium', score: 50 },
        ]);
        signals.push({
            signalType: 'equity_ratio',
            tier: 1,
            severity: mapped.severity,
            score: mapped.score,
            weight: 1.5,
            description: `Equity ratio is ${formatPercent(equityRatio)}`,
            evidence: [],
        });
        metrics.push({ label: 'Equity ratio', value: formatPercent(equityRatio) });
    }

    if (netMargin != null) {
        const mapped = severityScore(netMargin, [
            { when: (value) => value < -0.5, severity: 'critical', score: 85 },
            { when: (value) => value < -0.1, severity: 'high', score: 65 },
            { when: (value) => value < 0, severity: 'medium', score: 45 },
        ]);
        signals.push({
            signalType: 'net_margin',
            tier: 1,
            severity: mapped.severity,
            score: mapped.score,
            weight: 1.0,
            description: `Net margin is ${formatPercent(netMargin)}`,
            evidence: [],
        });
        metrics.push({ label: 'Net margin', value: formatPercent(netMargin) });
    }

    if (currentRatio != null)
        metrics.push({ label: 'Current ratio', value: `${currentRatio.toFixed(2)}x` });
    if (cashRatio != null) metrics.push({ label: 'Cash ratio', value: `${cashRatio.toFixed(2)}x` });
    if (interestCoverage != null)
        metrics.push({ label: 'Interest coverage', value: `${interestCoverage.toFixed(2)}x` });
    if (ocfToLiabilities != null)
        metrics.push({ label: 'OCF / liabilities', value: `${ocfToLiabilities.toFixed(2)}x` });
    if (freshestFilingDays != null)
        metrics.push({ label: 'Latest filing age', value: `${freshestFilingDays}d` });

    const refs = [
        latestFact(facts.liabilities)?.ref,
        latestFact(facts.equity)?.ref,
        latestFact(facts.assets)?.ref,
        latestFact(facts.revenue)?.ref,
        latestFact(facts.netIncome)?.ref,
    ].filter((ref): ref is string => Boolean(ref));
    const citationMap = await resolveRefs(refs, event);
    const citations = refs
        .map((ref) => citationMap.get(ref))
        .filter((citation): citation is NonNullable<typeof citation> => Boolean(citation));

    if (signals.length) {
        findings.push({
            text: `Tier 1 financials show ${
                signals[0]?.severity ?? 'low'
            } risk led by ${signals[0]?.signalType.replace('_', ' ') ?? 'financial ratios'}.`,
            date: latestFact(facts.filingDate)?.date,
            citations,
        });
    }

    const weightedNumerator = signals.reduce(
        (sum, signal) => sum + signal.score * signal.weight,
        0
    );
    const weightedDenominator = signals.reduce((sum, signal) => sum + signal.weight, 0);
    const tierScore = weightedDenominator > 0 ? weightedNumerator / weightedDenominator : null;

    return {
        tier: 1,
        tierName: 'Hard Financials',
        score: tierScore,
        weight: 0.45,
        signalCount: signals.length,
        hasData: tierScore != null,
        metrics,
        findings,
        signals,
        freshestFilingDays,
        leverageLatest,
        leveragePrevious,
    };
}
