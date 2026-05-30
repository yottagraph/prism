/**
 * POST /api/persona/description
 *
 * Generate a 2-sentence investor persona description using Gemini.
 * Called once per user profile; the client caches the result in prefs.
 *
 * Body: { name, age, retirementAge, riskPreference, goals }
 * Returns: { description }
 */
import { defineEventHandler, readBody, createError } from 'h3';
import { callGemini, GEMINI_DEFAULT_MODEL } from '~/server/utils/gemini';

interface GoalInput {
    purpose?: string;
    horizonYears?: number;
}

interface DescriptionRequest {
    name: string;
    age: number;
    retirementAge: number;
    riskPreference: string;
    goals?: GoalInput[];
}

export default defineEventHandler(async (event) => {
    const body = await readBody<DescriptionRequest>(event);

    if (!body?.name) {
        throw createError({ statusCode: 400, statusMessage: 'name is required' });
    }

    const yearsToRetirement = Math.max(0, body.retirementAge - body.age);
    const goalsText =
        body.goals && body.goals.length > 0
            ? body.goals
                  .filter((g) => g.purpose)
                  .map(
                      (g) =>
                          `${g.purpose}${g.horizonYears ? ` (${g.horizonYears}-year horizon)` : ''}`
                  )
                  .join(', ')
            : null;

    const prompt = `Write exactly 2 plain sentences describing this investor for their financial advisor. No markdown, no bullet points, no headers — just two consecutive sentences.

Investor profile:
- Name: ${body.name}
- Age: ${body.age} (retiring at ${body.retirementAge}, ${yearsToRetirement} years away)
- Risk preference: ${body.riskPreference}${goalsText ? `\n- Saving for: ${goalsText}` : ''}

Sentence 1: Describe who they are and what they are working toward (their goals, timeline, life stage). Be specific and natural — like a financial advisor briefing a colleague, not marketing copy.
Sentence 2: Describe their risk posture and how it shapes their investment approach. Reference the goals and timeline naturally.

Rules:
- Use their first name only (not full name) in both sentences
- No jargon like "portfolio optimization" or "wealth management"
- No generic openers like "Maya is a..." — vary the sentence start
- Maximum 60 words total`;

    try {
        const result = await callGemini({
            prompt,
            model: GEMINI_DEFAULT_MODEL,
            maxTokens: 180,
            temperature: 0.5,
            timeoutMs: 20_000,
        });

        const description = result.text.trim().replace(/^["']|["']$/g, '');
        return { description };
    } catch (e: any) {
        throw createError({
            statusCode: 500,
            statusMessage: `Persona generation failed: ${e.message}`,
        });
    }
});
