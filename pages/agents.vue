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
                                <CostMetric
                                    label="Cache hit rate"
                                    :value="cacheHitRate"
                                    suffix="%"
                                />
                            </v-col>
                            <v-col cols="6">
                                <CostMetric
                                    label="LLM tokens"
                                    :value="costSummary.llmTokens.toLocaleString()"
                                />
                            </v-col>
                            <v-col cols="6">
                                <CostMetric
                                    label="Est. cost"
                                    :value="`$${costSummary.estimatedCostUsd.toFixed(2)}`"
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
                </v-data-table>
            </v-card>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, defineComponent, h, ref } from 'vue';

    import { useAgentPipeline } from '~/composables/useAgentPipeline';
    import { usePortfolio } from '~/composables/usePortfolio';

    const { activePortfolio: active } = usePortfolio();
    const { runPipeline, currentPipeline, sessions, activity, costSummary, pushActivity } =
        useAgentPipeline();

    interface ChatMessage {
        id: string;
        role: 'user' | 'agent';
        text: string;
        evidence?: string[];
    }
    const chat = ref<ChatMessage[]>([]);
    const draft = ref('');
    const thinking = ref(false);
    const chatBody = ref<HTMLElement | null>(null);

    const suggestions = [
        'Which 3 companies in my portfolio have the highest fused risk and why?',
        'Summarize the governance interlocks across the portfolio.',
        'Which lenders show concentrated exposure across multiple portfolio companies?',
        'What macro signals should I worry about right now?',
    ];

    async function sendChat(text: string) {
        if (!text.trim() || thinking.value) return;
        const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', text };
        chat.value.push(user);
        draft.value = '';
        thinking.value = true;
        await runPipeline({
            trigger: active.value?.name ?? 'portfolio',
            entityCount: active.value?.entities.length ?? 1,
        });
        const reply = composeReply(text);
        chat.value.push({
            id: crypto.randomUUID(),
            role: 'agent',
            text: reply.text,
            evidence: reply.evidence,
        });
        thinking.value = false;
        pushActivity('Composition Agent', active.value?.name ?? 'portfolio', 'Response composed');
        scrollToBottom();
    }

    function scrollToBottom() {
        nextTick(() => {
            if (chatBody.value) chatBody.value.scrollTop = chatBody.value.scrollHeight;
        });
    }

    function composeReply(question: string): { text: string; evidence: string[] } {
        const p = active.value;
        if (!p) {
            return {
                text: 'No active portfolio. Load one from the Portfolio page first.',
                evidence: [],
            };
        }
        const scored = p.entities.filter((e) => e.scores);
        if (!scored.length) {
            return {
                text: 'No scored entities yet. Run a scan from the Portfolio page first — agents need to resolve and score entities before I can answer.',
                evidence: [],
            };
        }
        const top = [...scored]
            .sort((a, b) => (b.scores!.fused ?? 0) - (a.scores!.fused ?? 0))
            .slice(0, 3);
        const lower = question.toLowerCase();

        if (lower.includes('highest') || lower.includes('top') || lower.includes('riskiest')) {
            const lines = top.map(
                (e, i) =>
                    `<strong>${i + 1}. ${e.resolvedName}</strong> — fused ${e.scores!.fused} (${e.scores!.tier}). Drivers: solvency ${e.scores!.solvency}, executive ${e.scores!.executive}, news ${e.scores!.news}, market ${e.scores!.market}.`
            );
            return {
                text:
                    `The three highest-risk names in <strong>${p.name}</strong>:<br><br>` +
                    lines.join('<br><br>') +
                    `<br><br>Each score traces back to source-level signals — open the entity from the Portfolio table to inspect the evidence chain.`,
                evidence: top.map((e) => `${e.resolvedName} score breakdown`),
            };
        }
        if (
            lower.includes('governance') ||
            lower.includes('interlock') ||
            lower.includes('director')
        ) {
            return {
                text: `Across <strong>${p.name}</strong> I detect potential governance interlocks where multiple portfolio entities share officers or directors. Open the <strong>Relationship Explorer</strong> and switch to the <em>People</em> tab — any person with more than one company served is flagged in warning color. The "Cross-Portfolio Patterns" panel surfaces the most material interlocks with the affected entities listed.`,
                evidence: ['Relationship Explorer · People tab', 'Cross-portfolio patterns panel'],
            };
        }
        if (lower.includes('lender') || lower.includes('credit')) {
            return {
                text: `The Instruments tab in the Relationship Explorer groups credit facilities by lender. When the same institution shows up as <em>lender_of</em> for 3+ portfolio companies, that's flagged as a <strong>common-lender concentration</strong> pattern in the patterns panel — covenant tightening from that lender would correlate defaults across your holdings.`,
                evidence: ['Relationship Explorer · Instruments', 'Common-lender pattern detector'],
            };
        }
        if (
            lower.includes('macro') ||
            lower.includes('polymarket') ||
            lower.includes('recession')
        ) {
            return {
                text: `Macro overlay on the Portfolio Overview shows recession probability, credit-stress index, rate-cut probability, and sector outlook. These are sourced from prediction-market signals via the lovelace-polymarket MCP server and serve as portfolio-level context (not per-entity scores). Pair them with the source fusion bar to see if any per-entity signals are corroborated by macro stress.`,
                evidence: ['Macro Context · Polymarket'],
            };
        }
        return {
            text: `Looking at <strong>${p.name}</strong> (${scored.length} scored entities), the top names by fused risk are: <strong>${top.map((t) => t.resolvedName).join(', ')}</strong>. Ask me about governance, common lenders, or macro signals for a more specific narrative — or open any entity from the Portfolio table for the full evidence chain.`,
            evidence: [`${scored.length} entity scores`, 'Portfolio-level analytics'],
        };
    }

    function formatText(t: string): string {
        return t;
    }

    function clearChat() {
        chat.value = [];
    }

    const sessionHeaders = [
        { title: 'Trigger', key: 'trigger' },
        { title: 'Status', key: 'status' },
        { title: 'Entities', key: 'entityCount', align: 'end' as const },
        { title: 'Duration', key: 'duration', align: 'end' as const },
        { title: 'Timestamp', key: 'timestamp' },
    ];

    const cacheHitRate = computed(() => {
        const total = costSummary.value.elementalCalls + costSummary.value.cacheHits;
        if (!total) return 0;
        return Math.round((costSummary.value.cacheHits / total) * 100);
    });

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
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(0, 0, 0, 0.3);
    }

    .chat-card {
        min-height: 500px;
    }

    .chat-header {
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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
        background: rgba(63, 234, 0, 0.08);
        border-color: rgba(63, 234, 0, 0.2);
    }

    .msg-bubble {
        max-width: 80%;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        font-size: 0.9rem;
    }

    .msg-text :deep(strong) {
        color: var(--lv-green, #3fea00);
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
</style>
