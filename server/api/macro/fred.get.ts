export default defineEventHandler(async () => {
    // NOTE:
    // FRED is not exposed as a dedicated MCP server path like
    // `/api/mcp/{org}/lovelace-fred/*`. Those URLs are invalid and can
    // silently return HTML from the portal fallback.
    //
    // Until a proper Elemental-backed FRED query implementation is wired in
    // (via Query Server schema/properties), return an explicit empty list.
    return [];
});
