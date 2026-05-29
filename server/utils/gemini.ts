/**
 * Minimal Gemini REST API wrapper for server-side text generation.
 *
 * Uses GEMINI_API_KEY from .env / Vercel env vars.
 * Wraps the Gemini generativelanguage.googleapis.com REST endpoint so we
 * don't need a Node SDK dependency.
 */

export interface GeminiUsage {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_usd: number;
    model: string;
    latency_ms: number;
}

export interface GeminiResult {
    text: string;
    usage: GeminiUsage;
}

export interface CallGeminiOptions {
    prompt: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
    thinkingMode?: boolean;
}

/**
 * Canonical Gemini model names. Change here to update every call site.
 * Override at runtime with GEMINI_DEFAULT_MODEL / GEMINI_PRO_MODEL env vars
 * so a model rotation can be done from the Vercel dashboard without a deploy.
 */
export const GEMINI_DEFAULT_MODEL = process.env.GEMINI_DEFAULT_MODEL ?? 'gemini-2.5-flash';
export const GEMINI_PRO_MODEL = process.env.GEMINI_PRO_MODEL ?? 'gemini-2.5-pro';

// Pricing per 1M tokens (Flash 2.5, Feb 2026) — used for display only.
const COST_PER_1M_INPUT = 0.3;
const COST_PER_1M_OUTPUT = 2.5;

/**
 * Thinking config for Gemini 2.5 Flash.
 *
 * Thinking tokens count against maxOutputTokens, so leaving dynamic thinking
 * on with a small budget truncates responses. We explicitly disable thinking
 * (thinkingBudget: 0) unless the caller opts in via thinkingMode: true.
 *
 * Gemini 2.5 Pro cannot disable thinking — don't send thinkingConfig for it.
 */
function buildThinkingConfig(model: string, thinkingMode: boolean): Record<string, any> {
    if (model.includes('2.5-flash')) {
        return { thinkingConfig: { thinkingBudget: thinkingMode ? 4096 : 0 } };
    }
    return {};
}

export async function callGemini(opts: CallGeminiOptions): Promise<GeminiResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set');
    }

    const model = opts.model ?? GEMINI_DEFAULT_MODEL;
    const maxTokens = opts.maxTokens ?? 800;
    const temperature = opts.temperature ?? 0.3;
    const timeoutMs = opts.timeoutMs ?? 90_000;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body = {
        contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
        generationConfig: {
            maxOutputTokens: maxTokens,
            temperature,
            ...buildThinkingConfig(model, !!opts.thinkingMode),
        },
    };

    const start = Date.now();
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`Gemini API error ${response.status}: ${errText.slice(0, 300)}`);
    }

    const latencyMs = Date.now() - start;
    const json = await response.json();

    const candidate = json.candidates?.[0];
    const text = candidate?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';

    const finishReason = candidate?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        console.warn(
            `[gemini] finish_reason=${finishReason} model=${model} maxTokens=${maxTokens}`
        );
    }

    const promptTokens = json.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = json.usageMetadata?.candidatesTokenCount ?? 0;
    const totalTokens = promptTokens + completionTokens;
    const costUsd =
        (promptTokens * COST_PER_1M_INPUT + completionTokens * COST_PER_1M_OUTPUT) / 1_000_000;

    return {
        text,
        usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            cost_usd: Math.round(costUsd * 100_000) / 100_000,
            model,
            latency_ms: latencyMs,
        },
    };
}
