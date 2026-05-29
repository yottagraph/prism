<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-4 page-header">
            <PageHeader title="Agent Workspace" icon="mdi-robot-outline" />
            <div class="text-caption text-medium-emphasis mt-1">
                Conversational interface + live pipeline view of the 4-agent Dialogue → History →
                Query → Composition flow.
            </div>
        </div>

        <div class="flex-grow-1 overflow-y-auto pa-4">
            <v-row dense>
                <v-col cols="12" lg="7">
                    <v-card class="chat-card fill-height d-flex flex-column">
                        <div class="d-flex align-center pa-3 chat-header">
                            <v-icon size="small" class="mr-2">mdi-forum-outline</v-icon>
                            <span class="text-subtitle-2">Portfolio Chat</span>
                            <v-spacer />
                            <v-btn
                                size="small"
                                variant="text"
                                prepend-icon="mdi-broom"
                                @click="clearChat"
                            >
                                Clear
                            </v-btn>
                        </div>
                        <div ref="chatBody" class="chat-body pa-3">
                            <v-alert
                                v-if="agentUnavailable"
                                type="warning"
                                variant="tonal"
                                density="comfortable"
                                class="mb-3"
                                icon="mdi-robot-off-outline"
                            >
                                No agent is deployed for this project yet. Deploy one with
                                <code>/deploy_agent</code> or from the Broadchurch portal, then
                                reload.
                            </v-alert>
                            <div v-if="!chat.length" class="text-center text-medium-emphasis pa-8">
                                <v-icon size="48" color="primary" class="mb-3">
                                    mdi-message-text-outline
                                </v-icon>
                                <div class="text-body-2 mb-2">
                                    Ask the agent about your portfolio
                                </div>
                                <div class="text-caption mb-3">Try one of these:</div>
                                <div class="d-flex flex-wrap justify-center gap-2">
                                    <v-chip
                                        v-for="s in suggestions"
                                        :key="s"
                                        size="small"
                                        variant="outlined"
                                        @click="sendChat(s)"
                                    >
                                        {{ s }}
                                    </v-chip>
                                </div>
                            </div>
                            <div
                                v-for="m in chat"
                                :key="m.id"
                                class="msg-row mb-3"
                                :class="`role-${m.role}`"
                            >
                                <v-avatar
                                    size="28"
                                    :color="m.role === 'user' ? 'primary' : 'secondary'"
                                    class="mr-2"
                                >
                                    <v-icon size="small" color="white">
                                        {{
                                            m.role === 'user' ? 'mdi-account' : 'mdi-robot-outline'
                                        }}
                                    </v-icon>
                                </v-avatar>
                                <div class="msg-bubble">
                                    <div class="msg-text" v-html="formatText(m.text)" />
                                    <div v-if="m.evidence?.length" class="evidence-row mt-2">
                                        <v-chip
                                            v-for="(e, i) in m.evidence"
                                            :key="i"
                                            size="x-small"
                                            variant="outlined"
                                            prepend-icon="mdi-file-document-outline"
                                            class="mr-1 mb-1"
                                        >
                                            {{ e }}
                                        </v-chip>
                                    </div>
                                </div>
                            </div>
                            <div
                                v-if="thinking"
                                class="text-caption text-medium-emphasis text-center pa-2"
                            >
                                <v-progress-circular
                                    size="14"
                                    width="2"
                                    indeterminate
                                    color="primary"
                                    class="mr-2"
                                />
                                Agent pipeline running…
                            </div>
                        </div>
                        <v-divider />
                        <div class="pa-3 d-flex">
                            <v-text-field
                                v-model="draft"
                                placeholder="Ask about your portfolio…"
                                density="comfortable"
                                hide-details
                                @keydown.enter="sendChat(draft)"
                            />
                            <v-btn
                                color="primary"
                                class="ml-2"
                                :loading="thinking"
                                :disabled="!draft.trim()"
                                @click="sendChat(draft)"
                            >
                                Send
                            </v-btn>
                        </div>
                    </v-card>
                </v-col>
                <v-col cols="12" lg="5">
                    <AgentPipelineViewer :steps="currentPipeline" class="mb-3" />

                    <v-card class="pa-3 mb-3">
                        <div class="d-flex align-center mb-2">
                            <v-icon size="small" class="mr-2">mdi-cash-multiple</v-icon>
                            <span class="text-subtitle-2">Cost & Performance</span>
                        </div>
                        <v-row dense>
                            <v-col cols="6">
                                <CostMetric
                                    label="Elemental calls"
                                    :value="costSummary.elementalCalls"
                                />
                            </v-col>
                            <v-col cols="6">
                                <CostMetric label="Tool responses" :value="cacheHitRate" />
                            </v-col>
                            <v-col cols="6">
                                <CostMetric
                                    label="LLM tokens"
                                    :value="
                                        costSummary.llmTokens != null
                                            ? costSummary.llmTokens.toLocaleString()
                                            : '—'
                                    "
                                />
                            </v-col>
                            <v-col cols="6">
                                <CostMetric
                                    label="Est. cost"
                                    :value="
                                        costSummary.estimatedCostUsd != null
                                            ? `$${costSummary.estimatedCostUsd.toFixed(2)}`
                                            : '—'
                                    "
                                />
                            </v-col>
                            <v-col cols="12">
                                <CostMetric
                                    label="Total duration"
                                    :value="`${(costSummary.totalDurationMs / 1000).toFixed(1)}s`"
                                />
                            </v-col>
                        </v-row>
                    </v-card>

                    <v-card class="pa-3 mb-3">
                        <div class="d-flex align-center mb-2">
                            <v-icon size="small" class="mr-2">mdi-tune-variant</v-icon>
                            <span class="text-subtitle-2">Fusion Weights</span>
                        </div>
                        <div class="text-caption text-medium-emphasis mb-2">
                            Adjust lens weighting; values auto-normalize to sum to 1.0.
                        </div>
                        <v-slider
                            v-model="weights.solvency"
                            min="0"
                            max="1"
                            step="0.01"
                            label="Solvency"
                            hide-details
                            class="mb-1"
                            @change="normalizeWeights"
                        />
                        <v-slider
                            v-model="weights.executive"
                            min="0"
                            max="1"
                            step="0.01"
                            label="Executive"
                            hide-details
                            class="mb-1"
                            @change="normalizeWeights"
                        />
                        <v-slider
                            v-model="weights.news"
                            min="0"
                            max="1"
                            step="0.01"
                            label="News"
                            hide-details
                            class="mb-1"
                            @change="normalizeWeights"
                        />
                        <v-slider
                            v-model="weights.market"
                            min="0"
                            max="1"
                            step="0.01"
                            label="Market"
                            hide-details
                            @change="normalizeWeights"
                        />
                    </v-card>

                    <AgentActivityFeed :entries="activity" />
                </v-col>
            </v-row>

            <v-card class="mt-3 pa-3">
                <div class="d-flex align-center mb-3">
                    <v-icon size="small" class="mr-2">mdi-history</v-icon>
                    <span class="text-subtitle-2">Session History</span>
                </div>
                <v-data-table
                    :headers="sessionHeaders"
                    :items="sessions"
                    v-model:expanded="expandedSessions"
                    item-value="id"
                    show-expand
                    density="comfortable"
                    no-data-text="No completed sessions yet."
                >
                    <template v-slot:item.status="{ item }">
                        <v-chip
                            size="x-small"
                            :color="
                                item.status === 'completed'
                                    ? 'success'
                                    : item.status === 'running'
                                      ? 'primary'
                                      : 'error'
                            "
                            variant="tonal"
                        >
                            {{ item.status }}
                        </v-chip>
                    </template>
                    <template v-slot:item.duration="{ item }">
                        {{ (item.duration / 1000).toFixed(1) }}s
                    </template>
                    <template v-slot:item.timestamp="{ item }">
                        {{ new Date(item.timestamp).toLocaleString() }}
                    </template>
                    <template v-slot:expanded-row="{ columns, item }">
                        <tr>
                            <td :colspan="columns.length">
                                <div class="pa-3">
                                    <div class="text-caption text-medium-emphasis mb-2">
                                        Agent trace
                                    </div>
                                    <v-row dense>
                                        <v-col
                                            v-for="step in item.steps"
                                            :key="step.name"
                                            cols="12"
                                            md="6"
                                            lg="3"
                                        >
                                            <v-sheet class="pa-2 trace-card">
                                                <div class="text-subtitle-2">{{ step.label }}</div>
                                                <div class="text-caption text-medium-emphasis">
                                                    {{ step.description }}
                                                </div>
                                                <div class="text-caption mt-1">
                                                    Status: <strong>{{ step.status }}</strong>
                                                </div>
                                                <div class="text-caption">
                                                    Evidence: {{ step.evidenceCount ?? 0 }}
                                                </div>
                                            </v-sheet>
                                        </v-col>
                                    </v-row>
                                </div>
                            </td>
                        </tr>
                    </template>
                </v-data-table>
            </v-card>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, defineComponent, h, onMounted, ref, watch } from 'vue';

    import { useAgentChat } from '~/composables/useAgentChat';
    import { useAgentPipeline } from '~/composables/useAgentPipeline';
    import { usePortfolio } from '~/composables/usePortfolio';
    import { useTenantConfig } from '~/composables/useTenantConfig';

    const { activePortfolio: active, weights } = usePortfolio();
    const {
        startPipeline,
        runPipeline,
        currentPipeline,
        sessions,
        activity,
        costSummary,
        pushActivity,
    } = useAgentPipeline();
    const {
        messages,
        loading,
        streamEvents,
        selectAgent,
        sendMessage,
        clearChat: clearAgentChat,
    } = useAgentChat();

    const chat = computed(() =>
        messages.value.map((message) => ({
            id: message.id,
            role: message.role,
            text: message.text,
            evidence: [] as string[],
            error: message.error === true,
        }))
    );
    const draft = ref('');
    const thinking = computed(() => loading.value);
    const chatBody = ref<HTMLElement | null>(null);
    const expandedSessions = ref<string[]>([]);

    const suggestions = [
        'Which 3 companies in my portfolio have the highest fused risk and why?',
        'Summarize the governance interlocks across the portfolio.',
        'Which lenders show concentrated exposure across multiple portfolio companies?',
        'What macro signals should I worry about right now?',
    ];

    const { fetchConfig } = useTenantConfig();
    const agentUnavailable = ref(false);

    onMounted(async () => {
        // The portal/authorize and Agent Engine routes are keyed by the
        // deployed agent's engine_id — NOT a guessed name. Discover it from
        // the tenant config instead of hardcoding an ID.
        const cfg = await fetchConfig();
        const agents = cfg?.agents ?? [];
        // Prefer this project's agent by name, else fall back to the first.
        const agent = agents.find((a) => a.name === 'prism_agent') ?? agents[0];

        if (agent?.engine_id) {
            selectAgent(agent.engine_id);
        } else {
            agentUnavailable.value = true;
        }
    });

    // Pipeline updater bound to the current send — replaced on each new message.
    let _pipelineUpdater: ReturnType<typeof startPipeline> | null = null;

    watch(
        streamEvents,
        (events) => {
            const latest = events[events.length - 1];
            if (!latest) return;

            // Forward to real pipeline updater.
            _pipelineUpdater?.onEvent(latest);

            // Activity feed entries.
            if (latest.event === 'function_call') {
                pushActivity(
                    'History Agent',
                    active.value?.name ?? 'portfolio',
                    latest.data?.name ?? 'tool call'
                );
            } else if (latest.event === 'function_response') {
                pushActivity(
                    'Query Agent',
                    active.value?.name ?? 'portfolio',
                    `${latest.data?.name ?? 'tool'} response received`
                );
            } else if (latest.event === 'text') {
                pushActivity(
                    'Composition Agent',
                    active.value?.name ?? 'portfolio',
                    'Narrative updated'
                );
            } else if (latest.event === 'done') {
                _pipelineUpdater?.onDone(false);
                _pipelineUpdater = null;
            } else if (latest.event === 'error') {
                _pipelineUpdater?.onDone(true);
                _pipelineUpdater = null;
            }
        },
        { deep: true }
    );

    async function sendChat(text: string) {
        if (!text.trim() || loading.value) return;
        draft.value = '';
        _pipelineUpdater = startPipeline({
            trigger: active.value?.name ?? 'portfolio',
            entityCount: active.value?.entities.length ?? 1,
        });
        await sendMessage(text);
        // If done/error events didn't fire, close the session now.
        if (_pipelineUpdater) {
            _pipelineUpdater.onDone(
                !chat.value.length || chat.value[chat.value.length - 1]?.error === true
            );
            _pipelineUpdater = null;
        }
        scrollToBottom();
    }

    function scrollToBottom() {
        nextTick(() => {
            if (chatBody.value) chatBody.value.scrollTop = chatBody.value.scrollHeight;
        });
    }

    function formatText(t: string): string {
        return t;
    }

    function clearChat() {
        clearAgentChat();
    }

    const sessionHeaders = [
        { title: 'Trigger', key: 'trigger' },
        { title: 'Status', key: 'status' },
        { title: 'Entities', key: 'entityCount', align: 'end' as const },
        { title: 'Duration', key: 'duration', align: 'end' as const },
        { title: 'Timestamp', key: 'timestamp' },
        { title: '', key: 'data-table-expand' },
    ];

    const cacheHitRate = computed(() => {
        const calls = costSummary.value.elementalCalls;
        if (!calls) return '—';
        // Cache hits aren't tracked in the ADK stream; show call count only.
        return calls;
    });

    function normalizeWeights() {
        const sum =
            weights.value.solvency +
            weights.value.executive +
            weights.value.news +
            weights.value.market;
        if (sum <= 0) return;
        weights.value = {
            solvency: Number((weights.value.solvency / sum).toFixed(3)),
            executive: Number((weights.value.executive / sum).toFixed(3)),
            news: Number((weights.value.news / sum).toFixed(3)),
            market: Number((weights.value.market / sum).toFixed(3)),
        };
    }

    const CostMetric = defineComponent({
        props: { label: String, value: [String, Number], suffix: String },
        setup(p) {
            return () =>
                h('div', { class: 'cost-metric' }, [
                    h(
                        'div',
                        { class: 'text-caption text-medium-emphasis text-uppercase letter-spaced' },
                        p.label
                    ),
                    h('div', { class: 'text-h6 font-mono' }, `${p.value ?? '–'}${p.suffix ?? ''}`),
                ]);
        },
    });
