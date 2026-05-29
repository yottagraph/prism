/**
 * POST /api/macro/summary
 *
 * Generate a 2-3 sentence plain-language summary of the current macro regime
 * for the active portfolio. Synthesizes FRED realized fundamentals +
 * Polymarket market-implied outlook + the portfolio's sector tilt into a short
 * narrative that replaces the dense metric chips in the Macro Regime panel.
 *
 * Called lazily once macro regime data is available (regime.ready).
 */
import { defineEventHandler, readBody, createError } from 'h3';
import { callGemini, GEMINI_DEFAULT_MODEL } from '~/server/utils/gemini';

interface SignalInput {
    label: string;
    displayValue?: string;
    trend?: string;
    note?: string;
}

interface SectorTiltEntry {
    label: string;
    count: number;
    bucket: string;
}

interface SummaryRequest {
    regimeLabel: string;
    fred: SignalInput[];
    poly: SignalInput[];
    sectorTilt: SectorTiltEntry[];
    totalEntities: number;
}

function formatSignals(signals: SignalInput[]): string {
    return signals
        .map((s) => {
            const name = s.note || s.label;
            const value = s.displayValue ?? '';
            const trend = s.trend && s.trend !== 'flat' ? ` (${s.trend})` : '';
            return `${name}: ${value}${trend}`.trim();
        })
        .filter(Boolean)
        .join('; ');
}

export default defineEventHandler(async (event) => {
    const body = await readBody<SummaryRequest>(event);

    if (!body?.regimeLabel || (!body?.fred?.length && !body?.poly?.length)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'regimeLabel and at least one macro signal source required',
        });
    }

    const fredList = formatSignals(body.fred ?? []);
    const polyList = formatSignals(body.poly ?? []);
    const tiltList = (body.sectorTilt ?? []).map((t) => `${t.label} (${t.count})`).join(', ');

    const prompt = `Write 2-3 plain sentences (max 75 words) explaining the current economic backdrop and what it means for this portfolio. Write the way Paul Krugman does in The New York Times: clear, accessible, grounded in the numbers but never jargon-heavy. A non-economist should fully understand it.

Strict style rules:
- Never use: "overweight", "underweight", "rate-sensitive", "risk assets", "macro regime", "tailwind", "headwind", or any Wall Street jargon.
- Do NOT start the response with "The macro regime", a regime label, or "Based on".
- Start with what is actually happening in the economy (jobs, prices, growth, rates) and what bettors/traders expect next.
- End with one concrete sentence about how that affects this specific portfolio's companies.
- Use plain numbers where helpful (e.g. "the Fed's benchmark rate sits at 5.3%", "odds of a recession this year sit around 20%").

Data:
Regime label (internal only, do NOT quote this): ${body.regimeLabel}
Realized U.S. fundamentals (FRED): ${fredList || 'n/a'}
Market-implied outlook (Polymarket prediction markets): ${polyList || 'n/a'}
Portfolio: ${body.totalEntities} entities, sector mix: ${tiltList || 'n/a'}`;

    try {
        const result = await callGemini({
            prompt,
            model: GEMINI_DEFAULT_MODEL,
            maxTokens: 220,
            temperature: 0.3,
            timeoutMs: 20_000,
        });

        const summary = result.text.trim().replace(/^["']|["']$/g, '');
        return { summary };
    } catch (e: any) {
        throw createError({
            statusCode: 500,
            statusMessage: `Macro summary generation failed: ${e.message}`,
        });
    }
});
