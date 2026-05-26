import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { extractNumeric, getPropertyValues, getSchema, normalizePidMap } from './elemental';
import { clampScore } from './hash';

interface NewsResult {
    score: number;
    hasRealData: boolean;
    metrics: Array<{ label: string; value: string }>;
    evidence: string[];
}

export async function computeNewsPressureScore(
    event: H3Event,
    portfolioId: string,
    neid: string
): Promise<NewsResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'news');
    const cached = await readScoringCache<NewsResult>(event, cacheKey);
    if (cached) return cached;

    let score = 0;
    let hasRealData = false;
    const metrics: Array<{ label: string; value: string }> = [];
    const evidence: string[] = [];

    try {
        const schema = await getSchema(event);
        const pid = normalizePidMap(schema);
        const sentimentPid = pid.sentiment ?? pid.news_sentiment ?? pid.article_sentiment;
        const mentionPid = pid.mention_velocity ?? pid.mentions_30d ?? pid.article_count;
        const articlePid = pid.article_count ?? pid.news_count;
        const candidatePids = [sentimentPid, mentionPid, articlePid].filter(
            (v): v is number => typeof v === 'number'
        );
        if (candidatePids.length) {
            const values = await getPropertyValues([neid], candidatePids, true, event);
            const sentimentValues = extractNumeric(values, sentimentPid ?? -1);
            const mentionValues = extractNumeric(values, mentionPid ?? -1);
            const articleValues = extractNumeric(values, articlePid ?? -1);

            if (sentimentValues.length || mentionValues.length || articleValues.length) {
                hasRealData = true;
                const sentimentAvg =
                    sentimentValues.length > 0
                        ? sentimentValues.reduce((a, b) => a + b, 0) / sentimentValues.length
                        : -0.15;
                const mentions = mentionValues[0] ?? 0;
                const articles = articleValues[0] ?? 0;
                const adverse = sentimentAvg < 0 ? Math.abs(sentimentAvg) * 60 : 0;
                score = clampScore(
                    30 + adverse + Math.min(25, mentions * 1.2) + Math.min(20, articles * 0.7)
                );

                metrics.push({ label: 'Avg sentiment', value: `${sentimentAvg.toFixed(2)}` });
                metrics.push({ label: 'Mention velocity', value: `${mentions.toFixed(1)}` });
                metrics.push({ label: 'Articles (window)', value: `${Math.round(articles)}` });
                evidence.push('Computed from Elemental news sentiment and mention properties');
            }
        }
    } catch (error) {
        console.warn('[news pressure] failed', error);
    }

    const result: NewsResult = {
        score,
        hasRealData,
        metrics: metrics.length
            ? metrics
            : [{ label: 'Status', value: 'Elemental data unavailable' }],
        evidence: evidence.length
            ? evidence
            : ['No news sentiment signals returned from Elemental sources'],
    };
    await writeScoringCache(event, cacheKey, result);
    return result;
}
