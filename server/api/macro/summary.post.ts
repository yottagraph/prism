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
import { callGemini } from '~/server/utils/gemini';

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

    const prompt = `You are a macro portfolio analyst writing a TL;DR for a risk dashboard. Write 2-3 sentences (max 75 words total) that summarize the current macro regime and what it means for this portfolio. Lead with the regime read (rates + growth), weave in the most important indicators, and close with the implication for the portfolio's sector tilt. Plain prose only — no bullet points, no headers, no preamble, do not restate the numbers as a list.

Macro regime: ${body.regimeLabel}
Realized fundamentals (FRED): ${fredList || 'n/a'}
Forward outlook, market-implied (Polymarket): ${polyList || 'n/a'}
Portfolio sector mix across ${body.totalEntities} entities: ${tiltList || 'n/a'}`;

    try {
        const result = await callGemini({
            prompt,
            model: 'gemini-2.5-flash',
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
