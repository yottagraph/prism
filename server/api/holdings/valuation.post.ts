import { requireAuth } from '~/server/utils/requireAuth';
import { valueHoldings, type HoldingValuationInput } from '~/server/utils/scoring/holdingValuation';

interface ValuationRequest {
    portfolioId: string;
    holdings: HoldingValuationInput[];
}

/**
 * Backdated valuation for a bucket's holdings. Prices each position through
 * time from its cost-basis dollars + purchase date using Elemental's daily
 * close history. Returns one valuation per input holding, index-aligned.
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event);
    const body = await readBody<ValuationRequest>(event);
    if (!body?.portfolioId || !Array.isArray(body.holdings)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'portfolioId and holdings are required',
        });
    }

    const valuations = await valueHoldings(event, body.portfolioId, body.holdings);
    return { valuations };
});
