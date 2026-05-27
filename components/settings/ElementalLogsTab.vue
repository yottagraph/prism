<template>
    <div class="elemental-logs-tab">
        <!-- Backend banner -->
        <v-alert v-if="backend === 'fs'" type="info" variant="tonal" density="compact" class="mb-3">
            Reading from the local-filesystem fallback
            (<code>.aether-dev-elemental-logs/log.jsonl</code>). Neon Postgres isn't configured
            locally; deploys will persist to Neon automatically.
        </v-alert>
        <v-alert
            v-else-if="backend === 'none'"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-3"
        >
            No storage backend is available, so call logs are not being captured.
        </v-alert>

        <!-- Stats strip -->
        <v-row dense>
            <v-col cols="6" sm="3">
                <v-card variant="outlined" class="pa-3">
                    <div class="text-caption text-medium-emphasis">Total calls</div>
                    <div class="text-h6">{{ formatNumber(stats.totalCalls) }}</div>
                </v-card>
            </v-col>
            <v-col cols="6" sm="3">
                <v-card variant="outlined" class="pa-3">
                    <div class="text-caption text-medium-emphasis">Errors</div>
                    <div class="text-h6">
                        {{ formatNumber(stats.errorCalls) }}
                        <span class="text-caption text-medium-emphasis"> ({{ errorRate }}%) </span>
                    </div>
                </v-card>
            </v-col>
            <v-col cols="6" sm="3">
                <v-card variant="outlined" class="pa-3">
                    <div class="text-caption text-medium-emphasis">Avg duration</div>
                    <div class="text-h6">{{ stats.avgDurationMs }} ms</div>
                </v-card>
            </v-col>
            <v-col cols="6" sm="3">
                <v-card variant="outlined" class="pa-3">
                    <div class="text-caption text-medium-emphasis">p95 duration</div>
                    <div class="text-h6">{{ stats.p95DurationMs }} ms</div>
                </v-card>
            </v-col>
        </v-row>

        <!-- Top endpoints / tools -->
        <v-row dense class="mt-1">
            <v-col cols="12" md="6">
                <v-card variant="outlined" class="pa-3">
                    <div class="text-caption text-medium-emphasis mb-1">Top QS REST endpoints</div>
                    <div v-if="!stats.topEndpoints.length" class="text-caption">No data yet.</div>
                    <v-table v-else density="compact" class="bg-transparent">
                        <tbody>
                            <tr v-for="row in stats.topEndpoints" :key="row.key">
                                <td class="font-monospace">{{ row.key }}</td>
                                <td class="text-right">{{ row.calls }}</td>
                                <td class="text-right text-medium-emphasis">
                                    {{ row.avgDurationMs }} ms
                                </td>
                            </tr>
                        </tbody>
                    </v-table>
                </v-card>
            </v-col>
            <v-col cols="12" md="6">
                <v-card variant="outlined" class="pa-3">
                    <div class="text-caption text-medium-emphasis mb-1">Top MCP tools</div>
                    <div v-if="!stats.topTools.length" class="text-caption">No data yet.</div>
                    <v-table v-else density="compact" class="bg-transparent">
                        <tbody>
                            <tr v-for="row in stats.topTools" :key="row.key">
                                <td class="font-monospace">{{ row.key }}</td>
                                <td class="text-right">{{ row.calls }}</td>
                                <td class="text-right text-medium-emphasis">
                                    {{ row.avgDurationMs }} ms
                                </td>
                            </tr>
                        </tbody>
                    </v-table>
                </v-card>
            </v-col>
        </v-row>

        <!-- Controls -->
        <div class="d-flex flex-wrap align-center ga-2 mt-4 mb-2">
            <v-select
                v-model="surface"
                label="Surface"
                :items="surfaceOptions"
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 160px"
                @update:model-value="reload"
            />
            <v-select
                v-model="origin"
                label="Origin"
                :items="originOptions"
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 160px"
                @update:model-value="reload"
            />
            <v-select
                v-model="okFilter"
                label="Status"
                :items="okOptions"
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 140px"
                @update:model-value="reload"
            />
            <v-select
                v-model="windowSelection"
                label="Window"
                :items="windowOptions"
                density="compact"
                variant="outlined"
                hide-details
                style="max-width: 160px"
                @update:model-value="reload"
            />
            <v-text-field
                v-model="search"
                label="Search endpoint / tool / caller"
                density="compact"
                variant="outlined"
                hide-details
                clearable
                style="min-width: 260px; flex: 1"
                @keyup.enter="reload"
                @click:clear="reload"
            />
            <v-spacer />
            <v-btn
                size="small"
                variant="text"
                prepend-icon="mdi-refresh"
                :loading="loading"
                @click="reload"
            >
                Refresh
            </v-btn>
            <v-btn
                size="small"
                color="error"
                variant="text"
                prepend-icon="mdi-trash-can-outline"
                @click="confirmClear = true"
            >
                Clear
            </v-btn>
        </div>

        <!-- Log table -->
        <v-card variant="outlined">
            <v-data-table
                :headers="headers"
                :items="rows"
                :loading="loading"
                density="compact"
                :items-per-page="pageSize"
                :items-per-page-options="[25, 50, 100, 200]"
                hover
                show-expand
                v-model:expanded="expanded"
                item-value="request_id"
                no-data-text="No Elemental calls captured in this window."
                class="bg-transparent"
                @update:items-per-page="(v) => onPageSizeChange(v)"
            >
                <template #[`item.started_at`]="{ item }">
                    <span class="font-monospace text-caption">
                        {{ formatTime(item.started_at) }}
                    </span>
                </template>
                <template #[`item.surface`]="{ item }">
                    <v-chip
                        size="x-small"
                        :color="item.surface === 'mcp' ? 'secondary' : 'primary'"
                        variant="tonal"
                    >
                        {{ item.surface }}
                    </v-chip>
                </template>
                <template #[`item.operation`]="{ item }">
                    <span class="font-monospace text-caption">
                        {{ formatOperation(item) }}
                    </span>
                </template>
                <template #[`item.status`]="{ item }">
                    <span :class="item.ok ? 'text-success' : 'text-error'">
                        {{ item.status }} {{ item.ok ? '✓' : '✗' }}
                    </span>
                </template>
                <template #[`item.duration_ms`]="{ item }">
                    <span class="font-monospace">{{ item.duration_ms }} ms</span>
                </template>
                <template #[`item.bytes`]="{ item }">
                    <span class="text-caption text-medium-emphasis">
                        {{ formatBytes(item.req_bytes) }} / {{ formatBytes(item.res_bytes) }}
                    </span>
                </template>
                <template #[`item.summary`]="{ item }">
                    <span class="text-caption text-medium-emphasis">
                        {{ formatSummary(item) }}
                    </span>
                </template>
                <template #expanded-row="{ item, columns }">
                    <tr>
                        <td :colspan="columns.length" class="py-3">
                            <div class="text-caption text-medium-emphasis mb-1">
                                {{ item.request_id }}
                                · origin={{ item.origin }}
                                <template v-if="item.caller">· {{ item.caller }}</template>
                                <template v-if="item.session_id">
                                    · session={{ item.session_id.slice(0, 12) }}…
                                </template>
                                <template v-if="item.page_path">
                                    · page={{ item.page_path }}
                                </template>
                            </div>
                            <v-row dense>
                                <v-col cols="12" md="6">
                                    <div class="text-caption mb-1">Request summary</div>
                                    <pre class="detail-pre">{{ formatJson(item.req_summary) }}</pre>
                                </v-col>
                                <v-col cols="12" md="6">
                                    <div class="text-caption mb-1">Response summary</div>
                                    <pre class="detail-pre">{{ formatJson(item.res_summary) }}</pre>
                                </v-col>
                                <v-col v-if="item.error" cols="12">
                                    <div class="text-caption mb-1 text-error">Error</div>
                                    <pre class="detail-pre detail-error">{{ item.error }}</pre>
                                </v-col>
                            </v-row>
                        </td>
                    </tr>
                </template>
            </v-data-table>
        </v-card>

        <div class="text-caption text-medium-emphasis mt-2">
            Backend: <code>{{ backend }}</code> · Showing latest {{ rows.length }} call{{
                rows.length === 1 ? '' : 's'
            }}.
            <template v-if="stats.timeRange?.earliest && stats.timeRange?.latest">
                Window range
                <code>{{ formatTime(stats.timeRange.earliest) }}</code>
                –
                <code>{{ formatTime(stats.timeRange.latest) }}</code
                >.
            </template>
        </div>

        <!-- Confirm clear dialog -->
        <v-dialog v-model="confirmClear" max-width="420">
            <v-card>
                <v-card-title>Clear all Elemental call logs?</v-card-title>
                <v-card-text>
                    This permanently deletes every captured call from
                    <code>{{ backend }}</code
                    >. New calls will start populating again immediately.
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn variant="text" @click="confirmClear = false">Cancel</v-btn>
                    <v-btn color="error" variant="flat" :loading="clearing" @click="clearAll">
                        Clear
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<script setup lang="ts">
    import { computed, onMounted, onUnmounted, ref } from 'vue';

    interface LogRow {
        request_id: string;
        started_at: string;
        duration_ms: number;
        surface: 'qs-rest' | 'mcp';
        origin: 'server' | 'client';
        method: string | null;
        endpoint: string | null;
        server_name: string | null;
        tool: string | null;
        caller: string | null;
        status: number;
        ok: boolean;
        cache: string | null;
        req_bytes: number | null;
        res_bytes: number | null;
        req_summary: Record<string, unknown> | null;
        res_summary: Record<string, unknown> | null;
        error: string | null;
        session_id: string | null;
        page_path: string | null;
    }

    interface StatsResponse {
        backend: 'neon' | 'fs' | 'none';
        totalCalls: number;
        okCalls: number;
        errorCalls: number;
        avgDurationMs: number;
        p95DurationMs: number;
        callsBySurface: Record<string, number>;
        topEndpoints: Array<{ key: string; calls: number; avgDurationMs: number }>;
        topTools: Array<{ key: string; calls: number; avgDurationMs: number }>;
        timeRange: { earliest: string | null; latest: string | null };
    }

    const rows = ref<LogRow[]>([]);
    const stats = ref<StatsResponse>({
        backend: 'none',
        totalCalls: 0,
        okCalls: 0,
        errorCalls: 0,
        avgDurationMs: 0,
        p95DurationMs: 0,
        callsBySurface: {},
        topEndpoints: [],
        topTools: [],
        timeRange: { earliest: null, latest: null },
    });
    const backend = ref<'neon' | 'fs' | 'none'>('none');
    const loading = ref(false);
    const clearing = ref(false);
    const confirmClear = ref(false);

    const surface = ref<'all' | 'qs-rest' | 'mcp'>('all');
    const origin = ref<'all' | 'server' | 'client'>('all');
    const okFilter = ref<'all' | 'ok' | 'err'>('all');
    const windowSelection = ref<'15m' | '1h' | '6h' | '24h' | '7d' | 'all'>('1h');
    const search = ref('');
    const pageSize = ref(50);
    const expanded = ref<string[]>([]);

    const surfaceOptions = [
        { title: 'All surfaces', value: 'all' },
        { title: 'QS REST', value: 'qs-rest' },
        { title: 'MCP', value: 'mcp' },
    ];
    const originOptions = [
        { title: 'All origins', value: 'all' },
        { title: 'Server', value: 'server' },
        { title: 'Client', value: 'client' },
    ];
    const okOptions = [
        { title: 'All', value: 'all' },
        { title: 'OK only', value: 'ok' },
        { title: 'Errors only', value: 'err' },
    ];
    const windowOptions = [
        { title: 'Last 15 min', value: '15m' },
        { title: 'Last 1 hour', value: '1h' },
        { title: 'Last 6 hours', value: '6h' },
        { title: 'Last 24 hours', value: '24h' },
        { title: 'Last 7 days', value: '7d' },
        { title: 'All time', value: 'all' },
    ];

    const headers = [
        { title: 'When', key: 'started_at', sortable: false, width: 100 },
        { title: 'Surface', key: 'surface', sortable: false, width: 90 },
        { title: 'Operation', key: 'operation', sortable: false },
        { title: 'Status', key: 'status', sortable: false, width: 90 },
        { title: 'Duration', key: 'duration_ms', sortable: false, width: 100 },
        { title: 'Req / Res', key: 'bytes', sortable: false, width: 140 },
        { title: 'Summary', key: 'summary', sortable: false },
        { title: '', key: 'data-table-expand', width: 30 },
    ];

    const errorRate = computed(() => {
        if (!stats.value.totalCalls) return 0;
        return Math.round((stats.value.errorCalls / stats.value.totalCalls) * 100);
    });

    function sinceIso(): string | null {
        const w = windowSelection.value;
        if (w === 'all') return null;
        const ms = {
            '15m': 15 * 60_000,
            '1h': 60 * 60_000,
            '6h': 6 * 60 * 60_000,
            '24h': 24 * 60 * 60_000,
            '7d': 7 * 24 * 60 * 60_000,
        }[w];
        return new Date(Date.now() - ms).toISOString();
    }

    function buildQuery(): Record<string, string> {
        const q: Record<string, string> = {};
        if (surface.value !== 'all') q.surface = surface.value;
        if (origin.value !== 'all') q.origin = origin.value;
        if (okFilter.value === 'ok') q.ok = 'true';
        if (okFilter.value === 'err') q.ok = 'false';
        if (search.value) q.search = search.value;
        const since = sinceIso();
        if (since) q.since = since;
        q.limit = String(pageSize.value);
        return q;
    }

    async function fetchLogs() {
        const q = buildQuery();
        const res = await $fetch<{
            backend: 'neon' | 'fs' | 'none';
            count: number;
            rows: LogRow[];
        }>('/api/diag/elemental-logs', { query: q });
        rows.value = res.rows;
        backend.value = res.backend;
    }

    async function fetchStats() {
        const q = buildQuery();
        const res = await $fetch<StatsResponse>('/api/diag/elemental-logs/stats', { query: q });
        stats.value = res;
        backend.value = res.backend;
    }

    async function reload() {
        loading.value = true;
        try {
            // Give any in-flight client-side persistence a chance to flush first.
            await (window as any).__elementalLog?.flush?.();
            await Promise.all([fetchLogs(), fetchStats()]);
        } catch (err) {
            console.warn('[ElementalLogsTab] reload failed', err);
        } finally {
            loading.value = false;
        }
    }

    async function clearAll() {
        clearing.value = true;
        try {
            await $fetch('/api/diag/elemental-logs', {
                method: 'DELETE',
                query: { all: 'true' },
            });
            confirmClear.value = false;
            await reload();
        } catch (err) {
            console.warn('[ElementalLogsTab] clear failed', err);
        } finally {
            clearing.value = false;
        }
    }

    function onPageSizeChange(value: number) {
        pageSize.value = value;
        void reload();
    }

    function formatTime(iso: string | null): string {
        if (!iso) return '';
        const d = new Date(iso);
        return d.toLocaleTimeString(undefined, {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    }

    function formatBytes(n: number | null | undefined): string {
        if (!n || n <= 0) return '0B';
        if (n < 1024) return `${n}B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}kB`;
        return `${(n / 1024 / 1024).toFixed(2)}MB`;
    }

    function formatNumber(n: number): string {
        return new Intl.NumberFormat().format(n);
    }

    function formatOperation(item: LogRow): string {
        if (item.surface === 'mcp') {
            if (item.server_name && item.tool) return `${item.server_name}→${item.tool}`;
            if (item.server_name) return item.server_name;
            return item.tool || '?';
        }
        const method = item.method || 'GET';
        const endpoint = item.endpoint || '?';
        return `${method} ${endpoint}`;
    }

    function formatSummary(item: LogRow): string {
        const parts: string[] = [];
        const append = (label: string, src: Record<string, unknown> | null) => {
            if (!src) return;
            const inner: string[] = [];
            for (const [k, v] of Object.entries(src)) {
                if (v == null) continue;
                if (typeof v === 'object') inner.push(`${k}=${JSON.stringify(v).slice(0, 40)}`);
                else inner.push(`${k}=${v}`);
            }
            if (inner.length) parts.push(`${label} ${inner.join(' ')}`);
        };
        if (item.cache) parts.push(`cache=${item.cache}`);
        append('·', item.req_summary);
        append('→', item.res_summary);
        return parts.join(' ');
    }

    function formatJson(value: Record<string, unknown> | null): string {
        if (!value) return '—';
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }

    let autoTimer: number | null = null;

    onMounted(() => {
        void reload();
        // Auto-refresh every 10s while the tab is open.
        autoTimer = window.setInterval(() => {
            if (!document.hidden && !loading.value) void reload();
        }, 10_000);
    });
    onUnmounted(() => {
        if (autoTimer) {
            window.clearInterval(autoTimer);
            autoTimer = null;
        }
    });
</script>

<style scoped>
    .detail-pre {
        background-color: rgba(var(--dynamic-fg-rgb), 0.04);
        padding: 8px 10px;
        border-radius: 4px;
        font-size: 11px;
        line-height: 1.4;
        white-space: pre-wrap;
        word-break: break-all;
        margin: 0;
    }

    .detail-error {
        background-color: rgba(239, 68, 68, 0.08);
    }

    .font-monospace {
        font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
            monospace;
    }
</style>
