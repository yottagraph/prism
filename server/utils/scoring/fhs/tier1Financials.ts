import type { H3Event } from 'h3';

import { resolveRefs } from '../citations';
import type { ContextPackage } from '../contextPackage';
import { extractPropertyFacts, getPropertyValues, getSchema, normalizePidMap } from '../elemental';
import type { ElementalPropertyFact } from '../elemental';
import type { EvidenceItem, FhsThresholds } from '../types';
import type { FhsSignal, FhsTierResult } from './types';

type Fact = ElementalPropertyFact;

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

function resolveFacts(ctx: ContextPackage | null, pid: Record<string, string>) {
    const PROP_ALIASES: Record<string, string[]> = {
        assets: ['total_assets', 'assets', 'us_gaap:assets'],
        liabilities: ['total_liabilities', 'liabilities', 'us_gaap:liabilities'],
        equity: [
            'stockholders_equity',
            'shareholders_equity',
            'partners_capital',
            'us_gaap:stockholders_equity',
        ],
        revenue: ['total_revenue', 'revenue', 'us_gaap:revenues'],
        netIncome: ['net_income', 'us_gaap:net_income_loss'],
        currentAssets: ['current_assets', 'us_gaap:assets_current'],
        currentLiabilities: ['current_liabilities', 'us_gaap:liabilities_current'],
        cash: [
            'cash_and_cash_equivalents',
            'cash',
            'us_gaap:cash_and_cash_equivalents_at_carrying_value',
        ],
        operatingIncome: ['operating_income', 'us_gaap:operating_income_loss'],
        interestExpense: ['interest_expense', 'us_gaap:interest_expense'],
        operatingCashFlow: [
            'operating_cash_flow',
            'us_gaap:net_cash_provided_by_used_in_operating_activities',
        ],
        filingDate: ['filing_date', 'report_date'],
    };
    if (ctx) {
        const out: Record<string, Fact[]> = {};
        for (const [key, aliases] of Object.entries(PROP_ALIASES)) {
            out[key] = [];
            for (const alias of aliases) {
                const series = ctx.seriesByPid[alias] ?? ctx.financials[alias];
                if (series?.length) {
                    out[key] = series;
                    break;
                }
            }
        }
        return out;
    }
    const pids: Record<string, string | undefined> = {};
    for (const [key, aliases] of Object.entries(PROP_ALIASES)) {
        pids[key] = aliases.map((a) => pid[a]).find(Boolean);
    }
    return { pids };
}

export async function computeTier1Financials(
    event: H3Event,
    neid: string,
    ctx?: ContextPackage,
    thresholds?: FhsThresholds
): Promise<Tier1Output> {
    const leverageHigh = thresholds?.leverageHighThreshold ?? 3;
    const equityLow = thresholds?.equityLowThreshold ?? 0.2;
    const schema = ctx?.schema ?? (await getSchema(event));
    const pid = ctx?.pidMap ?? normalizePidMap(schema);
    const resolved = resolveFacts(ctx ?? null, pid);

    let facts: Record<string, Fact[]>;

    if ('pids' in resolved) {
        const pids = resolved.pids as Record<string, string | undefined>;
        const selectedPids = Object.values(pids).filter((v): v is string => Boolean(v));
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
        facts = Object.fromEntries(
            Object.entries(pids).map(([key, pidValue]) => [
                key,
                pidValue ? extractPropertyFacts(values, pidValue) : [],
            ])
        ) as Record<string, Fact[]>;
    } else {
        facts = resolved as Record<string, Fact[]>;
    }

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
        const leverageCritical = leverageHigh + 2;
        const leverageMedium = leverageHigh - 1;
        const mapped = severityScore(leverageRatio, [
            { when: (value) => value > leverageCritical, severity: 'critical', score: 90 },
            { when: (value) => value > leverageHigh, severity: 'high', score: 70 },
            { when: (value) => value > leverageMedium, severity: 'medium', score: 45 },
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
        const equityHigh = equityLow / 2;
        const mapped = severityScore(equityRatio, [
            { when: (value) => value < 0, severity: 'critical', score: 95 },
            { when: (value) => value < equityHigh, severity: 'high', score: 75 },
            { when: (value) => value < equityLow, severity: 'medium', score: 50 },
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
    const citationMap = await resolveRefs(refs, event, ctx);
    let citations = refs
        .map((ref) => citationMap.get(ref))
        .filter((citation): citation is NonNullable<typeof citation> => Boolean(citation));

    // In Galaxy mode facts have no provenance refs, so citations will be empty.
    // Build a synthetic citation from the form_type and filing_date in the
    // context package so the LLM has a real source to cite.
    if (citations.length === 0 && ctx) {
        const formTypeFacts = ctx.seriesByPid['form_type'] ?? ctx.financials['form_type'] ?? [];
        const filingDateFact = latestFact(facts.filingDate);
        const formType = latestFact(formTypeFacts)?.value;
        const filingTitle =
            typeof formType === 'string' && formType.trim()
                ? formType.trim().toUpperCase()
                : '10-K';
        citations = [
            {
                source: 'SEC',
                title: filingTitle,
                date: filingDateFact?.date ?? undefined,
                url: undefined,
            },
        ];
    }

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
