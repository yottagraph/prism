import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import type { LensDetail } from './types';

type ActivityLabel =
    | 'high_positive'
    | 'high_negative'
    | 'high_neutral'
    | 'low_positive'
    | 'low_negative'
    | 'low_neutral'
    | 'normal'
    | 'insufficient_data';

export interface NewsSummary24hResult {
    headlineSummary: string | null;
    mentionRatioLabel: ActivityLabel;
    mentionRatioToday: number | null;
    mentionDailyAvg30d: number | null;
    sentimentAvg30d: number | null;
    sentimentTrend: string | null;
    mentionVelocity: number | null;
    hasRealData: boolean;
    detail: LensDetail;
}

function classifyActivity(
    ratio: number | null,
    sentiment: number | null,
    dailyAvg: number | null
): ActivityLabel {
    if (dailyAvg != null && dailyAvg < 1) return 'insufficient_data';
    if (ratio == null || sentiment == null) return 'normal';
    if (ratio > 3 && sentiment > 0.15) return 'high_positive';
    if (ratio > 3 && sentiment < -0.15) return 'high_negative';
    if (ratio > 3) return 'high_neutral';
    if (ratio < 1 && sentiment > 0.15) return 'low_positive';
    if (ratio < 1 && sentiment < -0.15) return 'low_negative';
    if (ratio < 1) return 'low_neutral';
    return 'normal';
}

export async function computeNewsSummary24h(
    event: H3Event,
    portfolioId: string,
    neid: string
): Promise<NewsSummary24hResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'news-24h');
    const cached = await readScoringCache<NewsSummary24hResult>(event, cacheKey);
    if (cached) return cached;

    let hasRealData = false;
    let mentionCount24h = 0;
    let sentimentAvg30d: number | null = null;
    let mentionDailyAvg30d: number | null = null;
    let mentionRatioToday: number | null = null;
    let mentionVelocity: number | null = null;
    const headlines: string[] = [];
    const scores: number[] = [];

    try {
        const relatedResult = await callMcpTool(
            'elemental',
            'elemental_get_related',
            {
                entity_id: { id_type: 'neid', id: neid },
                related_flavor: 'article',
                related_properties: ['headline', 'published_date', 'sentiment', 'source'],
                direction: 'both',
                limit: 120,
            },
            event
        );
        const structured = extractMcpStructuredContent<{
            relationships?: Array<{ properties?: Record<string, { value?: unknown }> }>;
        }>(relatedResult);
        const rows = Array.isArray(structured?.relationships) ? structured.relationships : [];
        if (rows.length > 0) {
            hasRealData = true;
            const nowMs = Date.now();
            const since24h = nowMs - 24 * 60 * 60 * 1000;
            const since30d = nowMs - 30 * 24 * 60 * 60 * 1000;
            let mentions30d = 0;
            rows.forEach((row) => {
                const published = String(row?.properties?.published_date?.value || '');
                const ts = Date.parse(published);
                if (!Number.isFinite(ts)) return;
                if (ts >= since30d) {
                    mentions30d += 1;
                    const sentimentValue = row?.properties?.sentiment?.value;
                    if (typeof sentimentValue === 'number' && Number.isFinite(sentimentValue)) {
                        scores.push(sentimentValue);
                    } else if (typeof sentimentValue === 'string') {
                        const parsed = Number(sentimentValue);
                        if (Number.isFinite(parsed)) scores.push(parsed);
                    }
                }
                if (ts >= since24h) {
                    mentionCount24h += 1;
                    const headline = String(row?.properties?.headline?.value || '').trim();
                    if (headline) headlines.push(headline);
                }
            });

            mentionDailyAvg30d = mentions30d / 30;
            mentionRatioToday =
                mentionDailyAvg30d > 0
                    ? Number((mentionCount24h / mentionDailyAvg30d).toFixed(2))
                    : null;
            sentimentAvg30d =
                scores.length > 0
                    ? scores.reduce((sum, value) => sum + value, 0) / scores.length
                    : null;
            mentionVelocity =
                mentionDailyAvg30d > 0
                    ? Number(
                          ((mentionCount24h - mentionDailyAvg30d) / mentionDailyAvg30d).toFixed(2)
                      )
                    : null;
        }
    } catch (error) {
        console.warn('[news summary 24h] failed', error);
    }

    const mentionRatioLabel = classifyActivity(
        mentionRatioToday,
        sentimentAvg30d,
        mentionDailyAvg30d
    );
    const sentimentTrend =
        sentimentAvg30d == null
            ? null
            : sentimentAvg30d > 0.15
              ? 'improving'
              : sentimentAvg30d < -0.15
                ? 'declining'
                : 'stable';
    const headlineSummary =
        hasRealData && mentionCount24h > 0
            ? `${mentionCount24h} article${mentionCount24h === 1 ? '' : 's'} in the last 24h; 30d sentiment ${
                  sentimentAvg30d != null ? sentimentAvg30d.toFixed(2) : 'n/a'
              }; top: ${headlines.slice(0, 2).join(' | ') || 'No headline titles'}.`
            : hasRealData
              ? 'No recent news coverage in the last 24 hours.'
              : null;

    const out: NewsSummary24hResult = {
        headlineSummary,
        mentionRatioLabel,
        mentionRatioToday,
        mentionDailyAvg30d,
        sentimentAvg30d,
        sentimentTrend,
        mentionVelocity,
        hasRealData,
        detail: {
            metrics: [
                { label: 'Mentions (24h)', value: `${mentionCount24h}` },
                {
                    label: 'Mentions daily avg (30d)',
                    value: mentionDailyAvg30d != null ? mentionDailyAvg30d.toFixed(2) : 'n/a',
                },
                {
                    label: 'Mention ratio',
                    value: mentionRatioToday != null ? mentionRatioToday.toFixed(2) : 'n/a',
                },
                {
                    label: 'Sentiment avg (30d)',
                    value: sentimentAvg30d != null ? sentimentAvg30d.toFixed(2) : 'n/a',
                },
                { label: 'Activity label', value: mentionRatioLabel },
            ],
            findings: [
                {
                    text:
                        headlineSummary ||
                        'No 24h article summary was generated because related article data was unavailable.',
                    citations: [],
                },
            ],
        },
    };
    await writeScoringCache(event, cacheKey, out, 60 * 60);
    return out;
}
