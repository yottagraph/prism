/**
 * POST /api/portfolio-summary/generate
 *
 * Generate a portfolio intelligence briefing using Gemini.
 *
 * The client sends the already-scanned portfolio entities (stored client-side
 * in prefs) along with macro regime context and report configuration. The
 * server builds a structured prompt from:
 *   - Risk tiers & fused scores per entity
 *   - Top drivers (lens → finding text → citations)
 *   - Coverage metadata (SEC, news, stock, poly, sanctions, ownership, FDIC)
 *   - Active macro regime / sector tilt
 *
 * Returns { summary, data_sources, usage, agent_steps, generated_at }.
 */
import { defineEventHandler, readBody, createError } from 'h3';
import { callGemini, GEMINI_DEFAULT_MODEL, type GeminiUsage } from '~/server/utils/gemini';

interface CitationRef {
    ref?: string;
    url?: string;
    title?: string;
    source?: string;
    date?: string;
    snippet?: string;
}

interface RiskDriver {
    lens: string;
    source: string;
    score: number;
    finding: { text: string; date?: string; citations: CitationRef[] };
}

interface EntityInput {
    resolvedName: string;
    neid: string | null;
    ticker?: string;
    scores: {
        fused: number;
        tier: 'critical' | 'high' | 'medium' | 'low';
        solvency?: number;
        executive?: number;
        news?: number;
        market?: number;
        eventPressure?: number;
        compliance?: number;
    } | null;
    drivers?: RiskDriver[];
    confidenceLevel?: string;
    coverage?: {
        sec?: boolean;
        news?: boolean;
        stock?: boolean;
        poly?: boolean;
        sanctions?: boolean;
        ownership?: boolean;
        fdic?: boolean;
    };
    monitor?: {
        headlineSummary?: string | null;
        sentimentAvg30d?: number | null;
        stockChangePercent?: number | null;
        stockTrendSignal?: string | null;
        sector?: string | null;
        signalSummary?: string | null;
    };
}

interface MacroInput {
    regime?: string;
    synthesis?: string;
    sectorTilt?: string;
    portfolioImplication?: string;
}

interface ReportConfig {
    style: 'brief' | 'standard' | 'detailed';
    focus: 'balanced' | 'risks' | 'regulatory' | 'market';
    tone: 'formal' | 'conversational' | 'action';
    model: string;
    thinkingMode?: boolean;
    timePeriod: '7' | '30' | '90';
}

interface GenerateRequest {
    portfolioName: string;
    entities: EntityInput[];
    macro?: MacroInput;
    config?: Partial<ReportConfig>;
}

interface AgentStep {
    agent: string;
    icon: string;
    color: string;
    status: 'completed' | 'working' | 'pending';
    summary: string;
    detail?: string;
    durationMs?: number;
}

const DEFAULT_CONFIG: ReportConfig = {
    style: 'standard',
    focus: 'balanced',
    tone: 'formal',
    model: GEMINI_DEFAULT_MODEL,
    thinkingMode: false,
    timePeriod: '30',
};

const STYLE_INSTRUCTIONS: Record<string, string> = {
    brief: 'Write a concise executive brief (300-450 words). 3-5 bullet points, top insights only.',
    standard: 'Write a comprehensive risk briefing (500-800 words). 5-8 substantive bullet points.',
    detailed: 'Write an in-depth analysis (800-1100 words). Cover all significant risk patterns.',
};

const FOCUS_INSTRUCTIONS: Record<string, string> = {
    balanced:
        'Balance coverage across financial health, executive risk, news/sentiment, and compliance.',
    risks: 'PRIORITIZE the most severe risk signals: distress, sanctions, high-score entities.',
    regulatory:
        'PRIORITIZE compliance, sanctions, ownership-structure, and SEC-filing-driven signals.',
    market: 'PRIORITIZE stock performance, news sentiment, and market-implied signals.',
};

