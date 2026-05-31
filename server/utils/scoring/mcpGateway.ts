import type { H3Event } from 'h3';
import { beginElementalLog } from '../elementalLogger';

const mcpSessionIds = new Map<string, string>();

/* ------------------------------------------------------------------- *
 * Per-server concurrency semaphore
 * ------------------------------------------------------------------- */

const SERVER_CONCURRENCY_CAPS: Record<string, number> = {
    stocks: 5,
    polymarket: 5,
    elemental: 10,
};
const DEFAULT_CONCURRENCY_CAP = 8;

class Semaphore {
    private running = 0;
    private queue: Array<() => void> = [];
    constructor(private readonly max: number) {}

    acquire(): Promise<void> {
        if (this.running < this.max) {
            this.running++;
            return Promise.resolve();
        }
        return new Promise<void>((resolve) => this.queue.push(resolve));
    }

    release(): void {
        const next = this.queue.shift();
        if (next) {
            next();
        } else {
            this.running--;
        }
    }
}

const semaphores = new Map<string, Semaphore>();

function getSemaphore(serverName: string): Semaphore {
    let sem = semaphores.get(serverName);
    if (!sem) {
        const cap = SERVER_CONCURRENCY_CAPS[serverName] ?? DEFAULT_CONCURRENCY_CAP;
        sem = new Semaphore(cap);
        semaphores.set(serverName, sem);
    }
    return sem;
}

/* ------------------------------------------------------------------- *
 * Retry helpers
 * ------------------------------------------------------------------- */

// 429 = rate limited (always worth a backoff retry).
// 502/504 = the portal gateway gave up waiting on a slow upstream (this is
// what the `stocks` MCP returns on a cold symbol, where the server takes
// ~60s but the gateway caps at 30s). Retrying those inline rarely lands
// inside the request window and just multiplies latency, so they are NOT
// retried for "slow" servers (see SLOW_UPSTREAM_SERVERS).
const RETRIABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

// Per-call hard timeout. The gateway itself times out upstream calls at
// ~30s; this is a defensive ceiling so a hung socket can never pin a
// semaphore slot indefinitely.
const CALL_TIMEOUT_MS: Record<string, number> = {
    stocks: 32_000,
    polymarket: 20_000,
    elemental: 20_000,
};
const DEFAULT_CALL_TIMEOUT_MS = 20_000;

// Servers whose upstream is known to be slow (cold computations exceed the
// gateway's 30s ceiling). For these we do not retry gateway-timeout codes
// (502/504) and we guard them with a circuit breaker.
const SLOW_UPSTREAM_SERVERS = new Set(['stocks']);

function isRetriable(error: any, serverName: string): boolean {
    const code = error?.statusCode ?? error?.status;
    if (typeof code !== 'number') return false;
    if (code === 429) return true;
    // Don't retry gateway-timeout codes for slow upstreams — it never helps
    // inside the request window and triples the wall-clock cost.
    if (SLOW_UPSTREAM_SERVERS.has(serverName)) return false;
    return RETRIABLE_STATUS_CODES.has(code);
}

/* ------------------------------------------------------------------- *
 * Circuit breaker (slow / failing upstreams)
 * ------------------------------------------------------------------- */

interface BreakerState {
    failures: number;
    openUntil: number;
}

const BREAKER_THRESHOLD = 3; // consecutive timeouts before tripping
const BREAKER_COOLDOWN_MS = 60_000; // skip the server while open
const breakers = new Map<string, BreakerState>();

function isBreakerTrippingStatus(code: number | undefined): boolean {
    // Network failure (0/undefined) or a gateway upstream-timeout (502/504).
    return code === undefined || code === 0 || code === 502 || code === 504;
}

function breakerOpen(serverName: string): boolean {
    if (!SLOW_UPSTREAM_SERVERS.has(serverName)) return false;
    const state = breakers.get(serverName);
    return !!state && state.openUntil > Date.now();
}

function recordBreakerResult(serverName: string, trippingFailure: boolean): void {
    if (!SLOW_UPSTREAM_SERVERS.has(serverName)) return;
    let state = breakers.get(serverName);
    if (!state) {
        state = { failures: 0, openUntil: 0 };
        breakers.set(serverName, state);
    }
    if (trippingFailure) {
        state.failures += 1;
        if (state.failures >= BREAKER_THRESHOLD) {
            state.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
            state.failures = 0;
            console.warn(
                `[mcpGateway] circuit opened for "${serverName}" after ${BREAKER_THRESHOLD} ` +
                    `consecutive upstream timeouts; skipping calls for ${BREAKER_COOLDOWN_MS / 1000}s. ` +
                    `(Cold symbols warm the server cache as a side effect, so subsequent loads recover.)`
            );
        }
    } else {
        state.failures = 0;
        state.openUntil = 0;
    }
}

