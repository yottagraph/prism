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

// Approximate cost per 1M tokens (Flash 2.5) — used for display only.
const COST_PER_1M_INPUT = 0.15;
const COST_PER_1M_OUTPUT = 0.6;

export async function callGemini(opts: CallGeminiOptions): Promise<GeminiResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set');
    }

    const model = opts.model ?? 'gemini-2.5-flash-preview-05-20';
    const maxTokens = opts.maxTokens ?? 4000;
    const temperature = opts.temperature ?? 0.3;
    const timeoutMs = opts.timeoutMs ?? 120_000;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body: any = {
        contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
        generationConfig: {
            maxOutputTokens: maxTokens,
            temperature,
        },
    };

    if (opts.thinkingMode) {
        body.generationConfig.thinkingConfig = { thinkingBudget: 8192 };
    }

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
