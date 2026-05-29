/**
 * POST /api/macro/portfolio-insight
 *
 * Generate a single concise sentence explaining the portfolio's sector
 * distribution in the context of the current macro regime.
 *
 * Called lazily when macro regime data becomes available (regime.ready).
 * Returns at most ~40 words — designed for the Regime Banner header line.
 */
import { defineEventHandler, readBody, createError } from 'h3';
import { callGemini } from '~/server/utils/gemini';

interface SectorTiltEntry {
    label: string;
    count: number;
    bucket: string;
}

interface InsightRequest {
    regimeLabel: string;
    synthesis: string;
    sectorTilt: SectorTiltEntry[];
    totalEntities: number;
}

export default defineEventHandler(async (event) => {
    const body = await readBody<InsightRequest>(event);

    if (!body?.regimeLabel || !body?.sectorTilt?.length) {
        throw createError({
            statusCode: 400,
            statusMessage: 'regimeLabel and sectorTilt required',
        });
    }

    const tiltList = body.sectorTilt.map((t) => `${t.label} (${t.count})`).join(', ');

    const prompt = `You are a macro portfolio analyst. Write ONE sentence (max 35 words) that explains what this portfolio's sector mix means given the current macro regime. Be specific and actionable. Do not start with "The portfolio". No preamble, no bullet points — just the sentence.

Macro regime: ${body.regimeLabel}
Key indicators: ${body.synthesis}
Portfolio sector mix across ${body.totalEntities} entities: ${tiltList}`;

    try {
        const result = await callGemini({
            prompt,
            model: 'gemini-2.5-flash-preview-05-20',
            maxTokens: 120,
            temperature: 0.3,
            timeoutMs: 20_000,
        });

        const sentence = result.text
            .trim()
            .replace(/^["']|["']$/g, '') // strip surrounding quotes if any
            .split('\n')[0] // first line only
            .trim();

        return { insight: sentence };
    } catch (e: any) {
        throw createError({
            statusCode: 500,
            statusMessage: `Insight generation failed: ${e.message}`,
        });
    }
});