/** Reset all circuit breakers — call at the start of a fresh scan. */
export function resetMcpBreakers(): void {
    breakers.clear();
}

function backoffMs(attempt: number): number {
    const base = BASE_DELAY_MS * Math.pow(3, attempt - 1);
    const jitter = base * 0.2 * (Math.random() * 2 - 1);
    return Math.round(base + jitter);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function gatewayConfig() {
    const { public: config } = useRuntimeConfig();
    return {
        gatewayUrl: (config as any).gatewayUrl as string,
        tenantOrgId: (config as any).tenantOrgId as string,
        qsApiKey: (config as any).qsApiKey as string,
    };
}

function mcpUrl(serverName: string) {
    const { gatewayUrl, tenantOrgId } = gatewayConfig();
    if (!gatewayUrl || !tenantOrgId) {
        throw createError({ statusCode: 503, statusMessage: 'MCP gateway not configured' });
    }
    return `${gatewayUrl}/api/mcp/${tenantOrgId}/${serverName}/mcp`;
}

function parseSseJson(text: string): any {
    const lines = text.split('\n');
    const dataLines = lines
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length).trim())
        .filter(Boolean);
    const payload = dataLines[dataLines.length - 1];
    if (!payload) return {};
    return JSON.parse(payload);
}

async function postRpcOnce(
    serverName: string,
    payload: Record<string, unknown>,
    sessionId: string | undefined,
    attempt: number
) {
    const { qsApiKey } = gatewayConfig();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(qsApiKey ? { 'X-Api-Key': qsApiKey } : {}),
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const rpcMethod = typeof payload?.method === 'string' ? (payload.method as string) : undefined;
    const params: any = (payload as any)?.params;
    const tool = rpcMethod === 'tools/call' && params?.name ? String(params.name) : undefined;
    const body = JSON.stringify(payload);

    const reqSummary: Record<string, unknown> = {};
    if (rpcMethod === 'tools/call' && params?.arguments) {
        const argKeys = Object.keys(params.arguments);
        reqSummary.args = argKeys.length;
        if (argKeys.length) reqSummary.argKeys = argKeys.join(',');
    }
    if (attempt > 1) reqSummary.attempt = attempt;

    const logCtx = beginElementalLog({
        surface: 'mcp',
        serverName,
        rpcMethod,
        tool,
        caller: tool ? `mcp:${serverName}:${tool}` : `mcp:${serverName}:${rpcMethod ?? 'rpc'}`,
        reqBytes: body.length,
        reqSummary,
        reqBody: body,
        sessionId,
    });

    const timeoutMs = CALL_TIMEOUT_MS[serverName] ?? DEFAULT_CALL_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
        response = await fetch(mcpUrl(serverName), {
            method: 'POST',
            headers,
            body,
            signal: controller.signal,
        });
    } catch (err) {
        const aborted = controller.signal.aborted;
        logCtx.finish({
            status: aborted ? 504 : 0,
            ok: false,
            error: aborted ? `aborted after ${timeoutMs}ms` : err,
        });
        if (aborted) {
            throw createError({
                statusCode: 504,
                statusMessage: `MCP ${serverName} timed out after ${timeoutMs}ms`,
            });
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }

    const responseText = await response.text();
    const returnedSessionId = response.headers.get('mcp-session-id') || undefined;
    if (!response.ok) {
        logCtx.finish({
            status: response.status,
            ok: false,
            resBytes: responseText.length,
            resBody: responseText,
            error: responseText,
        });
        const err = createError({
            statusCode: response.status,
            statusMessage: responseText || `MCP request failed (${response.status})`,
        });
        throw err;
    }

    let frame: any = {};
    try {
        frame = parseSseJson(responseText);
    } catch (err) {
        logCtx.finish({
            status: response.status,
            ok: false,
            resBytes: responseText.length,
            resBody: responseText,
            error: err,
        });
        throw err;
    }

    const rpcError = frame?.error;
    const resSummary = summarizeMcpFrame(rpcMethod, tool, frame);
    if (returnedSessionId && !sessionId) resSummary.newSession = true;
    if (attempt > 1) resSummary.attempt = attempt;
    logCtx.finish({
        status: response.status,
        ok: !rpcError,
        resBytes: responseText.length,
        resBody: responseText,
        resSummary,
        error: rpcError ? rpcError : undefined,
    });
    return { frame, returnedSessionId };
}