const TONE_INSTRUCTIONS: Record<string, string> = {
    formal: 'Use formal, institutional language appropriate for a risk committee briefing.',
    conversational: 'Use clear, direct language optimized for quick comprehension.',
    action: 'Use action-oriented language with specific recommendations and escalation triggers.',
};

function formatTier(tier: string): string {
    return tier.toUpperCase();
}

function buildEntityBlock(e: EntityInput, idx: number): string {
    if (!e.scores) return `${idx + 1}. ${e.resolvedName} — no scan data`;
    const lines: string[] = [];
    const name = `${e.resolvedName}${e.ticker ? ` (${e.ticker})` : ''}`;
    lines.push(
        `### ${idx + 1}. ${name} — ${formatTier(e.scores.tier)} (fused: ${e.scores.fused.toFixed(1)})`
    );

    const subScores: string[] = [];
    if (e.scores.solvency != null) subScores.push(`solvency ${e.scores.solvency.toFixed(1)}`);
    if (e.scores.executive != null) subScores.push(`exec-risk ${e.scores.executive.toFixed(1)}`);
    if (e.scores.news != null) subScores.push(`news ${e.scores.news.toFixed(1)}`);
    if (e.scores.eventPressure != null)
        subScores.push(`event-pressure ${e.scores.eventPressure.toFixed(1)}`);
    if (e.scores.compliance != null) subScores.push(`compliance ${e.scores.compliance.toFixed(1)}`);
    if (subScores.length) lines.push(`Sub-scores: ${subScores.join(' | ')}`);

    if (e.monitor?.signalSummary) lines.push(`Signal: ${e.monitor.signalSummary}`);
    if (e.monitor?.headlineSummary) lines.push(`News: ${e.monitor.headlineSummary}`);

    const topDrivers = (e.drivers ?? []).slice(0, 4);
    if (topDrivers.length) {
        lines.push('Key findings:');
        for (const d of topDrivers) {
            const citeParts: string[] = [];
            for (const c of (d.finding.citations ?? []).slice(0, 2)) {
                const parts: string[] = [];
                if (c.source) parts.push(c.source);
                if (c.date) parts.push(c.date);
                if (c.title) parts.push(`"${c.title}"`);
                if (parts.length) citeParts.push(parts.join(', '));
            }
            const cite = citeParts.length ? ` *(${citeParts.join('; ')})*` : '';
            const dateTag = d.finding.date ? ` [${d.finding.date}]` : '';
            lines.push(
                `  - [${d.lens.toUpperCase()} / ${d.source}]${dateTag} ${d.finding.text}${cite}`
            );
        }
    }

    const cov: string[] = [];
    if (e.coverage?.sec) cov.push('SEC');
    if (e.coverage?.news) cov.push('News');
    if (e.coverage?.stock) cov.push('Stock');
    if (e.coverage?.poly) cov.push('Poly');
    if (e.coverage?.sanctions) cov.push('Sanctions');
    if (e.coverage?.ownership) cov.push('Ownership');
    if (e.coverage?.fdic) cov.push('FDIC');
    if (cov.length) lines.push(`Coverage: ${cov.join(', ')}`);

    return lines.join('\n');
}

