import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import { resolveRefs } from './citations';
import type { ContextPackage } from './contextPackage';
import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import { extractNumeric, getPropertyValues, getSchema, normalizePidMap } from './elemental';
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

    try {
        const schema = await getSchema(event);
        const pid = normalizePidMap(schema);
        const sentimentPid = pid.sentiment ?? pid.news_sentiment ?? pid.article_sentiment;
        const mentionPid = pid.mention_velocity ?? pid.mentions_30d ?? pid.article_count;
        const articlePid = pid.article_count ?? pid.news_count;
        const candidatePids = [sentimentPid, mentionPid, articlePid].filter(
            (v): v is string => typeof v === 'string' && v.length > 0
        );
        if (candidatePids.length) {
            const values = await getPropertyValues([neid], candidatePids, true, event);
            const sentimentValues = extractNumeric(values, sentimentPid ?? '');
            const mentionValues = extractNumeric(values, mentionPid ?? '');
            const articleValues = extractNumeric(values, articlePid ?? '');

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
                findings.push({
                    text: `Average sentiment is ${sentimentAvg.toFixed(
                        2
                    )} with mention velocity ${mentions.toFixed(
                        1
                    )} and approximately ${Math.round(articles)} articles in the active window.`,
                    citations: [],
                });
            }
        }
    } catch (error) {
        console.warn('[news pressure] failed', error);
    }

    if (!hasRealData) {
        try {
            const result = await callMcpTool(
                'elemental',
                'elemental_get_events',
                {
                    entity_id: { id_type: 'neid', id: neid },
                    limit: 25,
                },
                event
            );
            const structured = extractMcpStructuredContent<{
                events?: Array<{ name?: string; properties?: Record<string, any> }>;
            }>(result);
            const events = Array.isArray(structured?.events) ? structured!.events : [];
            if (events.length > 0) {
                hasRealData = true;
                const adverseKeywords = [
                    'bankruptcy',
                    'default',
                    'legal',
                    'regulatory',
                    'restructuring',
                ];
                const adverseCount = events.filter((eventRow) => {
                    const category = String(
                        eventRow?.properties?.category?.value || ''
                    ).toLowerCase();
                    return adverseKeywords.some((keyword) => category.includes(keyword));
                }).length;
                score = clampScore(
                    28 + Math.min(35, adverseCount * 8) + Math.min(20, events.length)
                );
                metrics.push({ label: 'Events (25)', value: `${events.length}` });
                metrics.push({ label: 'Adverse events', value: `${adverseCount}` });
                const eventRefs = events
                    .flatMap((eventRow) =>
                        Object.values(eventRow?.properties || {})
                            .map((property: any) => property?.ref)
                            .filter((ref): ref is string => typeof ref === 'string')
                    )
                    .slice(0, 30);
                const citationMap = await resolveRefs(eventRefs, event);
                events.slice(0, 8).forEach((eventRow) => {
                    const category = String(eventRow?.properties?.category?.value || 'News event');
                    const date = String(eventRow?.properties?.date?.value || '');
                    const description = String(
                        eventRow?.properties?.description?.value || eventRow?.name || category
                    );
                    const refs = Object.values(eventRow?.properties || {})
                        .map((property: any) => property?.ref)
                        .filter((ref): ref is string => typeof ref === 'string');
                    const citations = refs
                        .map((ref) => citationMap.get(ref))
                        .filter((citation): citation is NonNullable<typeof citation> => !!citation);
                    findings.push({
                        text: `${description} (${category})${date ? ` on ${date}` : ''}.`,
                        date: date || undefined,
                        citations,
                    });
                });
            }
        } catch (error) {
            console.warn('[news pressure] elemental_get_events fallback failed', error);
        }
    }

    try {
        const relatedArticlesResult = await callMcpTool(
            'elemental',
            'elemental_get_related',
            {
                entity_id: { id_type: 'neid', id: neid },
                related_flavor: 'article',
                related_properties: ['headline', 'url', 'published_date', 'source'],
                direction: 'both',
                limit: 8,
            },
            event
        );
        const relatedArticles = extractMcpStructuredContent<{
            relationships?: Array<{
                name?: string;
                properties?: Record<string, { value?: unknown; ref?: string }>;
            }>;
        }>(relatedArticlesResult)?.relationships;
        if (Array.isArray(relatedArticles) && relatedArticles.length > 0) {
            hasRealData = true;
            const refs = relatedArticles
                .flatMap((article) =>
                    Object.values(article.properties || {})
                        .map((property) => property?.ref)
                        .filter((ref): ref is string => typeof ref === 'string')
                )
                .slice(0, 24);
            const citationMap = await resolveRefs(refs, event);
            relatedArticles.slice(0, 6).forEach((article) => {
                const headline = String(
                    article?.properties?.headline?.value || article?.name || 'Article'
                );
                const source = String(article?.properties?.source?.value || '');
                const publishedDate = String(article?.properties?.published_date?.value || '');
                const url = String(article?.properties?.url?.value || '');
                const articleRefs = Object.values(article.properties || {})
                    .map((property) => property?.ref)
                    .filter((ref): ref is string => typeof ref === 'string');
                const citations = articleRefs
                    .map((ref) => citationMap.get(ref))
                    .filter((citation): citation is NonNullable<typeof citation> => !!citation)
                    .map((citation) => ({
                        ...citation,
                        url: citation.url || url || undefined,
                        source: citation.source || source || undefined,
                        date: citation.date || publishedDate || undefined,
                        title: citation.title || headline,
                    }));
                if (citations.length === 0 && url) {
                    citations.push({
                        url,
                        source: source || 'Article',
                        date: publishedDate || undefined,
                        title: headline,
                    });
                }
                findings.push({
                    text: `${headline}${source ? ` (${source})` : ''}${
                        publishedDate ? ` published on ${publishedDate}` : ''
                    }.`,
                    date: publishedDate || undefined,
                    citations,
                });
            });
            const existing = metrics.find((metric) => metric.label === 'Articles (window)');
            if (!existing)
                metrics.push({ label: 'Articles (window)', value: `${relatedArticles.length}` });
        }
    } catch (error) {
        console.warn('[news pressure] related articles lookup failed', error);
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
