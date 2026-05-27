/**
 * Persistence store for Elemental API + MCP call logs.
 *
 * Two backends, chosen at runtime:
 *
 *   1. Neon Postgres (production / preview) — single `elemental_call_logs`
 *      table created lazily via `CREATE TABLE IF NOT EXISTS`. Inserts are
 *      fire-and-forget so they don't add latency to user requests.
 *
 *   2. Local filesystem NDJSON (`.aether-dev-elemental-logs.jsonl`) — used
 *      when `DATABASE_URL` is missing (i.e. `npm run dev` outside of
 *      Vercel). Lets the Settings → Logs tab work locally too. The file
 *      is gitignored by the same `.aether-dev-*` glob as the prefs
 *      fallback.
 *
 * Public surface:
 *   - `recordElementalCallLog(entry)`   — fire-and-forget write (sync OK).
 *   - `queryElementalCallLogs(filters)` — paginated read.
 *   - `getElementalCallLogStats()`      — small aggregate summary.
 *   - `purgeElementalCallLogs(opts)`    — delete all or older than a date.
 *   - `elementalLogStoreBackend()`      — 'neon' | 'fs' | 'none'.
 *
 * The store is intentionally append-only and best-effort: a failed insert
 * is logged once and dropped. This module must never throw on the write
 * path or it will cascade into every Elemental call.
 */
