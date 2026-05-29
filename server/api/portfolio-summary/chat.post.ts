/**
 * POST /api/portfolio-summary/chat
 *
 * Q&A endpoint for the Portfolio Summary inline chat panel.
 * Takes the current briefing markdown as context and answers a question.
 */
import { defineEventHandler, readBody, createError } from 'h3';
import { callGemini, GEMINI_DEFAULT_MODEL } from '~/server/utils/gemini';

interface ChatRequest {
    summary: string;
    question: string;
    portfolioName?: string;
    model?: string;
}

export default defineEventHandler(async (event) => {
    const body = await readBody<ChatRequest>(event);

    if (!body?.question?.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'question is required' });
    }
    if (!body?.summary?.trim()) {
        throw createError({ statusCode: 400, statusMessage: 'summary is required' });
    }

    const portfolio = body.portfolioName || 'Portfolio';
    const model = body.model || GEMINI_DEFAULT_MODEL;

    const prompt = `You are a portfolio risk analyst assistant. The user is looking at a risk intelligence briefing for "${portfolio}" and has a follow-up question.

## CURRENT BRIEFING

${body.summary}

---

## USER QUESTION

${body.question}

Answer concisely and precisely, citing specific entities or data points from the briefing where relevant. If the answer is not in the briefing, say so clearly rather than speculating.`;

    try {
        const result = await callGemini({
            prompt,
            model,
            maxTokens: 1000,
            temperature: 0.2,
            timeoutMs: 60_000,
        });

        return { answer: result.text, usage: result.usage };
    } catch (e: any) {
        throw createError({ statusCode: 500, statusMessage: `AI error: ${e.message}` });
    }
});
