import type { H3Event } from 'h3';

const mcpSessionIds = new Map<string, string>();

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

async function postRpc(serverName: string, payload: Record<string, unknown>, sessionId?: string) {
    const { qsApiKey } = gatewayConfig();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(qsApiKey ? { 'X-Api-Key': qsApiKey } : {}),
    };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;

    const response = await fetch(mcpUrl(serverName), {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
    const responseText = await response.text();
    const returnedSessionId = response.headers.get('mcp-session-id') || undefined;
    if (!response.ok) {
        throw createError({
            statusCode: response.status,
            statusMessage: responseText || `MCP request failed (${response.status})`,
        });
    }
    return { frame: parseSseJson(responseText), returnedSessionId };
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

    const sessionId = await ensureSession(serverName);
    try {
        const res = await run(sessionId);
        return res.frame?.result;
    } catch (error: any) {
        if (String(error?.statusMessage || '').includes('session') || error?.statusCode === 404) {
            mcpSessionIds.delete(serverName);
            const fresh = await ensureSession(serverName);
            const res = await run(fresh);
            return res.frame?.result;
        }
        throw error;
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
