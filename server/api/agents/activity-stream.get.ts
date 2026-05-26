import { getActivityHistory, subscribeActivity } from '~/server/utils/scoring/activity';

export default defineEventHandler(async (event) => {
    const query = getQuery(event);
    const portfolioId = typeof query.portfolioId === 'string' ? query.portfolioId : undefined;

    setHeader(event, 'Content-Type', 'text/event-stream');
    setHeader(event, 'Cache-Control', 'no-cache');
    setHeader(event, 'Connection', 'keep-alive');

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            const emit = (type: string, payload: unknown) => {
                controller.enqueue(
                    encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`)
                );
            };

            for (const entry of getActivityHistory(portfolioId).slice(0, 40).reverse()) {
                emit('activity', entry);
            }

            const unsubscribe = subscribeActivity((entry) => {
                if (portfolioId && entry.portfolioId !== portfolioId) return;
                emit('activity', entry);
            });

            const heartbeat = setInterval(() => emit('heartbeat', { ts: Date.now() }), 15_000);
            event.node.req.on('close', () => {
                clearInterval(heartbeat);
                unsubscribe();
                controller.close();
            });
        },
    });

    return sendStream(event, stream);
});