async function postRpc(serverName: string, payload: Record<string, unknown>, sessionId?: string) {
    let lastError: any;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await postRpcOnce(serverName, payload, sessionId, attempt);
        } catch (err: any) {
            lastError = err;
            if (attempt < MAX_ATTEMPTS && isRetriable(err, serverName)) {
                const delay = backoffMs(attempt);
                await sleep(delay);
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}

function summarizeMcpFrame(
    rpcMethod: string | undefined,
    tool: string | undefined,
    frame: any
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (!frame || typeof frame !== 'object') return out;
    if (frame.error) {
        out.errorCode = frame.error?.code;
        out.errorMessage = frame.error?.message;
        return out;
    }
    const result = frame.result;
    if (!result) return out;
    if (rpcMethod === 'tools/list') {
        out.tools = result?.tools?.length ?? 0;
        return out;
    }
    if (rpcMethod === 'tools/call') {
        if (tool) out.tool = tool;
        if (result.structuredContent) out.structured = true;
        if (Array.isArray(result.content)) {
            out.contentBlocks = result.content.length;
            const textBlock = result.content.find((c: any) => c?.type === 'text');
            if (textBlock?.text) out.textBytes = String(textBlock.text).length;
        }
        if (result.isError) out.toolError = true;
        return out;
    }
    if (rpcMethod === 'initialize') {
        out.protocol = result?.protocolVersion;
        const sname = result?.serverInfo?.name;
        if (sname) out.serverInfo = sname;
        return out;
    }
    return out;
}

async function ensureSession(serverName: string) {
    const existing = mcpSessionIds.get(serverName);
    if (existing) return existing;

    const initialize = await postRpc(serverName, {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'initialize',
        params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'prism-scoring', version: '1.0.0' },
        },
    });
    const sessionId = initialize.returnedSessionId;
    if (!sessionId) {
        throw createError({
            statusCode: 502,
            statusMessage: 'MCP session id missing on initialize',
        });
    }
    mcpSessionIds.set(serverName, sessionId);

    await postRpc(
        serverName,
        {
            jsonrpc: '2.0',
            method: 'notifications/initialized',
        },
        sessionId
    );

    return sessionId;
}

export interface CallMcpToolOptions {
    /** Skip the circuit breaker check — call fires even when the breaker is open. */
    bypassBreaker?: boolean;
    /**
     * Don't record the result (success or failure) into the circuit breaker.
     * Used by background prewarm calls whose 502s are expected and must not
     * trip the breaker before the real scoring calls have a chance to run.
     */
    silentBreaker?: boolean;
    /**
     * Skip the per-server concurrency semaphore.
     * Used by background prewarm calls so they don't occupy semaphore slots
     * that the actual scoring calls need. Without this, all 5 stock semaphore
     * slots get held by 30-second cold-start prewarm calls and scoring calls
     * queue behind them, hitting the 6s withTimeout before any slot opens.
     */
    bypassSemaphore?: boolean;
}

export async function callMcpTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    _event?: H3Event,
    opts: CallMcpToolOptions = {}
) {
    if (!opts.bypassBreaker && breakerOpen(serverName)) {
        throw createError({
            statusCode: 503,
            statusMessage: `MCP ${serverName} circuit open (upstream slow); call skipped`,
        });
    }

    const run = async (sessionId: string) =>
        postRpc(
            serverName,
            {
                jsonrpc: '2.0',
                id: Date.now(),
                method: 'tools/call',
                params: {
                    name: toolName,
                    arguments: args,
                },
            },
            sessionId
        );

    function extractResult(res: { frame: any }) {
        const { frame } = res;
        if (frame?.error) {
            throw createError({
                statusCode: 502,
                statusMessage: `MCP ${toolName}: [${frame.error.code}] ${frame.error.message}`,
            });
        }
        return frame?.result;
    }

    // Record every MCP tools/call in the per-scan diagnostics so the
    // request-budget counter reflects real load (not just REST calls).
    if (_event) {
        const diag = (_event.context as any)?.scanDiagnostics as
            | { endpoints: Record<string, number>; calls: Array<Record<string, unknown>> }
            | undefined;
        if (diag) {
            const key = `mcp:${serverName}:${toolName}`;
            diag.endpoints = diag.endpoints ?? {};
            diag.endpoints[key] = (diag.endpoints[key] ?? 0) + 1;
            diag.calls = diag.calls ?? [];
            if (diag.calls.length < 400) {
                diag.calls.push({ endpoint: key, method: 'POST', at: Date.now() });
            }
        }
    }

    const sem = getSemaphore(serverName);
    if (!opts.bypassSemaphore) await sem.acquire();
    try {
        const sessionId = await ensureSession(serverName);
        let result;
        try {
            result = extractResult(await run(sessionId));
        } catch (error: any) {
            if (
                String(error?.statusMessage || '').includes('session') ||
                error?.statusCode === 404
            ) {
                mcpSessionIds.delete(serverName);
                const fresh = await ensureSession(serverName);
                result = extractResult(await run(fresh));
            } else {
                throw error;
            }
        }
        if (!opts.silentBreaker) recordBreakerResult(serverName, false);
        // Capture provenance trails from elemental responses for citation resolution.
        if (serverName === 'elemental' && result && _event) {
            const trails = extractMcpProvenance(result);
            if (trails.length) pushProvenanceTrails(_event, trails);
        }
        return result;
    } catch (error: any) {
        const code = error?.statusCode ?? error?.status;
        if (!opts.silentBreaker) recordBreakerResult(serverName, isBreakerTrippingStatus(code));
        throw error;
    } finally {
        if (!opts.bypassSemaphore) sem.release();
    }
}

