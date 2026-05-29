import type { H3Event } from 'h3';

import type { CitationRef } from './types';

/**
 * Citation resolution.
 *
 * NOTE: This used to call the `elemental_get_citations` MCP tool with the
 * string `ref`/`refs` values pulled off property responses. That tool does
 * NOT accept string refs — its only argument is `trails`, an array of
 * structured provenance coordinates (`{ efid, record_index, atom_index }`)
 * captured from `_meta.lovelace/provenance` on a previous tool response.
 * The scoring code never captures those coordinates, so every one of those
 * calls failed validation (`unexpected additional properties ["refs"/"ref"]`)
 * and silently fell back to a bare `{ ref, source: 'Elemental' }` entry —
 * hundreds of wasted MCP round-trips per render that produced no citations.
 *
 * Until provenance trails are threaded through every fetch, we synthesize the
 * same fallback locally and skip the network entirely. Behavior is unchanged
 * for callers; only the wasted calls are removed.
 *
 * TODO: thread `_meta.lovelace/provenance` trails from the originating tool
 * responses through to here, then call `elemental_get_citations` with a
 * `{ trails: [...] }` payload to render real source details.
 */

function fallbackCitation(ref: string): CitationRef {
    return { ref, source: 'Elemental' };
}

export async function resolveRefs(
    refs: string[],
    _event: H3Event
): Promise<Map<string, CitationRef>> {
    const out = new Map<string, CitationRef>();
    for (const ref of refs) {
        if (typeof ref !== 'string') continue;
        const trimmed = ref.trim();
        if (!trimmed || out.has(trimmed)) continue;
        out.set(trimmed, fallbackCitation(trimmed));
    }
    return out;
}