import { appendFile, mkdir, readFile, stat, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { getDb, isDbConfigured } from './neon';

export interface ElementalCallLogEntry {
    request_id: string;
    started_at: string; // ISO timestamp
    duration_ms: number;
    surface: 'qs-rest' | 'mcp';
    origin: 'server' | 'client';
    method?: string | null;
    endpoint?: string | null;
    server_name?: string | null;
    tool?: string | null;
    caller?: string | null;
    status: number;
    ok: boolean;
    cache?: string | null;
    req_bytes?: number | null;
    res_bytes?: number | null;
    req_summary?: Record<string, unknown> | null;
    res_summary?: Record<string, unknown> | null;
    error?: string | null;
    session_id?: string | null;
    page_path?: string | null;
    user_sub?: string | null;
}

export interface ElementalCallLogQuery {
    limit?: number;
    offset?: number;
    surface?: 'qs-rest' | 'mcp' | null;
    origin?: 'server' | 'client' | null;
    ok?: boolean | null;
    search?: string | null;
    since?: string | null;
}

export interface ElementalCallLogStats {
    totalCalls: number;
    okCalls: number;
    errorCalls: number;
    avgDurationMs: number;
    p95DurationMs: number;
    callsBySurface: Record<string, number>;
    topEndpoints: Array<{ key: string; calls: number; avgDurationMs: number }>;
    topTools: Array<{ key: string; calls: number; avgDurationMs: number }>;
    timeRange?: { earliest: string | null; latest: string | null };
}

export type ElementalLogBackend = 'neon' | 'fs' | 'none';

const TABLE = 'elemental_call_logs';
const FS_STORE_DIR = '.aether-dev-elemental-logs';
const FS_STORE_FILE = 'log.jsonl';
const FS_STORE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB — auto-truncate when exceeded
const RUNTIME_BUFFER_MAX = 5_000; // hard cap to protect memory
const MAX_LIMIT = 500;

let _tableReady = false;
let _tableReadyPromise: Promise<boolean> | null = null;
let _fsReady = false;
let _warnedNeonFailure = false;

/** Returns which backend is currently active. */
export function elementalLogStoreBackend(): ElementalLogBackend {
    if (isDbConfigured()) return 'neon';
    // FS fallback is always available unless the runtime explicitly
    // disables disk writes (which Nitro's serverless preset doesn't).
    return 'fs';
}

/* ------------------------------------------------------------------- *
 * Backend: Neon Postgres
 * ------------------------------------------------------------------- */

async function ensureTable(): Promise<boolean> {
    if (_tableReady) return true;
    if (_tableReadyPromise) return _tableReadyPromise;
    const sql = getDb();
    if (!sql) return false;
    _tableReadyPromise = (async () => {
        try {
            await sql`CREATE TABLE IF NOT EXISTS elemental_call_logs (
                id BIGSERIAL PRIMARY KEY,
                request_id TEXT NOT NULL,
                started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                duration_ms INTEGER NOT NULL,
                surface TEXT NOT NULL,
                origin TEXT NOT NULL,
                method TEXT,
                endpoint TEXT,
                server_name TEXT,
                tool TEXT,
                caller TEXT,
                status INTEGER NOT NULL,
                ok BOOLEAN NOT NULL,
                cache TEXT,
                req_bytes INTEGER,
                res_bytes INTEGER,
                req_summary JSONB,
                res_summary JSONB,
                error TEXT,
                session_id TEXT,
                page_path TEXT,
                user_sub TEXT
            )`;
            await sql`CREATE INDEX IF NOT EXISTS idx_elemental_logs_started_at
                ON elemental_call_logs (started_at DESC)`;
            await sql`CREATE INDEX IF NOT EXISTS idx_elemental_logs_surface
                ON elemental_call_logs (surface)`;
            await sql`CREATE INDEX IF NOT EXISTS idx_elemental_logs_ok
                ON elemental_call_logs (ok)`;
            _tableReady = true;
            return true;
        } catch (err) {
            if (!_warnedNeonFailure) {
                console.warn('[elementalLogStore] table init failed; disabling Neon writes', err);
                _warnedNeonFailure = true;
            }
            return false;
        } finally {
            _tableReadyPromise = null;
        }
    })();
    return _tableReadyPromise;
}

async function neonInsert(entry: ElementalCallLogEntry): Promise<void> {
    const sql = getDb();
    if (!sql) return;
    if (!(await ensureTable())) return;
    try {
        await sql`INSERT INTO elemental_call_logs (
            request_id, started_at, duration_ms, surface, origin,
            method, endpoint, server_name, tool, caller,
            status, ok, cache, req_bytes, res_bytes,
            req_summary, res_summary, error, session_id, page_path, user_sub
        ) VALUES (
            ${entry.request_id}, ${entry.started_at}, ${entry.duration_ms}, ${entry.surface}, ${entry.origin},
            ${entry.method ?? null}, ${entry.endpoint ?? null}, ${entry.server_name ?? null}, ${entry.tool ?? null}, ${entry.caller ?? null},
            ${entry.status}, ${entry.ok}, ${entry.cache ?? null}, ${entry.req_bytes ?? null}, ${entry.res_bytes ?? null},
            ${entry.req_summary ? JSON.stringify(entry.req_summary) : null}::jsonb,
            ${entry.res_summary ? JSON.stringify(entry.res_summary) : null}::jsonb,
            ${entry.error ?? null}, ${entry.session_id ?? null}, ${entry.page_path ?? null}, ${entry.user_sub ?? null}
        )`;
    } catch (err) {
        if (!_warnedNeonFailure) {
            console.warn('[elementalLogStore] insert failed', err);
            _warnedNeonFailure = true;
        }
    }
}

async function neonQuery(filters: ElementalCallLogQuery): Promise<ElementalCallLogEntry[]> {
    const sql = getDb();
    if (!sql) return [];
    if (!(await ensureTable())) return [];
    const limit = Math.min(filters.limit ?? 100, MAX_LIMIT);
    const offset = Math.max(filters.offset ?? 0, 0);
    const surface = filters.surface ?? null;
    const origin = filters.origin ?? null;
    const ok = filters.ok ?? null;
    const since = filters.since ?? null;
    const search = filters.search ? `%${filters.search}%` : null;

    const rows = (await sql`SELECT
        request_id, started_at, duration_ms, surface, origin,
        method, endpoint, server_name, tool, caller,
        status, ok, cache, req_bytes, res_bytes,
        req_summary, res_summary, error, session_id, page_path, user_sub
        FROM elemental_call_logs
        WHERE
            (${surface}::text IS NULL OR surface = ${surface})
            AND (${origin}::text IS NULL OR origin = ${origin})
            AND (${ok}::boolean IS NULL OR ok = ${ok})
            AND (${since}::timestamptz IS NULL OR started_at >= ${since}::timestamptz)
            AND (
                ${search}::text IS NULL
                OR endpoint ILIKE ${search}
                OR tool ILIKE ${search}
                OR caller ILIKE ${search}
                OR server_name ILIKE ${search}
            )
        ORDER BY started_at DESC
        LIMIT ${limit} OFFSET ${offset}`) as unknown as Array<Record<string, unknown>>;

    return rows.map(rowToEntry);
}

async function neonStats(filters: ElementalCallLogQuery): Promise<ElementalCallLogStats> {
    const sql = getDb();
    const empty = emptyStats();
    if (!sql) return empty;
    if (!(await ensureTable())) return empty;
    const surface = filters.surface ?? null;
    const origin = filters.origin ?? null;
    const since = filters.since ?? null;
    try {
        const agg = (await sql`SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ok)::int AS ok_count,
            COUNT(*) FILTER (WHERE NOT ok)::int AS err_count,
            COALESCE(AVG(duration_ms), 0)::int AS avg_ms,
            COALESCE(
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms),
                0
            )::int AS p95_ms,
            MIN(started_at) AS earliest,
            MAX(started_at) AS latest
            FROM elemental_call_logs
            WHERE (${surface}::text IS NULL OR surface = ${surface})
              AND (${origin}::text IS NULL OR origin = ${origin})
              AND (${since}::timestamptz IS NULL OR started_at >= ${since}::timestamptz)`) as unknown as Array<{
            total: number;
            ok_count: number;
            err_count: number;
            avg_ms: number;
            p95_ms: number;
            earliest: string | null;
            latest: string | null;
        }>;

        const bySurface = (await sql`SELECT surface, COUNT(*)::int AS calls
            FROM elemental_call_logs
            WHERE (${origin}::text IS NULL OR origin = ${origin})
              AND (${since}::timestamptz IS NULL OR started_at >= ${since}::timestamptz)
            GROUP BY surface`) as unknown as Array<{ surface: string; calls: number }>;

        const topEndpoints = (await sql`SELECT
                endpoint AS key,
                COUNT(*)::int AS calls,
                COALESCE(AVG(duration_ms), 0)::int AS avg_ms
            FROM elemental_call_logs
            WHERE surface = 'qs-rest'
              AND endpoint IS NOT NULL
              AND (${origin}::text IS NULL OR origin = ${origin})
              AND (${since}::timestamptz IS NULL OR started_at >= ${since}::timestamptz)
            GROUP BY endpoint
            ORDER BY calls DESC
            LIMIT 10`) as unknown as Array<{ key: string; calls: number; avg_ms: number }>;

        const topTools = (await sql`SELECT
                COALESCE(server_name || '→' || tool, server_name, tool) AS key,
                COUNT(*)::int AS calls,
                COALESCE(AVG(duration_ms), 0)::int AS avg_ms
            FROM elemental_call_logs
            WHERE surface = 'mcp'
              AND (server_name IS NOT NULL OR tool IS NOT NULL)
              AND (${origin}::text IS NULL OR origin = ${origin})
              AND (${since}::timestamptz IS NULL OR started_at >= ${since}::timestamptz)
            GROUP BY key
            ORDER BY calls DESC
            LIMIT 10`) as unknown as Array<{ key: string; calls: number; avg_ms: number }>;

        const row = agg[0] ?? {
            total: 0,
            ok_count: 0,
            err_count: 0,
            avg_ms: 0,
            p95_ms: 0,
            earliest: null,
            latest: null,
        };

        return {
            totalCalls: row.total,
            okCalls: row.ok_count,
            errorCalls: row.err_count,
            avgDurationMs: row.avg_ms,
            p95DurationMs: row.p95_ms,
            callsBySurface: Object.fromEntries(bySurface.map((r) => [r.surface, r.calls])),
            topEndpoints: topEndpoints.map((r) => ({
                key: r.key,
                calls: r.calls,
                avgDurationMs: r.avg_ms,
            })),
            topTools: topTools.map((r) => ({
                key: r.key,
                calls: r.calls,
                avgDurationMs: r.avg_ms,
            })),
            timeRange: { earliest: row.earliest, latest: row.latest },
        };
    } catch (err) {
        console.warn('[elementalLogStore] stats query failed', err);
        return empty;
    }
}

async function neonPurge(opts: { olderThan?: string; all?: boolean }): Promise<number> {
    const sql = getDb();
    if (!sql) return 0;
    if (!(await ensureTable())) return 0;
    try {
        if (opts.all) {
            const res = (await sql`DELETE FROM elemental_call_logs`) as unknown as
                | { rowCount?: number }
                | Array<unknown>;
            return (res as any)?.rowCount ?? 0;
        }
        if (opts.olderThan) {
            const res = (await sql`DELETE FROM elemental_call_logs
                WHERE started_at < ${opts.olderThan}::timestamptz`) as unknown as
                | { rowCount?: number }
                | Array<unknown>;
            return (res as any)?.rowCount ?? 0;
        }
        return 0;
    } catch (err) {
        console.warn('[elementalLogStore] purge failed', err);
        return 0;
    }
}

/* ------------------------------------------------------------------- *
 * Backend: local-FS NDJSON
 * ------------------------------------------------------------------- */

function fsStorePath(): string {
    return path.join(process.cwd(), FS_STORE_DIR, FS_STORE_FILE);
}

async function ensureFsStore(): Promise<void> {
    if (_fsReady) return;
    try {
        await mkdir(path.join(process.cwd(), FS_STORE_DIR), { recursive: true });
        _fsReady = true;
    } catch (err) {
        console.warn('[elementalLogStore] fs init failed', err);
    }
}

async function fsAppend(entry: ElementalCallLogEntry): Promise<void> {
    await ensureFsStore();
    if (!_fsReady) return;
    try {
        const filePath = fsStorePath();
        // Best-effort size guard — re-write only the most recent half when oversized.
        try {
            const info = await stat(filePath);
            if (info.size > FS_STORE_MAX_BYTES) {
                const txt = await readFile(filePath, 'utf-8');
                const lines = txt.split('\n').filter(Boolean);
                const keep = lines.slice(-Math.floor(lines.length / 2));
                await writeFile(filePath, keep.join('\n') + '\n', 'utf-8');
            }
        } catch {
            /* file may not exist yet */
        }
        await appendFile(filePath, JSON.stringify(entry) + '\n', 'utf-8');
    } catch (err) {
        console.warn('[elementalLogStore] fs append failed', err);
    }
}

async function fsReadAll(): Promise<ElementalCallLogEntry[]> {
    try {
        const txt = await readFile(fsStorePath(), 'utf-8');
        const out: ElementalCallLogEntry[] = [];
        for (const line of txt.split('\n')) {
            if (!line) continue;
            try {
                out.push(JSON.parse(line) as ElementalCallLogEntry);
            } catch {
                /* skip corrupt line */
            }
        }
        return out;
    } catch {
        return [];
    }
}

async function fsQuery(filters: ElementalCallLogQuery): Promise<ElementalCallLogEntry[]> {
    const all = await fsReadAll();
    const filtered = applyFilters(all, filters);
    filtered.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
    const limit = Math.min(filters.limit ?? 100, MAX_LIMIT);
    const offset = Math.max(filters.offset ?? 0, 0);
    return filtered.slice(offset, offset + limit);
}

async function fsStats(filters: ElementalCallLogQuery): Promise<ElementalCallLogStats> {
    const all = await fsReadAll();
    const filtered = applyFilters(all, filters);
    if (!filtered.length) return emptyStats();
    const durations = filtered.map((e) => e.duration_ms).sort((a, b) => a - b);
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? durations[durations.length - 1];
    const ok = filtered.filter((e) => e.ok).length;
    const callsBySurface: Record<string, number> = {};
    const endpointAgg = new Map<string, { calls: number; total: number }>();
    const toolAgg = new Map<string, { calls: number; total: number }>();
    let earliest = filtered[0].started_at;
    let latest = filtered[0].started_at;
    for (const e of filtered) {
        callsBySurface[e.surface] = (callsBySurface[e.surface] || 0) + 1;
        if (e.started_at < earliest) earliest = e.started_at;
        if (e.started_at > latest) latest = e.started_at;
        if (e.surface === 'qs-rest' && e.endpoint) {
            const bucket = endpointAgg.get(e.endpoint) ?? { calls: 0, total: 0 };
            bucket.calls += 1;
            bucket.total += e.duration_ms;
            endpointAgg.set(e.endpoint, bucket);
        }
        if (e.surface === 'mcp') {
            const key =
                e.server_name && e.tool
                    ? `${e.server_name}→${e.tool}`
                    : (e.tool ?? e.server_name ?? '');
            if (key) {
                const bucket = toolAgg.get(key) ?? { calls: 0, total: 0 };
                bucket.calls += 1;
                bucket.total += e.duration_ms;
                toolAgg.set(key, bucket);
            }
        }
    }
    const sortAgg = (m: Map<string, { calls: number; total: number }>) =>
        Array.from(m.entries())
            .sort((a, b) => b[1].calls - a[1].calls)
            .slice(0, 10)
            .map(([key, v]) => ({
                key,
                calls: v.calls,
                avgDurationMs: Math.round(v.total / v.calls),
            }));

    return {
        totalCalls: filtered.length,
        okCalls: ok,
        errorCalls: filtered.length - ok,
        avgDurationMs: avg,
        p95DurationMs: p95,
        callsBySurface,
        topEndpoints: sortAgg(endpointAgg),
        topTools: sortAgg(toolAgg),
        timeRange: { earliest, latest },
    };
}

async function fsPurge(opts: { olderThan?: string; all?: boolean }): Promise<number> {
    if (opts.all) {
        try {
            await unlink(fsStorePath());
        } catch {
            /* not present */
        }
        return -1;
    }
    if (!opts.olderThan) return 0;
    const all = await fsReadAll();
    const cutoff = opts.olderThan;
    const kept = all.filter((e) => e.started_at >= cutoff);
    const removed = all.length - kept.length;
    if (removed > 0) {
        try {
            await writeFile(
                fsStorePath(),
                kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : ''),
                'utf-8'
            );
        } catch (err) {
            console.warn('[elementalLogStore] fs purge failed', err);
        }
    }
    return removed;
}

