import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from './cache';
import type { ContextPackage } from './contextPackage';
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

/**
 * Normalize a raw date string to something Date.parse() can handle.
 * Handles ISO 8601, "YYYY-MM-DD HH:MM:SS", date-only strings, and numeric
 * epoch values (seconds or milliseconds from Galaxy q.time).
 */
export function normalizeArticleDate(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const s = String(raw).trim();
    if (!s) return null;
    // Numeric epoch — could be seconds or milliseconds
    const numeric = Number(s);
    if (Number.isFinite(numeric) && numeric > 0) {
        // Heuristic: anything < 2e10 is seconds, otherwise ms
        const ms = numeric < 2e10 ? numeric * 1000 : numeric;
        return new Date(ms).toISOString();
    }
    // "YYYY-MM-DD HH:MM:SS" → ISO (replace space with T)
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
        return s.replace(' ', 'T');
    }
    // Already ISO or date-only — return as-is
    return s;
}

function classifyActivity(
    ratio: number | null,
    sentiment: number | null,
    mentions30d: number
): ActivityLabel {
    // Only flag as "low volume" when there are genuinely zero mentions in 30d
    if (mentions30d === 0) return 'insufficient_data';
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
    neid: string,
    ctx?: ContextPackage
): Promise<NewsSummary24hResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'news-24h');
    const cached = await readScoringCache<NewsSummary24hResult>(event, cacheKey);
    if (cached) return cached;

    let hasRealData = false;
    let mentionCount24h = 0;
    let mentions30d = 0;
    let sentimentAvg30d: number | null = null;
    let mentionDailyAvg30d: number | null = null;
    let mentionRatioToday: number | null = null;
    let mentionVelocity: number | null = null;
    const headlines: string[] = [];
    const scores: number[] = [];

    try {
        interface ArticleRow {
            publishedDate: string | null;
            headline: string | null;
            sentiment: number | null;
        }

        let articleRows: ArticleRow[] = [];

        // Galaxy article quads only carry a timestamp (no headline/sentiment).
        // Use them as a first pass; if they yield no usable headline data, fall
        // through to the Elemental MCP call which returns rich article metadata.
        if (ctx) {
            const ctxRows = ctx.articles.map((a) => ({
                publishedDate: a.publishedDate,
                headline: a.headline,
                sentiment: a.sentiment,
            }));
            const hasHeadlines = ctxRows.some((r) => r.headline?.trim());
            if (hasHeadlines) {
                articleRows = ctxRows;
            }
        }

        if (articleRows.length === 0) {
            // Either no ctx (legacy mode) or Galaxy ctx had no article headlines —
            // fetch rich article metadata from Elemental.
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
            articleRows = rows.map((row) => {
                const sentimentValue = row?.properties?.sentiment?.value;
                let sentiment: number | null = null;
                if (typeof sentimentValue === 'number' && Number.isFinite(sentimentValue)) {
                    sentiment = sentimentValue;
                } else if (typeof sentimentValue === 'string') {
                    const p = Number(sentimentValue);
                    if (Number.isFinite(p)) sentiment = p;
                }
                return {
                    publishedDate: row?.properties?.published_date?.value
                        ? String(row.properties.published_date.value)
                        : null,
                    headline: row?.properties?.headline?.value
                        ? String(row.properties.headline.value)
                        : null,
                    sentiment,
                };
            });
        }

        if (articleRows.length > 0) {
            hasRealData = true;
            const nowMs = Date.now();
            const since24h = nowMs - 24 * 60 * 60 * 1000;
            const since30d = nowMs - 30 * 24 * 60 * 60 * 1000;
            articleRows.forEach((row) => {
                const normalized = normalizeArticleDate(row.publishedDate);
                const ts = normalized ? Date.parse(normalized) : NaN;
                if (!Number.isFinite(ts)) return;
                if (ts >= since30d) {
                    mentions30d += 1;
                    if (row.sentiment != null) scores.push(row.sentiment);
                }
                if (ts >= since24h) {
                    mentionCount24h += 1;
                    if (row.headline?.trim()) headlines.push(row.headline.trim());
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

    const mentionRatioLabel = classifyActivity(mentionRatioToday, sentimentAvg30d, mentions30d);
    const sentimentTrend =
        sentimentAvg30d == null
            ? null
            : sentimentAvg30d > 0.15
              ? 'improving'
              : sentimentAvg30d < -0.15
                ? 'declining'
                : 'stable';

    // Use a lightweight fallback string during the scan. The AI-generated
    // per-entity headline summary is produced post-scan via the
    // /api/news-summary/generate endpoint (fire-and-forget from the client),
    // mirroring how the portfolio briefing is generated.
    let headlineSummary: string | null = null;
    if (hasRealData && mentionCount24h > 0 && headlines.length > 0) {
        headlineSummary = `${mentionCount24h} article${mentionCount24h === 1 ? '' : 's'} in the last 24h. Top: ${headlines.slice(0, 2).join(' | ') || 'no headlines'}.`;
    } else if (hasRealData) {
        headlineSummary = 'No recent news coverage in the last 24 hours.';
    }

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
