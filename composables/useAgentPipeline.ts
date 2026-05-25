/**
 * Agent pipeline state composable.
 *
 * Tracks the 4-step pipeline (Dialogue → History → Query → Composition) for
 * the Agent Workspace UI. Each step has progress + status; sessions are
 * recorded in module state so the Session History table has data.
 *
 * The pipeline runner here is a UI animation that mirrors what the real ADK
 * pipeline would do — useful for the demo while live agents are still being
 * deployed.
 */

import { computed, ref } from 'vue';

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
const costSummary = ref({
    elementalCalls: 0,
    cacheHits: 0,
    llmTokens: 0,
    estimatedCostUsd: 0,
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
     * Run a simulated agent pipeline for a trigger — used by the Agent
     * Workspace chat and the Portfolio Overview "scan" button to give the
     * Agent Activity Feed and Pipeline Viewer something to animate.
     */
    async function runPipeline(opts: { trigger: string; entityCount: number }) {
        resetPipeline();
        const sessionId = crypto.randomUUID();
        currentSessionId.value = sessionId;
        const session: AgentSession = {
            id: sessionId,
            trigger: opts.trigger,
            status: 'running',
            entityCount: opts.entityCount,
            duration: 0,
            timestamp: Date.now(),
            steps: currentPipeline.value,
        };
        sessions.value.unshift(session);

        const start = Date.now();
        const steps: PipelineStep[] = ['dialogue', 'history', 'query', 'composition'];
        const detailTemplates: Record<PipelineStep, (e: string) => string> = {
            dialogue: (e) => `${e} resolved → portfolio + time window inferred`,
            history: (e) =>
                `${e} multi-source pull: ${4 + Math.floor(Math.random() * 12)} relationships, ${3 + Math.floor(Math.random() * 6)} events`,
            query: (e) =>
                `${e} scored across 4 lenses; ${Math.random() > 0.5 ? 'conflict flagged' : 'sources agree'}`,
            composition: (e) => `${e} response composed with cited evidence`,
        };

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            currentPipeline.value[i].status = 'working';
            currentPipeline.value[i].startedAt = Date.now();
            await sleep(400 + Math.random() * 600);
            currentPipeline.value[i].status = 'completed';
            currentPipeline.value[i].completedAt = Date.now();
            currentPipeline.value[i].evidenceCount = 3 + Math.floor(Math.random() * 8);
            pushActivity(
                STEP_LABELS[step].label,
                opts.trigger,
                detailTemplates[step](opts.trigger)
            );
        }
        const duration = Date.now() - start;
        session.status = 'completed';
        session.duration = duration;

        costSummary.value = {
            elementalCalls: costSummary.value.elementalCalls + opts.entityCount * 4,
            cacheHits: costSummary.value.cacheHits + Math.floor(opts.entityCount * 0.6),
            llmTokens: costSummary.value.llmTokens + 8000 + Math.floor(Math.random() * 4000),
            estimatedCostUsd:
                Math.round(
                    (costSummary.value.estimatedCostUsd + 0.08 + Math.random() * 0.12) * 100
                ) / 100,
            totalDurationMs: costSummary.value.totalDurationMs + duration,
        };
    }

    return {
        currentPipeline: computed(() => currentPipeline.value),
        currentSessionId: computed(() => currentSessionId.value),
        sessions: computed(() => sessions.value),
        activity: computed(() => activity.value),
        costSummary: computed(() => costSummary.value),
        runPipeline,
        pushActivity,
        resetPipeline,
    };
}

function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}
