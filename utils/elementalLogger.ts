/**
 * Browser-side logger for every Elemental Query Server REST and MCP
 * JSON-RPC call the app makes from the client.
 *
 * Configuration:
 *   - `localStorage.elementalLog = 'off' | 'summary' | 'verbose'`
 *     Runtime toggle — refresh after changing.
 *   - When unset, defaults to `summary` in dev (`import.meta.env.DEV`) and
 *     `off` in production builds.
 *
 * Emits one styled line per call so the browser console stays scannable:
 *
 *   [elemental][el-…] <caller> qs-rest POST elemental/find 200 ✓ in 234ms
 *     (req=132B res=12.4kB) · exprType=is_type limit=50 → eids=42
 *
 * Verbose mode additionally prints the request/response bodies truncated
 * at 4000 chars so we don't dump entire schemas.
 *
 * NOTE: `utils/` is excluded from Nuxt auto-imports for this project,
 * so callers explicitly `import { beginElementalLog } from
 * '~/utils/elementalLogger'`.
 */

export type ElementalLogLevel = 'off' | 'summary' | 'verbose';

export interface ElementalLogInit {
    surface: 'qs-rest' | 'mcp';
    method?: string;
    endpoint?: string;
    serverName?: string;
    rpcMethod?: string;
    tool?: string;
    caller?: string;
    reqBytes?: number;
    reqSummary?: Record<string, unknown>;
    reqBody?: string;
    sessionId?: string;
}

export interface ElementalLogFinish {
    status: number;
    ok: boolean;
    resBytes?: number;
    resSummary?: Record<string, unknown>;
    resBody?: string;
    error?: unknown;
    cache?: 'hit' | 'miss' | 'stale';
}

export interface ElementalLogContext {
    reqId: string;
    startedAt: number;
    level: ElementalLogLevel;
    finish(result: ElementalLogFinish): void;
}

const MAX_VERBOSE_BODY_CHARS = 4_000;
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_THRESHOLD = 25;
const PERSIST_ENDPOINT = '/api/diag/elemental-logs';
let _counter = 0;
let _cachedLevel: ElementalLogLevel | null = null;
let _persistenceEnabled = true;
const _pendingPersistence: PersistedEntry[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _flushInflight = false;

interface PersistedEntry {
    request_id: string;
    started_at: string;
    duration_ms: number;
    surface: 'qs-rest' | 'mcp';
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
}

function detectLevel(): ElementalLogLevel {
    if (_cachedLevel) return _cachedLevel;
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = (window.localStorage.getItem('elementalLog') || '').toLowerCase();
            if (raw === 'off' || raw === 'summary' || raw === 'verbose') {
                _cachedLevel = raw;
                return raw;
            }
        }
    } catch {
        /* localStorage may throw in sandboxed contexts */
    }
    const isDev = !!(import.meta as any)?.env?.DEV;
    _cachedLevel = isDev ? 'summary' : 'off';
    return _cachedLevel;
}

/**
 * Force a refresh of the cached level. Call from a devtools snippet after
 * setting `localStorage.elementalLog`:
 *
 *   localStorage.elementalLog = 'verbose';
 *   __elementalLog.refresh();
 */
export function refreshElementalLogLevel(): ElementalLogLevel {
    _cachedLevel = null;
    return detectLevel();
}

export function elementalLogLevel(): ElementalLogLevel {
    return detectLevel();
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
        if (init.rpcMethod === 'tools/call' && init.tool) return `${server}→${init.tool}`;
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
    const level = detectLevel();
    const reqId = nextReqId();
    const startedAt = Date.now();

    if (level === 'verbose') {
        const op = describeOperation(init);
        const summary = formatSummary(init.reqSummary);
        const tag = init.caller ? ` <${init.caller}>` : '';
        const session = init.sessionId ? ` session=${init.sessionId.slice(0, 8)}…` : '';
        console.log(
            `%c[elemental][${reqId}]${tag} → ${init.surface} ${op}${session}` +
                ` req=${formatBytes(init.reqBytes)}` +
                (summary ? ` · ${summary}` : ''),
            'color:#888;'
        );
        if (init.reqBody && init.reqBody.length > 0) {
            console.log(
                `%c[elemental][${reqId}]   req body: ${truncate(init.reqBody)}`,
                'color:#888;'
            );
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

            // Persist every call (best-effort, fire-and-forget) regardless
            // of the console log level so the Logs tab captures everything.
            queuePersistence({
                request_id: reqId,
                started_at: new Date(startedAt).toISOString(),
                duration_ms: duration,
                surface: init.surface,
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
                page_path: typeof window !== 'undefined' ? window.location.pathname : null,
            });

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
            const text =
                `[elemental][${reqId}]${tag} ${init.surface} ${op} ${result.status} ${statusGlyph}` +
                ` in ${duration}ms${session}${cache}` +
                ` (req=${formatBytes(init.reqBytes)} res=${formatBytes(result.resBytes)})` +
                `${reqPart}${resPart}${errPart}`;
            const style = result.ok ? 'color:#3fea00;' : 'color:#ef4444;';
            if (result.ok) console.log(`%c${text}`, style);
            else console.warn(`%c${text}`, style);

            if (level === 'verbose' && result.resBody && result.resBody.length > 0) {
                console.log(
                    `%c[elemental][${reqId}]   res body: ${truncate(result.resBody)}`,
                    'color:#888;'
                );
            }
        },
    };
}

