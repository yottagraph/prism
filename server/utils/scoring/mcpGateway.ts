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

const RETRIABLE_STATUS_CODES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function isRetriable(error: any): boolean {
    const code = error?.statusCode ?? error?.status;
    return typeof code === 'number' && RETRIABLE_STATUS_CODES.has(code);
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

    let response: Response;
    try {
        response = await fetch(mcpUrl(serverName), {
            method: 'POST',
            headers,
            body,
        });
    } catch (err) {
        logCtx.finish({ status: 0, ok: false, error: err });
        throw err;
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
            if (attempt < MAX_ATTEMPTS && isRetriable(err)) {
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

export async function callMcpTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
    _event?: H3Event
) {
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

    const sem = getSemaphore(serverName);
    await sem.acquire();
    try {
        const sessionId = await ensureSession(serverName);
        try {
            const res = await run(sessionId);
            return res.frame?.result;
        } catch (error: any) {
            if (
                String(error?.statusMessage || '').includes('session') ||
                error?.statusCode === 404
            ) {
                mcpSessionIds.delete(serverName);
                const fresh = await ensureSession(serverName);
                const res = await run(fresh);
                return res.frame?.result;
            }
            throw error;
        }
    } finally {
        sem.release();
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
