export default defineEventHandler(async (event) => {
    const url = decodeURIComponent(getRouterParam(event, 'url') || '');

    if (!url || (!url.startsWith('https://') && !url.startsWith('http://'))) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid avatar URL',
        });
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; NewsUI/1.0)',
            },
            redirect: 'follow',
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch avatar: ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const imageBuffer = Buffer.from(await response.arrayBuffer());
        setHeader(event, 'Content-Type', contentType);
        setHeader(event, 'Cache-Control', 'public, max-age=86400');
        return imageBuffer;
    } catch (error) {
        console.error('Failed to fetch avatar:', error);
        // Fall back to direct fetch by the browser to avoid noisy proxy 500s.
        return sendRedirect(event, url, 302);
    }
});