/* ------------------------------------------------------------------- *
 * Persistence — batched POST to /api/diag/elemental-logs
 * ------------------------------------------------------------------- */

function queuePersistence(entry: PersistedEntry): void {
    if (!_persistenceEnabled) return;
    // Hard cap so a runaway page doesn't grow the buffer unbounded if the
    // server is unreachable.
    if (_pendingPersistence.length >= 1_000) {
        _pendingPersistence.shift();
    }
    _pendingPersistence.push(entry);
    if (_pendingPersistence.length >= FLUSH_THRESHOLD) {
        void flushPersistence();
    } else {
        scheduleFlush();
    }
}

function scheduleFlush(): void {
    if (_flushTimer || typeof window === 'undefined') return;
    _flushTimer = setTimeout(() => {
        _flushTimer = null;
        void flushPersistence();
    }, FLUSH_INTERVAL_MS);
}

async function flushPersistence(): Promise<void> {
    if (_flushInflight) return;
    if (!_pendingPersistence.length) return;
    if (typeof window === 'undefined') return;
    _flushInflight = true;
    const batch = _pendingPersistence.splice(0, 200);
    try {
        const res = await fetch(PERSIST_ENDPOINT, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries: batch }),
            keepalive: true,
        });
        if (!res.ok) {
            // 401/403/etc → don't keep retrying; just drop the batch.
            if (res.status === 401 || res.status === 403) {
                _persistenceEnabled = false;
            }
        }
    } catch {
        // Network error — push the batch back to the front so we retry on
        // the next tick. Cap reattempts implicitly via the 1000-entry cap.
        _pendingPersistence.unshift(...batch);
    } finally {
        _flushInflight = false;
        if (_pendingPersistence.length >= FLUSH_THRESHOLD) {
            void flushPersistence();
        } else if (_pendingPersistence.length) {
            scheduleFlush();
        }
    }
}

function flushViaBeacon(): void {
    if (typeof navigator === 'undefined' || !_pendingPersistence.length) return;
    const batch = _pendingPersistence.splice(0, _pendingPersistence.length);
    try {
        const blob = new Blob([JSON.stringify({ entries: batch })], {
            type: 'application/json',
        });
        const ok = navigator.sendBeacon?.(PERSIST_ENDPOINT, blob);
        if (!ok) {
            // Beacon refused (queue full or unsupported) → restore for retry.
            _pendingPersistence.unshift(...batch);
        }
    } catch {
        _pendingPersistence.unshift(...batch);
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushViaBeacon();
    });
    window.addEventListener('pagehide', flushViaBeacon);
    window.addEventListener('beforeunload', flushViaBeacon);
}

/* ------------------------------------------------------------------- *
 * Devtools handle
 * ------------------------------------------------------------------- */

if (typeof window !== 'undefined') {
    (window as any).__elementalLog = {
        level: () => detectLevel(),
        refresh: refreshElementalLogLevel,
        set(level: ElementalLogLevel) {
            try {
                window.localStorage.setItem('elementalLog', level);
            } catch {
                /* ignore */
            }
            return refreshElementalLogLevel();
        },
        flush: () => flushPersistence(),
        pendingCount: () => _pendingPersistence.length,
        disablePersistence: () => {
            _persistenceEnabled = false;
        },
        enablePersistence: () => {
            _persistenceEnabled = true;
        },
    };
}
