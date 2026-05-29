/**
 * Agent pipeline state composable.
 *
 * Tracks the 4-step pipeline (Dialogue → History → Query → Composition) for
 * the Agent Workspace UI. Each step has status and timing; sessions are
 * recorded so the Session History table has data.
 *
 * Pipeline steps are driven by real ADK stream events from useAgentChat:
 *   - function_call  → History Agent working / Query Agent working
 *   - function_response → Query Agent completed (increments elementalCalls)
 *   - text / done    → Composition Agent completed
 *
 * Tokens and cost are NOT available in the ADK SSE stream and are shown as
 * unavailable rather than fabricated.
 */

import { computed, ref } from 'vue';
import type { AgentStreamEvent } from './useAgentChat';

export type PipelineStep = 'dialogue' | 'history' | 'query' | 'composition';
export type PipelineStatus = 'pending' | 'working' | 'completed' | 'error';

export interface PipelineStepState {
    name: PipelineStep;
    label: string;
    description: string;
    status: PipelineStatus;
    startedAt?: number;
    completedAt?: number;
    evidenceCount?: number;
}

export interface AgentSession {
    id: string;
    trigger: string;
    status: 'running' | 'completed' | 'failed';
    entityCount: number;
    duration: number;
    timestamp: number;
    steps: PipelineStepState[];
}

export interface ActivityFeedEntry {
    id: string;
    timestamp: number;
    agent: string;
    entity: string;
    detail: string;
}

const STEP_LABELS: Record<PipelineStep, { label: string; description: string }> = {
    dialogue: {
        label: 'Dialogue Agent',
        description: 'Resolve entities, time windows, and intent',
    },
    history: {
        label: 'History Agent',
        description: 'Retrieve multi-source context from Elemental',
    },
    query: {
        label: 'Query Agent',
        description: 'Run scoring + pattern analysis modules',
    },
    composition: {
        label: 'Composition Agent',
        description: 'Format response for the active surface',
    },
};

function emptyPipeline(): PipelineStepState[] {
    return (['dialogue', 'history', 'query', 'composition'] as PipelineStep[]).map((n) => ({
        name: n,
        label: STEP_LABELS[n].label,
        description: STEP_LABELS[n].description,
        status: 'pending',
    }));
}

const currentPipeline = ref<PipelineStepState[]>(emptyPipeline());
const currentSessionId = ref<string | null>(null);
const sessions = ref<AgentSession[]>([]);
const activity = ref<ActivityFeedEntry[]>([]);

// Real counters — only what the ADK SSE stream actually provides.
const costSummary = ref({
    elementalCalls: 0,
    cacheHits: 0,
    /** LLM tokens are not available in the ADK SSE stream. */
    llmTokens: null as number | null,
    /** Cost is not available in the ADK SSE stream. */
    estimatedCostUsd: null as number | null,
    totalDurationMs: 0,
});

