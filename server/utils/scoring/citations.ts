import type { H3Event } from 'h3';

import type { CitationRef } from './types';
import { callMcpTool, extractMcpStructuredContent, drainProvenanceTrails } from './mcpGateway';
import type { ContextPackage } from './contextPackage';

/**
 * Citation resolution.
 *
 * Priority order:
 * 1. Article data already present in the ContextPackage — no network call.
 * 2. `elemental_get_citations` called with `_meta.lovelace/provenance` trails
 *    captured during the MCP tool calls that built the context package.
 * 3. Fallback: bare `{ ref, source: 'Elemental' }` when no enrichment is available.
 */

interface ElementalCitationResult {
    ref?: string;
    source?: string;
    title?: string;
    date?: string;
    url?: string;
    snippet?: string;
}

interface GetCitationsResponse {
    citations?: ElementalCitationResult[];
}

function fallbackCitation(ref: string): CitationRef {
    return { ref, source: 'Elemental' };
}

/**
 * Build a ref → CitationRef map from article data already available in the
 * context package. This is a zero-cost path: no additional network calls.
 */
function buildArticleCitationMap(ctx: ContextPackage | undefined): Map<string, CitationRef> {
    const map = new Map<string, CitationRef>();
    if (!ctx) return map;
    for (const article of ctx.articles) {
        if (!article.ref) continue;
        map.set(article.ref, {
            ref: article.ref,
            title: article.headline ?? undefined,
            source: article.source ?? undefined,
            date: article.publishedDate ?? undefined,
            url: article.url ?? undefined,
        });
    }
    return map;
}

/**
 * Call `elemental_get_citations` with provenance trails and return a
 * ref → CitationRef map for whatever the API resolves.
 */
async function fetchCitationsFromTrails(event: H3Event): Promise<Map<string, CitationRef>> {
    const trails = drainProvenanceTrails(event);
    if (!trails.length) return new Map();

    try {
        const result = await callMcpTool('elemental', 'elemental_get_citations', { trails }, event);
        const data = extractMcpStructuredContent<GetCitationsResponse>(result);
        const citations = Array.isArray(data?.citations) ? data!.citations : [];
        const map = new Map<string, CitationRef>();
        for (const c of citations) {
            if (!c.ref) continue;
            map.set(c.ref, {
                ref: c.ref,
                source: c.source ?? 'Elemental',
                title: c.title,
                date: c.date,
                url: c.url,
                snippet: c.snippet,
            });
        }
        return map;
    } catch {
        // elemental_get_citations is best-effort; never block scoring on failures.
        return new Map();
    }
}

export async function resolveRefs(
    refs: string[],
    event: H3Event,
    ctx?: ContextPackage
): Promise<Map<string, CitationRef>> {
    const out = new Map<string, CitationRef>();

    const unique: string[] = [];
    for (const ref of refs) {
        if (typeof ref !== 'string') continue;
        const trimmed = ref.trim();
        if (!trimmed || out.has(trimmed)) continue;
        unique.push(trimmed);
    }
    if (!unique.length) return out;

    // Path 1: article data from the context package (no network).
    const articleMap = buildArticleCitationMap(ctx);

    // Path 2: provenance-trail citations from elemental_get_citations.
    const trailMap = await fetchCitationsFromTrails(event);

    // Merge, preferring richer data (trail > article > fallback).
    for (const ref of unique) {
        const fromTrail = trailMap.get(ref);
        const fromArticle = articleMap.get(ref);
        if (fromTrail) {
            out.set(ref, fromTrail);
        } else if (fromArticle) {
            out.set(ref, fromArticle);
        } else {
            out.set(ref, fallbackCitation(ref));
        }
    }

    return out;
}
