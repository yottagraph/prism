export default defineEventHandler(async () => {
    const { public: config } = useRuntimeConfig();
    const gatewayUrl = (config as any).gatewayUrl as string;
    const tenantOrgId = (config as any).tenantOrgId as string;
    const qsApiKey = (config as any).qsApiKey as string;
    if (!gatewayUrl || !tenantOrgId || !qsApiKey) {
        return [];
    }

    const candidateUrls = [
        `${gatewayUrl}/api/mcp/${tenantOrgId}/lovelace-fred/macro`,
        `${gatewayUrl}/api/mcp/${tenantOrgId}/lovelace-fred/context`,
        `${gatewayUrl}/api/mcp/${tenantOrgId}/lovelace-fred/latest`,
    ];

    for (const url of candidateUrls) {
        try {
            const res = await $fetch<any>(url, {
                headers: { 'X-Api-Key': qsApiKey },
            });
            if (Array.isArray(res) && res.length) return res;
            if (Array.isArray(res?.signals) && res.signals.length) return res.signals;
        } catch {
            // Try next candidate.
        }
    }

    return [];
});

