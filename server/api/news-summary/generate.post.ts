/**
 * POST /api/news-summary/generate
 *
 * Generate per-entity AI headline summaries for a portfolio after a scan
 * completes. Runs off the scan critical path: the client fires this
 * fire-and-forget once the scan 'done' event arrives, and the results
 * trickle back into the MonitorTable as they land.
 *
 * For each entity: fetch recent article headlines via one MCP call, then
 * call Gemini for a 2-3 sentence summary. Returns a flat map so the client
 * can merge summaries into entity.monitor.headlineSummary.
 *
 * Input:  { entities: Array<{ neid: string; resolvedName: string }> }
 * Output: { summaries: Record<neid, string | null> }
 */

import { requireAuth } from '~/server/utils/requireAuth';
import { callMcpTool, extractMcpStructuredContent } from '~/server/utils/scoring/mcpGateway';
import { callGemini, GEMINI_DEFAULT_MODEL } from '~/server/utils/gemini';
import { normalizeArticleDate } from '~/server/utils/scoring/newsSummary24h';

interface EntityInput {
    neid: string;
    resolvedName: string;
}

interface GenerateRequest {
    entities: EntityInput[];
}

interface RecentHeadline {
    headline: string;
    publishedAt: number;
}

function buildFallbackSummary(headlines: string[], mentionCount: number): string {
    const top = headlines.slice(0, 3);
    if (top.length === 0) {
        return 'No recent news coverage in the last 24 hours.';
    }

    return `${mentionCount} article${mentionCount === 1 ? '' : 's'} in the last 24h: ${top.join(' | ')}.`;
}

async function buildHeadlineSummary(neid: string, resolvedName: string): Promise<string | null> {
    try {
        const result = await callMcpTool('elemental', 'elemental_get_related', {
            entity_id: { id_type: 'neid', id: neid },
            related_flavor: 'article',
            related_properties: ['headline', 'published_date', 'sentiment'],
            direction: 'both',
            limit: 120,
        });

        const structured = extractMcpStructuredContent<{
            relationships?: Array<{
                properties?: Record<string, { value?: unknown }>;
            }>;
        }>(result);
        const rows = Array.isArray(structured?.relationships) ? structured!.relationships : [];

        const nowMs = Date.now();
        const since24h = nowMs - 24 * 60 * 60 * 1000;
        const since30d = nowMs - 30 * 24 * 60 * 60 * 1000;

        const recentHeadlines: RecentHeadline[] = [];
        const seenHeadlines = new Set<string>();
        const sentimentScores: number[] = [];
        let mentions30d = 0;
        let mentionCount24h = 0;

        for (const row of rows) {
            const rawDate = row?.properties?.published_date?.value
                ? String(row.properties.published_date.value)
                : null;
            const normalized = normalizeArticleDate(rawDate);
            const ts = normalized ? Date.parse(normalized) : NaN;
            if (!Number.isFinite(ts)) continue;

            if (ts >= since30d) {
                mentions30d++;
                const sv = row?.properties?.sentiment?.value;
                const s =
                    typeof sv === 'number' && Number.isFinite(sv)
                        ? sv
                        : typeof sv === 'string' && Number.isFinite(Number(sv))
                          ? Number(sv)
                          : null;
                if (s !== null) sentimentScores.push(s);
            }

            if (ts >= since24h) {
                mentionCount24h++;
                const h = row?.properties?.headline?.value
                    ? String(row.properties.headline.value).trim()
                    : null;
                const normalizedHeadline = h?.replace(/\s+/g, ' ');
                const key = normalizedHeadline?.toLowerCase();
                if (normalizedHeadline && key && !seenHeadlines.has(key)) {
                    seenHeadlines.add(key);
                    recentHeadlines.push({ headline: normalizedHeadline, publishedAt: ts });
                }
            }
        }

        if (mentions30d === 0) return null;

        const headlines = recentHeadlines
            .sort((a, b) => b.publishedAt - a.publishedAt)
            .map((item) => item.headline);

        if (mentionCount24h === 0 || headlines.length === 0) {
            return 'No recent news coverage in the last 24 hours.';
        }

        const sentimentAvg =
            sentimentScores.length > 0
                ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
                : null;
        const sentimentNote =
            sentimentAvg != null
                ? ` 30-day sentiment average: ${sentimentAvg.toFixed(2)} (${sentimentAvg > 0.15 ? 'positive' : sentimentAvg < -0.15 ? 'negative' : 'neutral'}).`
                : '';

        const headlineList = headlines
            .slice(0, 12)
            .map((h, i) => `${i + 1}. ${h}`)
            .join('\n');

        const prompt =
            `You are a financial risk analyst writing a brief for a risk dashboard table cell. ` +
            `Write exactly 2 concise sentences (45-75 words total) summarizing the concrete developments in ` +
            `these ${mentionCount24h} news headlines about ${resolvedName} from the last 24 hours. ` +
            `Group related headlines into themes, name the specific events or risks, and avoid generic phrases like "recent coverage". ` +
            `Do not start with "Based on", "According to", or "The headlines". ` +
            `If the headlines are unrelated, summarize the two most material items instead of forcing a single narrative.` +
            `${sentimentNote}\n\nHeadlines:\n${headlineList}`;

        const geminiResult = await callGemini({
            prompt,
            model: GEMINI_DEFAULT_MODEL,
            maxTokens: 160,
            temperature: 0.2,
            timeoutMs: 12_000,
        });

        if (geminiResult.text?.trim()) {
            return geminiResult.text.trim().replace(/^["']|["']$/g, '');
        }

        return buildFallbackSummary(headlines, mentionCount24h);
    } catch {
        return null;
    }
}

export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const body = await readBody<GenerateRequest>(event);

    if (!Array.isArray(body?.entities) || body.entities.length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'entities array is required' });
    }

    const entities = body.entities.filter((e) => e?.neid && e?.resolvedName);
    const summaries: Record<string, string | null> = {};

    // Process in batches of 6 to stay within elemental semaphore budget
    // without blocking the response for too long.
    const BATCH = 6;
    for (let i = 0; i < entities.length; i += BATCH) {
        const chunk = entities.slice(i, i + BATCH);
        const results = await Promise.all(
            chunk.map((e) => buildHeadlineSummary(e.neid, e.resolvedName))
        );
        chunk.forEach((e, idx) => {
            summaries[e.neid] = results[idx];
        });
    }

    return { summaries };
});
