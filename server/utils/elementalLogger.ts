/**
 * Centralized logger for every Elemental Query Server REST and Elemental
 * MCP JSON-RPC call made from the Nitro server.
 *
 * Goals:
 *   - Surface what the app actually calls so we can spot redundant or
 *     hot calls during a single page render.
 *   - One single-line summary per call (timing, status, payload size,
 *     small structured summary) so the dev terminal stays readable.
 *   - Opt-in verbose mode that also prints request/response bodies.
 *
 * Configuration (env vars):
 *   NUXT_ELEMENTAL_LOG=off       — silence everything (recommended in prod)
 *   NUXT_ELEMENTAL_LOG=summary   — single-line summary per call (default)
 *   NUXT_ELEMENTAL_LOG=verbose   — also dump request/response bodies
 *
 * Defaults:
 *   - production builds   → off
 *   - everything else     → summary
 *
 * Body bytes are always reported. Bodies themselves are only printed in
 * `verbose` mode and are truncated to a sane upper bound so a huge
 * `getPropertyValues` response doesn't bury the console.
 */

import { recordElementalCallLog } from './elementalLogStore';

export type ElementalLogLevel = 'off' | 'summary' | 'verbose';

export interface ElementalLogInit {
    surface: 'qs-rest' | 'mcp';
    method?: string;
    /** QS endpoint relative to the gateway (e.g. `elemental/find`). */
    endpoint?: string;
    /** MCP server name (e.g. `elemental`, `stocks`). */
    serverName?: string;
    /** JSON-RPC method (e.g. `tools/call`, `initialize`). */
    rpcMethod?: string;
    /** MCP tool name when `rpcMethod === 'tools/call'`. */
    tool?: string;
    /** Optional caller / feature label so logs are easy to grep. */
    caller?: string;
    /** Approximate request payload byte size. */
    reqBytes?: number;
    /** Tiny key/value summary of the request (NOT the full body). */
    reqSummary?: Record<string, unknown>;
    /** Raw request body for `verbose` mode only. Truncated when printed. */
    reqBody?: string;
    /** MCP session id (truncated when printed). */
    sessionId?: string;
}

export interface ElementalLogFinish {
    status: number;
    ok: boolean;
    resBytes?: number;
    resSummary?: Record<string, unknown>;
    resBody?: string;
    error?: unknown;
    /** Set when the response came from a local cache (e.g. schema TTL). */
    cache?: 'hit' | 'miss' | 'stale';
}

export interface ElementalLogContext {
    reqId: string;
    startedAt: number;
    level: ElementalLogLevel;
    finish(result: ElementalLogFinish): void;
}

const MAX_VERBOSE_BODY_CHARS = 4_000;
let _counter = 0;

function getLevel(): ElementalLogLevel {
    const raw = (process.env.NUXT_ELEMENTAL_LOG || '').toLowerCase();
    if (raw === 'off' || raw === 'summary' || raw === 'verbose') return raw;
    return process.env.NODE_ENV === 'production' ? 'off' : 'summary';
}

function nextReqId(): string {
    _counter = (_counter + 1) % 1_000_000;
    const time = Date.now().toString(36);
    const seq = _counter.toString(36).padStart(3, '0');
    return `el-${time}-${seq}`;
}

function truncate(s: string, max = MAX_VERBOSE_BODY_CHARS): string {
    if (s.length <= max) return s;
    return `${s.slice(0, max)}… [+${s.length - max} chars]`;
}

function formatSummary(record?: Record<string, unknown>): string {
    if (!record) return '';
    const parts: string[] = [];
    for (const [key, raw] of Object.entries(record)) {
        if (raw === undefined || raw === null) continue;
        if (typeof raw === 'string') {
            const trimmed = raw.length > 80 ? `${raw.slice(0, 77)}...` : raw;
            parts.push(`${key}="${trimmed}"`);
        } else if (typeof raw === 'number' || typeof raw === 'boolean') {
            parts.push(`${key}=${raw}`);
        } else {
            try {
                const s = JSON.stringify(raw);
                parts.push(`${key}=${s.length > 80 ? `${s.slice(0, 77)}...` : s}`);
            } catch {
                parts.push(`${key}=[unserialisable]`);
            }
        }
    }
    return parts.join(' ');
}