/* ------------------------------------------------------------------- *
 * Public API
 * ------------------------------------------------------------------- */

/**
 * Fire-and-forget write. Errors are swallowed so the caller never has
 * to handle them (this is diagnostic logging, not business data).
 */
export function recordElementalCallLog(entry: ElementalCallLogEntry): void {
    const backend = elementalLogStoreBackend();
    if (backend === 'none') return;
    // Cheap memory guard: cap concurrent in-flight writes.
    if (_inflight >= RUNTIME_BUFFER_MAX) {
        if (!_warnedOverflow) {
            console.warn('[elementalLogStore] inflight buffer full; dropping entry');
            _warnedOverflow = true;
        }
        return;
    }
    _inflight += 1;
    const promise = backend === 'neon' ? neonInsert(entry) : fsAppend(entry);
    promise
        .catch(() => undefined)
        .finally(() => {
            _inflight -= 1;
        });
}

let _inflight = 0;
let _warnedOverflow = false;

export async function queryElementalCallLogs(
    filters: ElementalCallLogQuery
): Promise<ElementalCallLogEntry[]> {
    const backend = elementalLogStoreBackend();
    if (backend === 'neon') return neonQuery(filters);
    if (backend === 'fs') return fsQuery(filters);
    return [];
}

export async function getElementalCallLogStats(
    filters: ElementalCallLogQuery = {}
): Promise<ElementalCallLogStats> {
    const backend = elementalLogStoreBackend();
    if (backend === 'neon') return neonStats(filters);
    if (backend === 'fs') return fsStats(filters);
    return emptyStats();
}

