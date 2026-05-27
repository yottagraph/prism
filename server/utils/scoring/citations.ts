import type { H3Event } from 'h3';

import { callMcpTool, extractMcpStructuredContent } from './mcpGateway';
import type { CitationRef } from './types';

type CitationPayload = {
    ref?: string;
    hash?: string;
    title?: string;
    url?: string;
    source?: string;
    publisher?: string;
    date?: string;
    published_at?: string;
    snippet?: string;
    summary?: string;
};

function normalizeCitation(payload: CitationPayload | undefined, fallbackRef: string): CitationRef {
    const ref = payload?.ref || payload?.hash || fallbackRef;
    const source = payload?.source || payload?.publisher;
    const date = payload?.date || payload?.published_at;
    const snippet = payload?.snippet || payload?.summary;
    return {
        ref,
        title: payload?.title,
        url: payload?.url,
        source: source || (payload ? 'Elemental' : undefined),
        date,
        snippet,
    };
}

function getContextCache(event: H3Event): Map<string, CitationRef> {
    const context = event.context as Record<string, unknown>;
    const existing = context.__citationCache;
    if (existing instanceof Map) return existing as Map<string, CitationRef>;
    const cache = new Map<string, CitationRef>();
    context.__citationCache = cache;
    return cache;
}

function extractCitationRows(result: any): CitationPayload[] {
    const structured = extractMcpStructuredContent<any>(result) ?? result;
    if (!structured || typeof structured !== 'object') return [];
    if (Array.isArray(structured.citations)) return structured.citations as CitationPayload[];
    if (Array.isArray(structured.results)) return structured.results as CitationPayload[];
    if (Array.isArray(structured.items)) return structured.items as CitationPayload[];
    if (Array.isArray(structured.data)) return structured.data as CitationPayload[];
    if (structured.citation && typeof structured.citation === 'object') {
        return [structured.citation as CitationPayload];
    }
    return [];
}

async function fetchOneRef(ref: string, event: H3Event): Promise<CitationRef | null> {
    try {
        const result = await callMcpTool('elemental', 'elemental_get_citations', { refs: [ref] }, event);
        const rows = extractCitationRows(result);
        if (rows.length > 0) return normalizeCitation(rows[0], ref);
    } catch (error) {
        console.warn('[citations] batch-by-ref failed', { ref, error });
    }
    try {
        const result = await callMcpTool('elemental', 'elemental_get_citations', { ref }, event);
        const rows = extractCitationRows(result);
        if (rows.length > 0) return normalizeCitation(rows[0], ref);
    } catch (error) {
        console.warn('[citations] singular-ref failed', { ref, error });
    }
    return null;
}

export async function resolveRefs(refs: string[], event: H3Event): Promise<Map<string, CitationRef>> {
    const uniqueRefs = Array.from(
        new Set(refs.filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0))
    );
    const out = new Map<string, CitationRef>();
    if (!uniqueRefs.length) return out;

    const cache = getContextCache(event);
    const missing: string[] = [];
    for (const ref of uniqueRefs) {
        const hit = cache.get(ref);
        if (hit) {
            out.set(ref, hit);
        } else {
            missing.push(ref);
        }
    }
    if (!missing.length) return out;

    try {
        const result = await callMcpTool('elemental', 'elemental_get_citations', { refs: missing }, event);
        const rows = extractCitationRows(result);
        rows.forEach((row) => {
            const normalized = normalizeCitation(row, row?.ref || row?.hash || '');
            if (!normalized.ref) return;
            cache.set(normalized.ref, normalized);
            out.set(normalized.ref, normalized);
        });
    } catch (error) {
        console.warn('[citations] multi-ref fetch failed', error);
    }

    for (const ref of missing) {
        if (out.has(ref)) continue;
        const citation = await fetchOneRef(ref, event);
        const normalized = citation || { ref, source: 'Elemental' };
        cache.set(ref, normalized);
        out.set(ref, normalized);
    }

    return out;
}
