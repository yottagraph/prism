export default defineEventHandler(async () => {
    // NOTE:
    // MCP servers are JSON-RPC over `/api/mcp/{org}/{server}/mcp`.
    // REST-style paths like `/api/mcp/{org}/lovelace-polymarket/context`
    // are invalid and can silently return portal fallback HTML.
    //
    // Keep the macro panel explicit: no synthetic fallback and no invalid MCP URL probes.
    return [];
});