export async function purgeElementalCallLogs(
    opts: { olderThan?: string; all?: boolean } = {}
): Promise<number> {
    const backend = elementalLogStoreBackend();
    if (backend === 'neon') return neonPurge(opts);
    if (backend === 'fs') return fsPurge(opts);
    return 0;
}

/* ------------------------------------------------------------------- *
 * Internals
 * ------------------------------------------------------------------- */

function applyFilters(
    rows: ElementalCallLogEntry[],
    filters: ElementalCallLogQuery
): ElementalCallLogEntry[] {
    return rows.filter((e) => {
        if (filters.surface && e.surface !== filters.surface) return false;
        if (filters.origin && e.origin !== filters.origin) return false;
        if (filters.ok != null && e.ok !== filters.ok) return false;
        if (filters.since && e.started_at < filters.since) return false;
        if (filters.search) {
            const needle = filters.search.toLowerCase();
            const hay = [e.endpoint, e.tool, e.caller, e.server_name]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            if (!hay.includes(needle)) return false;
        }
        return true;
    });
}

function rowToEntry(row: Record<string, unknown>): ElementalCallLogEntry {
    return {
        request_id: String(row.request_id),
        started_at:
            row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at),
        duration_ms: Number(row.duration_ms ?? 0),
        surface: (row.surface as 'qs-rest' | 'mcp') ?? 'qs-rest',
        origin: (row.origin as 'server' | 'client') ?? 'server',
        method: (row.method as string) ?? null,
        endpoint: (row.endpoint as string) ?? null,
        server_name: (row.server_name as string) ?? null,
        tool: (row.tool as string) ?? null,
        caller: (row.caller as string) ?? null,
        status: Number(row.status ?? 0),
        ok: Boolean(row.ok),
        cache: (row.cache as string) ?? null,
        req_bytes: row.req_bytes == null ? null : Number(row.req_bytes),
        res_bytes: row.res_bytes == null ? null : Number(row.res_bytes),
        req_summary: (row.req_summary as Record<string, unknown>) ?? null,
        res_summary: (row.res_summary as Record<string, unknown>) ?? null,
        error: (row.error as string) ?? null,
        session_id: (row.session_id as string) ?? null,
        page_path: (row.page_path as string) ?? null,
        user_sub: (row.user_sub as string) ?? null,
    };
}

function emptyStats(): ElementalCallLogStats {
    return {
        totalCalls: 0,
        okCalls: 0,
        errorCalls: 0,
        avgDurationMs: 0,
        p95DurationMs: 0,
        callsBySurface: {},
        topEndpoints: [],
        topTools: [],
        timeRange: { earliest: null, latest: null },
    };
}