function formatBytes(n?: number): string {
    if (!n || n <= 0) return '0B';
    if (n < 1024) return `${n}B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}kB`;
    return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

function describeOperation(init: ElementalLogInit): string {
    if (init.surface === 'mcp') {
        const server = init.serverName || '?';
        if (init.rpcMethod === 'tools/call' && init.tool) {
            return `${server}→${init.tool}`;
        }
        if (init.rpcMethod) return `${server} ${init.rpcMethod}`;
        return server;
    }
    const method = init.method || 'GET';
    const endpoint = init.endpoint || '?';
    return `${method} ${endpoint}`;
}

function formatErrorMessage(err: unknown): string {
    if (!err) return '';
    if (typeof err === 'string') return truncate(err, 300);
    if (err instanceof Error) return err.message;
    try {
        return truncate(JSON.stringify(err), 300);
    } catch {
        return String(err);
    }
}

export function beginElementalLog(init: ElementalLogInit): ElementalLogContext {
    const level = getLevel();
    const reqId = nextReqId();
    const startedAt = Date.now();

    if (level === 'verbose') {
        const op = describeOperation(init);
        const summary = formatSummary(init.reqSummary);
        const tag = init.caller ? ` <${init.caller}>` : '';
        const session = init.sessionId ? ` session=${init.sessionId.slice(0, 8)}…` : '';
        console.log(
            `[elemental][${reqId}]${tag} → ${init.surface} ${op}${session}` +
                ` req=${formatBytes(init.reqBytes)}` +
                (summary ? ` · ${summary}` : '')
        );
        if (init.reqBody && init.reqBody.length > 0) {
            console.log(`[elemental][${reqId}]   req body: ${truncate(init.reqBody)}`);
        }
    }

    let finished = false;
    return {
        reqId,
        startedAt,
        level,
        finish(result: ElementalLogFinish) {
            if (finished) return;
            finished = true;
            const duration = Date.now() - startedAt;

            // Always persist (best-effort, fire-and-forget) regardless of
            // the console log level so the Settings → Logs tab captures
            // every call even when console output is silenced.
            try {
                recordElementalCallLog({
                    request_id: reqId,
                    started_at: new Date(startedAt).toISOString(),
                    duration_ms: duration,
                    surface: init.surface,
                    origin: 'server',
                    method: init.method ?? null,
                    endpoint: init.endpoint ?? null,
                    server_name: init.serverName ?? null,
                    tool: init.tool ?? null,
                    caller: init.caller ?? null,
                    status: result.status,
                    ok: result.ok,
                    cache: result.cache ?? null,
                    req_bytes: init.reqBytes ?? null,
                    res_bytes: result.resBytes ?? null,
                    req_summary: init.reqSummary ?? null,
                    res_summary: result.resSummary ?? null,
                    error: result.error ? formatErrorMessage(result.error) : null,
                    session_id: init.sessionId ?? null,
                });
            } catch {
                /* never let logging break the caller */
            }

            if (level === 'off') return;

            const op = describeOperation(init);
            const tag = init.caller ? ` <${init.caller}>` : '';
            const session = init.sessionId ? ` session=${init.sessionId.slice(0, 8)}…` : '';
            const cache = result.cache ? ` (cache:${result.cache})` : '';
            const reqSummary = formatSummary(init.reqSummary);
            const resSummary = formatSummary(result.resSummary);
            const reqPart = reqSummary ? ` · ${reqSummary}` : '';
            const resPart = resSummary ? ` → ${resSummary}` : '';
            const statusGlyph = result.ok ? '✓' : '✗';
            const errPart = result.error ? ` err=${formatErrorMessage(result.error)}` : '';
            const line =
                `[elemental][${reqId}]${tag} ${init.surface} ${op} ${result.status} ${statusGlyph}` +
                ` in ${duration}ms${session}${cache}` +
                ` (req=${formatBytes(init.reqBytes)} res=${formatBytes(result.resBytes)})` +
                `${reqPart}${resPart}${errPart}`;
            if (result.ok) console.log(line);
            else console.warn(line);

            if (level === 'verbose' && result.resBody && result.resBody.length > 0) {
                console.log(`[elemental][${reqId}]   res body: ${truncate(result.resBody)}`);
            }
        },
    };
}

/** Helper that returns the currently active log level without exposing internals. */
export function elementalLogLevel(): ElementalLogLevel {
    return getLevel();
}