/**
 * Fire-and-forget warm-up for the `stocks` MCP. Cold symbols take ~60s for
 * the upstream to compute, which exceeds the gateway's 30s timeout — so the
 * first request 502s but the server still finishes and caches the result.
 * Kicking these off early (and ignoring the inevitable cold-call 502s) means
 * the actual market-signal lookups (and the next page load) hit a warm cache
 * and return in seconds instead of timing out. Bounded concurrency keeps us
 * within the stocks semaphore. Bypasses the circuit breaker on purpose: its
 * whole job is to keep warming while the breaker protects the scoring path.
 */
export function prewarmStocks(companyNames: string[], event?: H3Event): void {
    const unique = Array.from(
        new Set(
            companyNames
                .map((n) => (typeof n === 'string' ? n.trim() : ''))
                .filter((n) => n.length > 0)
        )
    );
    for (const name of unique) {
        // Detached on purpose — never await, never throw into the caller.
        callMcpTool(
            'stocks',
            'get_daily_stock_prices',
            { company_name: name, lookback_days: 45 },
            event,
            { bypassBreaker: true, silentBreaker: true, bypassSemaphore: true }
        ).catch(() => undefined);
    }
}

export function extractMcpStructuredContent<T = any>(result: any): T | null {
    if (!result) return null;
    if (result.structuredContent && typeof result.structuredContent === 'object') {
        return result.structuredContent as T;
    }
    const text = result?.content?.find?.((row: any) => row?.type === 'text')?.text;
    if (!text || typeof text !== 'string') return null;
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

export interface ProvenanceTrail {
    efid: string;
    record_index: number;
    atom_index: number;
}

/**
 * Extract `_meta['lovelace/provenance']` trails from an MCP tool result.
 * These structured coordinates can be passed to `elemental_get_citations`
 * to retrieve rich source details (filing form type, article headline, etc.).
 */
export function extractMcpProvenance(result: any): ProvenanceTrail[] {
    if (!result || typeof result !== 'object') return [];
    const meta = result._meta ?? result['_meta'];
    if (!meta || typeof meta !== 'object') return [];
    const trails = meta['lovelace/provenance'];
    if (!Array.isArray(trails)) return [];
    return trails.filter(
        (t): t is ProvenanceTrail =>
            t &&
            typeof t === 'object' &&
            typeof t.efid === 'string' &&
            typeof t.record_index === 'number' &&
            typeof t.atom_index === 'number'
    );
}

/**
 * Request-scoped store for provenance trails collected across all elemental
 * MCP calls during a single H3 request. Callers accumulate trails here;
 * `resolveRefs` (citations.ts) drains them to fetch real citations.
 */
function getRequestProvenanceStore(event: H3Event): ProvenanceTrail[] {
    const ctx = event.context as Record<string, unknown>;
    if (!Array.isArray(ctx.__provenanceTrails)) {
        ctx.__provenanceTrails = [] as ProvenanceTrail[];
    }
    return ctx.__provenanceTrails as ProvenanceTrail[];
}

export function pushProvenanceTrails(event: H3Event, trails: ProvenanceTrail[]): void {
    if (!trails.length) return;
    const store = getRequestProvenanceStore(event);
    store.push(...trails);
}

export function drainProvenanceTrails(event: H3Event): ProvenanceTrail[] {
    const ctx = event.context as Record<string, unknown>;
    const store = ctx.__provenanceTrails;
    if (!Array.isArray(store) || store.length === 0) return [];
    const copy = [...store];
    (ctx.__provenanceTrails as ProvenanceTrail[]).length = 0;
    return copy;
}