</script>

<style scoped>
    .page-header {
        border-bottom: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
        background: rgba(var(--dynamic-bg-rgb), 0.3);
    }

    .chat-card {
        min-height: 500px;
    }

    .chat-header {
        border-bottom: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
    }

    .chat-body {
        flex: 1;
        overflow-y: auto;
        min-height: 320px;
    }

    .msg-row {
        display: flex;
        align-items: flex-start;
    }

    .role-user {
        flex-direction: row-reverse;
    }

    .role-user .msg-bubble {
        background: rgba(var(--dynamic-primary-rgb), 0.08);
        border-color: rgba(var(--dynamic-primary-rgb), 0.2);
    }

    .msg-bubble {
        max-width: 80%;
        padding: 10px 14px;
        background: rgba(var(--dynamic-fg-rgb), 0.03);
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.06);
        border-radius: 10px;
        font-size: 0.9rem;
    }

    .msg-text :deep(strong) {
        color: var(--dynamic-primary);
    }

    .gap-2 {
        gap: 8px;
    }

    .cost-metric {
        padding: 6px 8px;
    }

    .letter-spaced {
        letter-spacing: 0.08em;
    }

    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }

    .trace-card {
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.08);
        border-radius: 8px;
        background: rgba(var(--dynamic-fg-rgb), 0.02);
    }
</style>
