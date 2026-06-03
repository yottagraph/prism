import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { resolveRefs } from './citations';
import type { ContextPackage } from './contextPackage';
import { clampScore } from './hash';
import type { EvidenceItem, LensDetail } from './types';

interface NewsResult {
    score: number;
    hasRealData: boolean;
    detail: LensDetail;
}

export async function computeNewsPressureScore(
    event: H3Event,
    portfolioId: string,
    neid: string,
    ctx?: ContextPackage
): Promise<NewsResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'news');
    const cached = await readScoringCache<NewsResult>(event, cacheKey);
    if (cached) return cached;

    let score = 0;
    let hasRealData = false;
    const metrics: LensDetail['metrics'] = [];
    const findings: EvidenceItem[] = [];
    const refs: string[] = [];

    try {
        const sentimentFacts = [
            ...(ctx?.financials.sentiment ?? []),
            ...(ctx?.financials.news_sentiment ?? []),
            ...(ctx?.financials.article_sentiment ?? []),
        ];
        const mentionFacts = [
            ...(ctx?.financials.mention_velocity ?? []),
            ...(ctx?.financials.mentions_30d ?? []),
            ...(ctx?.financials.article_count ?? []),
        ];
        const articleCountFacts = [
            ...(ctx?.financials.article_count ?? []),
            ...(ctx?.financials.news_count ?? []),
        ];

        const sentimentValues = sentimentFacts
            .map((row) => (typeof row.value === 'number' ? row.value : Number(row.value)))
            .filter((v) => Number.isFinite(v));
        const mentionValues = mentionFacts
            .map((row) => (typeof row.value === 'number' ? row.value : Number(row.value)))
            .filter((v) => Number.isFinite(v));
        const articleValues = articleCountFacts
            .map((row) => (typeof row.value === 'number' ? row.value : Number(row.value)))
            .filter((v) => Number.isFinite(v));
        const articleRows = ctx?.articles ?? [];

        if (
            sentimentValues.length ||
            mentionValues.length ||
            articleValues.length ||
            articleRows.length
        ) {
            hasRealData = true;
            const sentimentAvg =
                sentimentValues.length > 0
                    ? sentimentValues.reduce((a, b) => a + b, 0) / sentimentValues.length
                    : -0.15;
            const mentions = mentionValues[0] ?? 0;
            const articles = articleValues[0] ?? articleRows.length;
            const adverse = sentimentAvg < 0 ? Math.abs(sentimentAvg) * 60 : 0;
            score = clampScore(
                30 + adverse + Math.min(25, mentions * 1.2) + Math.min(20, articles * 0.7)
            );

            metrics.push({ label: 'Avg sentiment', value: `${sentimentAvg.toFixed(2)}` });
            metrics.push({ label: 'Mention velocity', value: `${mentions.toFixed(1)}` });
            metrics.push({ label: 'Articles (window)', value: `${Math.round(articles)}` });
            findings.push({
                text: `Average sentiment is ${sentimentAvg.toFixed(2)} with mention velocity ${mentions.toFixed(1)} and approximately ${Math.round(articles)} articles in the active window.`,
                citations: [],
            });

            for (const row of ctx?.events ?? []) if (row.ref) refs.push(row.ref);
            for (const row of articleRows) if (row.ref) refs.push(row.ref);
            for (const article of articleRows.slice(0, 6)) {
                findings.push({
                    text: `${article.headline || 'Article'}${article.source ? ` (${article.source})` : ''}${article.publishedDate ? ` published on ${article.publishedDate}` : ''}.`,
                    date: article.publishedDate || undefined,
                    citations: [],
                });
            }
        }
    } catch (error) {
        console.warn('[news pressure] failed', error);
    }

    if (refs.length > 0) {
        const citationMap = await resolveRefs(refs, event, ctx);
        for (let i = 0; i < findings.length; i++) {
            if (findings[i].citations.length > 0) continue;
            findings[i].citations = refs
                .map((ref) => citationMap.get(ref))
                .filter((c): c is NonNullable<typeof c> => Boolean(c))
                .slice(0, 2);
        }
    }

    const result: NewsResult = {
        score,
        hasRealData,
        detail: {
            metrics: metrics.length
                ? metrics
                : [{ label: 'Status', value: 'Elemental news data unavailable' }],
            findings: findings.length
                ? findings
                : [
                      {
                          text: 'No news events or related articles were returned for this entity.',
                          citations: [],
                      },
                  ],
        },
    };
    await writeScoringCache(event, cacheKey, result);
    return result;
}