export function useAgentPipeline() {
    function resetPipeline() {
        currentPipeline.value = emptyPipeline();
    }

    function pushActivity(agent: string, entity: string, detail: string) {
        activity.value.unshift({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            agent,
            entity,
            detail,
        });
        if (activity.value.length > 80) activity.value.length = 80;
    }

    /**
     * Start a new pipeline session driven by real agent stream events.
     * Returns an updater that agents.vue calls for each new stream event.
     */
    function startPipeline(opts: { trigger: string; entityCount: number }): {
        onEvent: (event: AgentStreamEvent) => void;
        onDone: (error?: boolean) => void;
    } {
        resetPipeline();
        const sessionId = crypto.randomUUID();
        currentSessionId.value = sessionId;
        const sessionStart = Date.now();

        const session: AgentSession = {
            id: sessionId,
            trigger: opts.trigger,
            status: 'running',
            entityCount: opts.entityCount,
            duration: 0,
            timestamp: sessionStart,
            steps: currentPipeline.value,
        };
        sessions.value.unshift(session);

        // Mark Dialogue as immediately completed (intent is resolved before streaming starts).
        _markStep('dialogue', 'completed', Date.now(), undefined);

        // Track query step: how many tool calls / responses seen.
        let toolCallCount = 0;
        let queryStartedAt: number | undefined;
        let historyStartedAt: number | undefined;
        let compositionStartedAt: number | undefined;

        function onEvent(ev: AgentStreamEvent) {
            if (ev.event === 'function_call') {
                toolCallCount++;

                if (!historyStartedAt) {
                    historyStartedAt = Date.now();
                    _markStep('history', 'working', historyStartedAt, undefined);
                }
                if (toolCallCount > 1 && !queryStartedAt) {
                    queryStartedAt = Date.now();
                    _markStep('query', 'working', queryStartedAt, undefined);
                }
            } else if (ev.event === 'function_response') {
                // Each response is one real Elemental (or tool) call completing.
                costSummary.value.elementalCalls++;

                if (historyStartedAt && currentPipeline.value[1].status === 'working') {
                    _markStep('history', 'completed', undefined, Date.now());
                    const prev = currentPipeline.value[1].evidenceCount ?? 0;
                    currentPipeline.value[1].evidenceCount = prev + 1;
                }
                if (queryStartedAt && currentPipeline.value[2].status === 'working') {
                    const prev = currentPipeline.value[2].evidenceCount ?? 0;
                    currentPipeline.value[2].evidenceCount = prev + 1;
                }
            } else if (ev.event === 'text') {
                if (!queryStartedAt) {
                    // Agent answered without tool calls — skip history/query.
                    _markStep('history', 'completed', Date.now(), Date.now());
                    _markStep('query', 'completed', Date.now(), Date.now());
                } else if (currentPipeline.value[2].status !== 'completed') {
                    _markStep('query', 'completed', undefined, Date.now());
                }
                if (!compositionStartedAt) {
                    compositionStartedAt = Date.now();
                    _markStep('composition', 'working', compositionStartedAt, undefined);
                }
            }
        }

        function onDone(error = false) {
            const now = Date.now();
            // Ensure all steps are resolved.
            if (currentPipeline.value[1].status !== 'completed')
                _markStep('history', 'completed', undefined, now);
            if (currentPipeline.value[2].status !== 'completed')
                _markStep('query', 'completed', undefined, now);
            _markStep('composition', error ? 'error' : 'completed', compositionStartedAt, now);

            const duration = now - sessionStart;
            session.status = error ? 'failed' : 'completed';
            session.duration = duration;
            costSummary.value.totalDurationMs += duration;
        }

        return { onEvent, onDone };
    }

    /**
     * Legacy helper kept for callers that want a fire-and-forget pipeline
     * animation (e.g. scan button). Uses real timing but no real events.
     */
    async function runPipeline(opts: { trigger: string; entityCount: number }) {
        const { onDone } = startPipeline(opts);
        // Mark all steps complete after a short delay so the UI shows activity.
        await new Promise((r) => setTimeout(r, 500));
        onDone();
    }

    return {
        currentPipeline: computed(() => currentPipeline.value),
        currentSessionId: computed(() => currentSessionId.value),
        sessions: computed(() => sessions.value),
        activity: computed(() => activity.value),
        costSummary: computed(() => costSummary.value),
        startPipeline,
        runPipeline,
        pushActivity,
        resetPipeline,
    };
}

function _markStep(
    name: PipelineStep,
    status: PipelineStatus,
    startedAt: number | undefined,
    completedAt: number | undefined
) {
    const idx = (['dialogue', 'history', 'query', 'composition'] as PipelineStep[]).indexOf(name);
    if (idx === -1) return;
    const step = currentPipeline.value[idx];
    step.status = status;
    if (startedAt != null) step.startedAt = startedAt;
    if (completedAt != null) step.completedAt = completedAt;
}
