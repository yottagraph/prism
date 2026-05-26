export default defineEventHandler(async () => {
    const { public: config } = useRuntimeConfig();
    const gatewayUrl = (config as any).gatewayUrl as string;
    const tenantOrgId = (config as any).tenantOrgId as string;
    const qsApiKey = (config as any).qsApiKey as string;
    if (!gatewayUrl || !tenantOrgId || !qsApiKey) {
        return [];
    }

    // Gateway proxy attempt. If the tenant has the lovelace-polymarket MCP wired,
    // this endpoint can be routed through the org-scoped MCP path.
    const candidateUrls = [
        `${gatewayUrl}/api/mcp/${tenantOrgId}/lovelace-polymarket/macro`,
        `${gatewayUrl}/api/mcp/${tenantOrgId}/lovelace-polymarket/context`,
    ];

    for (const url of candidateUrls) {
        try {
            const res = await $fetch<any>(url, {
                headers: { 'X-Api-Key': qsApiKey },
            });
            if (Array.isArray(res) && res.length) return res;
            if (Array.isArray(res?.signals) && res.signals.length) return res.signals;
        } catch {
            // Try next endpoint.
        }
    }

    return [];
});
