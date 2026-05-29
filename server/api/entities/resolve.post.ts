/**
 * Batch entity name resolution endpoint.
 *
 * Accepts a list of entity names and returns matched NEIDs from the Elemental
 * knowledge graph. Used by the CSV import flow to pre-resolve names before they
 * are added to a portfolio. Gateway credentials stay server-side.
 */
import { searchEntitiesByNames } from '~/server/utils/scoring/elemental';

interface ResolveBody {
    names?: unknown;
}

interface ResolveResult {
    inputName: string;
    neid: string | null;
    resolvedName: string | null;
    score: number | null;
    resolved: boolean;
}

export default defineEventHandler(async (event) => {
    const body = await readBody<ResolveBody>(event);

    if (!Array.isArray(body?.names) || body.names.length === 0) {
        throw createError({ statusCode: 400, message: 'names must be a non-empty array' });
    }

    const names = (body.names as unknown[])
        .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
        .map((n) => n.trim());

    if (names.length === 0) {
        return { results: [] };
    }

    const matchesByName = await searchEntitiesByNames(names, 1, event);

    const results: ResolveResult[] = names.map((inputName) => {
        const matches = matchesByName[inputName] ?? [];
        const top = matches[0];
        if (top) {
            return {
                inputName,
                neid: top.neid,
                resolvedName: top.name || inputName,
                score: top.score ?? null,
                resolved: true,
            };
        }
        return { inputName, neid: null, resolvedName: null, score: null, resolved: false };
    });

    return { results };
});