export default defineEventHandler(async (event) => {
    const body = await readBody<GenerateRequest>(event);

    if (!body?.entities?.length) {
        throw createError({ statusCode: 400, statusMessage: 'entities array is required' });
    }

    const config = { ...DEFAULT_CONFIG, ...(body.config ?? {}) };
    const entities = body.entities;
    const portfolioName = body.portfolioName || 'Portfolio';

    const dialogueStart = Date.now();

    // -- Data source coverage stats
    const secCount = entities.filter((e) => e.coverage?.sec).length;
    const newsCount = entities.filter((e) => e.coverage?.news).length;
    const stockCount = entities.filter((e) => e.coverage?.stock).length;
    const polyCount = entities.filter((e) => e.coverage?.poly).length;
    const sanctionsCount = entities.filter((e) => e.coverage?.sanctions).length;
    const ownershipCount = entities.filter((e) => e.coverage?.ownership).length;
    const fdicCount = entities.filter((e) => e.coverage?.fdic).length;
    const total = entities.length;

    const dataSources = {
        sec: { available: secCount > 0, entity_count: secCount, total },
        news: { available: newsCount > 0, entity_count: newsCount, total },
        stock: { available: stockCount > 0, entity_count: stockCount, total },
        poly: { available: polyCount > 0, entity_count: polyCount, total },
        sanctions: { available: sanctionsCount > 0, entity_count: sanctionsCount, total },
        ownership: { available: ownershipCount > 0, entity_count: ownershipCount, total },
        fdic: { available: fdicCount > 0, entity_count: fdicCount, total },
    };

    // -- Tier distribution
    const tierCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const e of entities) {
        if (e.scores?.tier) tierCounts[e.scores.tier as keyof typeof tierCounts]++;
    }

    // -- Macro block
    const macroBlock = body.macro?.regime
        ? `## MACRO REGIME CONTEXT
Regime: ${body.macro.regime}
${body.macro.synthesis ? `Synthesis: ${body.macro.synthesis}` : ''}
${body.macro.sectorTilt ? `Sector tilt: ${body.macro.sectorTilt}` : ''}
${body.macro.portfolioImplication ? `Portfolio implication: ${body.macro.portfolioImplication}` : ''}`
        : '';

    // -- Entity blocks (critical + high first, then medium, then low)
    const sorted = [...entities].sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        const ta = (a.scores?.tier ?? 'low') as keyof typeof order;
        const tb = (b.scores?.tier ?? 'low') as keyof typeof order;
        const tierDiff = order[ta] - order[tb];
        if (tierDiff !== 0) return tierDiff;
        return (b.scores?.fused ?? 0) - (a.scores?.fused ?? 0);
    });

    const entityBlocks = sorted.map((e, i) => buildEntityBlock(e, i)).join('\n\n');

    const timePeriod =
        config.timePeriod === '7' ? '7-day' : config.timePeriod === '90' ? '90-day' : '30-day';

    const dialogueDurationMs = Date.now() - dialogueStart;

    // -- Build prompt
    const prompt = `You are a senior portfolio risk analyst writing an intelligence briefing for "${portfolioName}".

## PORTFOLIO OVERVIEW
- Total entities: ${total}
- Risk distribution: ${tierCounts.critical} Critical, ${tierCounts.high} High, ${tierCounts.medium} Medium, ${tierCounts.low} Low
- Coverage: SEC ${secCount}/${total} | News ${newsCount}/${total} | Stock ${stockCount}/${total} | Sanctions ${sanctionsCount}/${total} | Ownership ${ownershipCount}/${total}

${macroBlock}

## ENTITY RISK DATA (${timePeriod} lookback)

${entityBlocks}

---

## YOUR MISSION

${STYLE_INSTRUCTIONS[config.style] || STYLE_INSTRUCTIONS.standard}
${FOCUS_INSTRUCTIONS[config.focus] || FOCUS_INSTRUCTIONS.balanced}
${TONE_INSTRUCTIONS[config.tone] || TONE_INSTRUCTIONS.formal}

## CITATION REQUIREMENTS

Every finding MUST cite its source. Use this exact format:
- For SEC data: *(SEC Filing, [date])*
- For news: *(News, [source], [date])*
- For stock data: *(Stock data, [date])*
- For compliance/ACS: *(Compliance screening, [source])*
- For ownership: *(Ownership graph, [date])*

The citations are provided in the entity data above — USE THEM. Never invent citations.

## REQUIRED OUTPUT FORMAT

# Portfolio Risk Briefing — ${portfolioName}

## What You Need to Know

Write 5-8 bullet points covering the most important risk signals. Each bullet MUST:
1. Name the specific entity or entities involved
2. Describe the signal and why it matters for the portfolio
3. End with a source citation

## Priority Watch List

List 3-5 entities requiring immediate attention or monitoring. Include tier, fused score, and the primary risk driver for each.

## Portfolio-Level Themes

Identify risk patterns that appear across multiple entities (e.g., sector-wide pressure, clustered executive turnover, common counterparty exposure). Minimum 2 entities per theme.

If the macro regime is available, describe its implication for the portfolio's risk profile.

## Coverage Gaps

Note which entities have limited data coverage and what risks may be underweighted as a result.

---

RULES:
- START DIRECTLY with "# Portfolio Risk Briefing"
- Use entity names exactly as provided
- Cite every material claim
- Do NOT include entities with no scan data in the Watch List
- Word count: ${config.style === 'brief' ? '300-450' : config.style === 'detailed' ? '800-1100' : '500-800'} words

Write the briefing now:`;

    const aggregationDurationMs = Date.now() - dialogueStart;

    // -- Call Gemini
    const compositionStart = Date.now();
    let summaryText: string;
    let usage: GeminiUsage;
    try {
        const result = await callGemini({
            prompt,
            model: config.model || GEMINI_DEFAULT_MODEL,
            maxTokens: config.style === 'brief' ? 2000 : config.style === 'detailed' ? 5000 : 3000,
            temperature: 0.3,
            timeoutMs: 120_000,
            thinkingMode: config.thinkingMode,
        });
        summaryText = result.text;
        usage = result.usage;
    } catch (e: any) {
        throw createError({ statusCode: 500, statusMessage: `AI generation failed: ${e.message}` });
    }
    const compositionDurationMs = Date.now() - compositionStart;

    const sampleNames = sorted
        .filter((e) => e.scores)
        .slice(0, 5)
        .map((e) => e.resolvedName);

    const agentSteps: AgentStep[] = [
        {
            agent: 'Dialogue Agent',
            icon: 'mdi-forum-outline',
            color: '#26C6DA',
            status: 'completed',
            summary: `Interpreted request: ${config.focus} ${config.style} analysis, ${timePeriod} window`,
            detail: `Style: ${config.style}, Focus: ${config.focus}, Tone: ${config.tone}`,
            durationMs: dialogueDurationMs,
        },
        {
            agent: 'History Agent',
            icon: 'mdi-history',
            color: '#42A5F5',
            status: 'completed',
            summary: `Retrieved ${total} entities from portfolio prefs`,
            detail:
                sampleNames.length > 0
                    ? `${sampleNames.join(', ')}${total > sampleNames.length ? ` +${total - sampleNames.length} more` : ''}`
                    : `${total} entities`,
            durationMs: Math.max(1, Math.round(aggregationDurationMs * 0.4)),
        },
        {
            agent: 'Analytics Agent',
            icon: 'mdi-chart-line',
            color: '#AB47BC',
            status: 'completed',
            summary: `Assembled risk signals: ${tierCounts.critical} Critical, ${tierCounts.high} High, ${tierCounts.medium} Medium`,
            detail: `SEC ${secCount}/${total} | News ${newsCount}/${total} | Stock ${stockCount}/${total}`,
            durationMs: Math.max(
                1,
                aggregationDurationMs - Math.round(aggregationDurationMs * 0.4)
            ),
        },
        {
            agent: 'Publisher Agent',
            icon: 'mdi-file-document-edit-outline',
            color: '#66BB6A',
            status: 'completed',
            summary: `Generated briefing (${usage.completion_tokens} tokens, ${(compositionDurationMs / 1000).toFixed(1)}s)`,
            detail: `Model: ${config.model}, Prompt: ${usage.prompt_tokens} tokens, Cost: $${usage.cost_usd.toFixed(4)}`,
            durationMs: compositionDurationMs,
        },
    ];

    return {
        summary: summaryText,
        data_sources: dataSources,
        usage,
        agent_steps: agentSteps,
        generated_at: new Date().toISOString(),
        entity_count: total,
    };
});
