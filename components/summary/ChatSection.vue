<template>
    <div class="chat-section pa-4">
        <div class="d-flex align-center mb-3">
            <v-icon size="small" class="mr-2">mdi-forum-outline</v-icon>
            <span class="text-subtitle-2">{{ title || 'Portfolio Q&A' }}</span>
        </div>

        <div v-if="suggestions?.length && !messages.length" class="mb-3">
            <div class="text-caption text-medium-emphasis mb-2">Try asking:</div>
            <div class="d-flex flex-wrap gap-2">
                <v-chip
                    v-for="s in suggestions"
                    :key="s"
                    size="small"
                    variant="outlined"
                    @click="sendQuestion(s)"
                >
                    {{ s }}
                </v-chip>
            </div>
        </div>

        <div v-if="messages.length" class="chat-messages mb-3">
            <div
                v-for="m in messages"
                :key="m.id"
                class="mb-3"
                :class="m.role === 'user' ? 'text-right' : ''"
            >
                <div
                    class="msg-bubble pa-2 px-3 d-inline-block text-left"
                    :class="m.role === 'user' ? 'user-bubble' : 'agent-bubble'"
                >
                    <div v-if="m.role === 'agent'" class="text-caption text-medium-emphasis mb-1">
                        <v-icon size="x-small" class="mr-1">mdi-robot-outline</v-icon>
                        Analyst
                    </div>
                    <div class="text-body-2" style="white-space: pre-wrap">{{ m.text }}</div>
                </div>
            </div>
            <div v-if="loading" class="text-caption text-medium-emphasis d-flex align-center">
                <v-progress-circular
                    size="12"
                    width="2"
                    indeterminate
                    color="primary"
                    class="mr-2"
                />
                Analyzing…
            </div>
        </div>

        <div class="d-flex gap-2">
            <v-text-field
                v-model="draft"
                :placeholder="placeholder || 'Ask about the portfolio…'"
                density="compact"
                hide-details
                variant="outlined"
                @keydown.enter="sendQuestion(draft)"
            />
            <v-btn
                color="primary"
                :loading="loading"
                :disabled="!draft.trim()"
                @click="sendQuestion(draft)"
            >
                Ask
            </v-btn>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { ref } from 'vue';

    const props = defineProps<{
        endpoint: string;
        requestBody?: Record<string, any>;
        title?: string;
        placeholder?: string;
        suggestions?: string[];
    }>();

    interface ChatMsg {
        id: string;
        role: 'user' | 'agent';
        text: string;
    }

    const messages = ref<ChatMsg[]>([]);
    const draft = ref('');
    const loading = ref(false);

    async function sendQuestion(question: string) {
        if (!question.trim() || loading.value) return;
        draft.value = '';
        messages.value.push({ id: crypto.randomUUID(), role: 'user', text: question });
        loading.value = true;
        try {
            const res = await $fetch<{ answer: string }>(props.endpoint, {
                method: 'POST',
                body: { ...(props.requestBody ?? {}), question },
            });
            messages.value.push({
                id: crypto.randomUUID(),
                role: 'agent',
                text: res.answer || '(no response)',
            });
        } catch (e: any) {
            messages.value.push({
                id: crypto.randomUUID(),
                role: 'agent',
                text: `Error: ${e.data?.statusMessage || e.message || 'Failed to get answer'}`,
            });
        } finally {
            loading.value = false;
        }
    }
</script>

<style scoped>
    .chat-section {
        border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
        background: rgba(var(--v-theme-surface-variant), 0.2);
    }
    .chat-messages {
        max-height: 300px;
        overflow-y: auto;
    }
    .msg-bubble {
        border-radius: 10px;
        max-width: 85%;
    }
    .user-bubble {
        background: rgba(var(--dynamic-primary-rgb), 0.08);
        border: 1px solid rgba(var(--dynamic-primary-rgb), 0.2);
    }
    .agent-bubble {
        background: rgba(var(--v-theme-surface-variant), 0.5);
        border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    }
    .gap-2 {
        gap: 8px;
    }
</style>
