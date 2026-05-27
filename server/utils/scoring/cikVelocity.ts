import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import type { LensDetail } from './types';

export interface CikVelocityResult {
    trend: 'accelerating' | 'declining' | 'stable' | 'new' | 'inactive' | null;
    qoqPct: number | null;
    latestMentions: number | null;
    prevMentions: number | null;
    latestQuarter: string | null;
    prevQuarter: string | null;
    avgMentions: number | null;
    avgDiffPct: number | null;
    divergenceScore: number | null;
    divergenceLabel: 'gaining-attention' | 'fading' | 'in-sync' | null;
    hasRealData: boolean;
    detail: LensDetail;
}

function quarterKey(date: Date): string {
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    return `${date.getUTCFullYear()}-Q${quarter}`;
}

function classifyTrend(qoqPct: number | null, latest: number): CikVelocityResult['trend'] {
    if (latest === 0) return 'inactive';
    if (qoqPct == null) return latest > 0 ? 'new' : 'inactive';
    if (qoqPct > 15) return 'accelerating';
    if (qoqPct < -15) return 'declining';
    return 'stable';
}

export async function computeCikVelocity(
    event: H3Event,
    portfolioId: string,
    neid: string
): Promise<CikVelocityResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'cik-velocity');
    const cached = await readScoringCache<CikVelocityResult>(event, cacheKey);
    if (cached) return cached;

    const empty: CikVelocityResult = {
        trend: null,
        qoqPct: null,
        latestMentions: null,
        prevMentions: null,
        latestQuarter: null,
        prevQuarter: null,
        avgMentions: null,
        avgDiffPct: null,
        divergenceScore: null,
        divergenceLabel: null,
        hasRealData: false,
        detail: { metrics: [{ label: 'Status', value: 'No CIK velocity data' }], findings: [] },
    };

    try {
        const eventsResult = await callMcpTool(
            'elemental',
            'elemental_get_events',
            {
                entity_id: { id_type: 'neid', id: neid },
                limit: 500,
            },
            event
        );
        const structured = extractMcpStructuredContent<{
            events?: Array<{ properties?: Record<string, { value?: unknown }> }>;
        }>(eventsResult);
        const events = Array.isArray(structured?.events) ? structured.events : [];
        if (events.length === 0) return empty;

        const counts = new Map<string, number>();
        for (const row of events) {
            const dateValue = String(
                row?.properties?.event_date?.value ?? row?.properties?.date?.value ?? ''
            );
            if (!dateValue) continue;
            const ts = Date.parse(dateValue);
            if (!Number.isFinite(ts)) continue;
            const key = quarterKey(new Date(ts));
            counts.set(key, (counts.get(key) || 0) + 1);
        }

        const orderedQuarters = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const latest = orderedQuarters[orderedQuarters.length - 1];
        const prev = orderedQuarters[orderedQuarters.length - 2];
        const latestMentions = latest?.[1] ?? 0;
        const prevMentions = prev?.[1] ?? 0;
        const qoqPct =
            prevMentions > 0 ? ((latestMentions - prevMentions) / prevMentions) * 100 : null;
        const avgMentions =
            orderedQuarters.length > 0
                ? orderedQuarters.reduce((sum, row) => sum + row[1], 0) / orderedQuarters.length
                : null;
        const avgDiffPct =
            avgMentions && avgMentions > 0
                ? ((latestMentions - avgMentions) / avgMentions) * 100
                : null;
        const divergenceScore = qoqPct != null ? qoqPct - (avgDiffPct ?? 0) : null;
        const divergenceLabel =
            divergenceScore == null
                ? null
                : divergenceScore > 25
                  ? 'gaining-attention'
                  : divergenceScore < -25
                    ? 'fading'
                    : 'in-sync';
        const trend = classifyTrend(qoqPct, latestMentions);

        const result: CikVelocityResult = {
            trend,
            qoqPct,
            latestMentions,
            prevMentions: prev?.[1] ?? null,
            latestQuarter: latest?.[0] ?? null,
            prevQuarter: prev?.[0] ?? null,
            avgMentions,
            avgDiffPct,
            divergenceScore,
            divergenceLabel,
            hasRealData: true,
            detail: {
                metrics: [
                    { label: 'Trend', value: trend ?? 'unknown' },
                    {
                        label: 'QoQ change',
                        value: qoqPct != null ? `${qoqPct.toFixed(1)}%` : 'n/a',
                    },
                    { label: 'Latest mentions', value: `${latestMentions}` },
                    { label: 'Prior mentions', value: `${prevMentions}` },
                    { label: 'Divergence', value: divergenceLabel ?? 'n/a' },
                ],
                findings: [
                    {
                        text: `CIK velocity is ${trend ?? 'unknown'} with ${
                            qoqPct != null
                                ? `${qoqPct.toFixed(1)}% QoQ`
                                : 'insufficient QoQ baseline'
                        }.`,
                        citations: [],
                    },
                ],
            },
        };
        await writeScoringCache(event, cacheKey, result, 24 * 60 * 60);
        return result;
    } catch (error) {
        console.warn('[cik velocity] failed', error);
        return empty;
    }
}
