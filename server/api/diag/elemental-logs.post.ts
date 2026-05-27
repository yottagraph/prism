/**
 * POST /api/diag/elemental-logs
 *
 * Ingest a batch of client-side Elemental call log entries. The browser
 * logger buffers entries and flushes here either on a timer, when the
 * buffer fills, or on page hide via `navigator.sendBeacon`.
 *
 * Body shape (NDJSON-style array):
 *   { entries: ElementalCallLogEntry[] }
 *
 * Each entry must already match the persistence shape — the browser
 * helper sets `origin='client'` and fills in `page_path`. The route
 * just ensures `origin` is locked to `client` (we never trust the
 * browser to claim `server` entries) and persists each row.
 */
import { unsealCookie } from '../../utils/cookies';
import { recordElementalCallLog, type ElementalCallLogEntry } from '../../utils/elementalLogStore';

const MAX_BATCH = 200;

export default defineEventHandler(async (event) => {
    const cookieInfo = await unsealCookie(event);
    const userSub = cookieInfo?.user?.sub ?? null;

    let body: { entries?: unknown } = {};
    try {
        body = await readBody(event);
    } catch {
        body = {};
    }
    const rawEntries = Array.isArray(body?.entries) ? body.entries : [];
    if (!rawEntries.length) return { accepted: 0 };

    let accepted = 0;
    for (const raw of rawEntries.slice(0, MAX_BATCH)) {
        if (!raw || typeof raw !== 'object') continue;
        const e = raw as Partial<ElementalCallLogEntry>;
        if (!e.request_id || !e.started_at || e.duration_ms == null) continue;
        if (e.surface !== 'qs-rest' && e.surface !== 'mcp') continue;
        if (typeof e.status !== 'number' || typeof e.ok !== 'boolean') continue;

        const entry: ElementalCallLogEntry = {
            request_id: String(e.request_id),
            started_at: String(e.started_at),
            duration_ms: Number(e.duration_ms),
            surface: e.surface,
            origin: 'client',
            method: e.method ?? null,
            endpoint: e.endpoint ?? null,
            server_name: e.server_name ?? null,
            tool: e.tool ?? null,
            caller: e.caller ?? null,
            status: Number(e.status),
            ok: Boolean(e.ok),
            cache: e.cache ?? null,
            req_bytes: e.req_bytes ?? null,
            res_bytes: e.res_bytes ?? null,
            req_summary: e.req_summary ?? null,
            res_summary: e.res_summary ?? null,
            error: e.error ?? null,
            session_id: e.session_id ?? null,
            page_path: e.page_path ?? null,
            user_sub: userSub,
        };
        recordElementalCallLog(entry);
        accepted += 1;
    }

    return { accepted };
});
