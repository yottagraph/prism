<template>
    <div class="csv-import">
        <!-- Step 1: file or paste input -->
        <template v-if="step === 'input'">
            <v-file-input
                v-model="csvFile"
                label="Upload CSV file"
                accept=".csv,text/csv"
                variant="outlined"
                density="comfortable"
                prepend-icon=""
                prepend-inner-icon="mdi-file-upload-outline"
                clearable
                hide-details="auto"
                class="mb-3"
                @update:model-value="onFileSelected"
            />

            <div class="text-caption text-medium-emphasis mb-2 text-center">
                — or paste CSV text —
            </div>

            <v-textarea
                v-model="pastedCsv"
                label="Paste CSV"
                placeholder="name,ticker&#10;Apple Inc,AAPL&#10;Snowflake,SNOW"
                variant="outlined"
                density="comfortable"
                rows="6"
                hide-details="auto"
                class="mb-3"
                :disabled="!!csvFile?.length"
                @update:model-value="onPasteChange"
            />

            <v-alert v-if="parseError" type="error" variant="tonal" density="compact" class="mb-3">
                {{ parseError }}
            </v-alert>

            <div class="text-caption text-medium-emphasis mb-1">
                Expected columns: <code>name</code> (required), <code>ticker</code> and
                <code>neid</code> (optional). Header row auto-detected.
            </div>
        </template>

        <!-- Step 2: column mapping confirmation (shown when headers are ambiguous) -->
        <template v-if="step === 'mapping' && headers.length > 0">
            <div class="text-subtitle-2 mb-3">Map CSV columns</div>
            <v-row dense>
                <v-col v-for="(h, idx) in headers" :key="idx" cols="12" sm="6" md="4">
                    <v-select
                        :model-value="columnMapping[idx]"
                        :label="`Column: ${h}`"
                        :items="columnOptions"
                        variant="outlined"
                        density="compact"
                        hide-details
                        @update:model-value="(v: string) => (columnMapping[idx] = v)"
                    />
                </v-col>
            </v-row>
            <v-btn
                color="primary"
                class="mt-4"
                :disabled="!nameColMapped"
                @click="proceedToPreview"
            >
                Preview ({{ parsedRows.length }} rows)
            </v-btn>
            <v-btn variant="text" class="mt-4 ml-2" @click="reset">Reset</v-btn>
        </template>

        <!-- Step 3: resolve + preview -->
        <template v-if="step === 'preview'">
            <div class="d-flex align-center mb-3" style="gap: 8px">
                <span class="text-subtitle-2">Preview</span>
                <v-chip size="x-small" variant="tonal" color="success">
                    {{ resolvedCount }} matched
                </v-chip>
                <v-chip v-if="unresolvedCount > 0" size="x-small" variant="tonal" color="warning">
                    {{ unresolvedCount }} unresolved
                </v-chip>
                <v-spacer />
                <v-btn variant="text" size="small" @click="reset">Start over</v-btn>
            </div>

            <v-progress-linear v-if="resolving" indeterminate color="primary" class="mb-3" />

            <v-table density="compact" class="preview-table rounded border mb-4">
                <thead>
                    <tr>
                        <th class="text-left">Input name</th>
                        <th class="text-left">Resolved name</th>
                        <th class="text-left">Ticker</th>
                        <th class="text-left">Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(row, idx) in previewRows" :key="idx">
                        <td class="text-body-2">{{ row.inputName }}</td>
                        <td class="text-body-2">
                            <template v-if="row.resolved">
                                {{ row.resolvedName }}
                            </template>
                            <span v-else class="text-medium-emphasis text-caption">—</span>
                        </td>
                        <td class="text-body-2 text-caption">{{ row.ticker || '—' }}</td>
                        <td>
                            <v-chip
                                v-if="row.resolving"
                                size="x-small"
                                variant="tonal"
                                color="info"
                            >
                                <v-progress-circular
                                    size="10"
                                    width="2"
                                    indeterminate
                                    class="mr-1"
                                />
                                resolving
                            </v-chip>
                            <v-chip
                                v-else-if="row.resolved"
                                size="x-small"
                                variant="tonal"
                                color="success"
                            >
                                matched
                            </v-chip>
                            <v-chip
                                v-else-if="row.neid"
                                size="x-small"
                                variant="tonal"
                                color="success"
                            >
                                neid
                            </v-chip>
                            <v-chip v-else size="x-small" variant="tonal" color="warning">
                                unresolved
                            </v-chip>
                        </td>
                    </tr>
                </tbody>
            </v-table>

            <v-btn
                color="primary"
                :disabled="resolving || confirmedRows.length === 0"
                @click="emitConfirmed"
            >
                Add {{ confirmedRows.length }} entit{{ confirmedRows.length === 1 ? 'y' : 'ies' }}
            </v-btn>
            <v-btn variant="text" class="ml-2" @click="reset">Cancel</v-btn>
            <div v-if="unresolvedCount > 0" class="text-caption text-medium-emphasis mt-2">
                Unresolved entries will be added by name and resolved during the next scan.
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
    import { ref, computed, watch } from 'vue';
    import type { ResolvedEntityInput } from '~/composables/usePortfolio';

    interface PreviewRow {
        inputName: string;
        resolvedName: string | null;
        neid: string | null;
        ticker: string | null;
        resolved: boolean;
        resolving: boolean;
    }

    const emit = defineEmits<{
        add: [entities: ResolvedEntityInput[]];
    }>();

    // ── state ──────────────────────────────────────────────────────────────
    const csvFile = ref<File[]>([]);
    const pastedCsv = ref('');
    const parseError = ref('');

    const step = ref<'input' | 'mapping' | 'preview'>('input');
    const headers = ref<string[]>([]);
    const columnMapping = ref<Record<number, string>>({});
    const parsedRows = ref<Record<string, string>[]>([]);
    const previewRows = ref<PreviewRow[]>([]);
    const resolving = ref(false);

    const columnOptions = ['name', 'ticker', 'neid', '(ignore)'];

    // ── computed ───────────────────────────────────────────────────────────
    const nameColMapped = computed(() =>
        Object.values(columnMapping.value).some((v) => v === 'name')
    );

    const resolvedCount = computed(
        () => previewRows.value.filter((r) => r.resolved || r.neid).length
    );

    const unresolvedCount = computed(
        () => previewRows.value.filter((r) => !r.resolved && !r.neid).length
    );

    const confirmedRows = computed(() => previewRows.value.filter((r) => !r.resolving));

    // ── CSV parsing ────────────────────────────────────────────────────────

    /** Parse a single RFC-4180 CSV line into fields. */
    function parseCsvLine(line: string): string[] {
        const fields: string[] = [];
        let field = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (line[i + 1] === '"') {
                        field += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += ch;
                }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                fields.push(field.trim());
                field = '';
            } else {
                field += ch;
            }
        }
        fields.push(field.trim());
        return fields;
    }

    function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
        const lines = text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .split('\n')
            .filter((l) => l.trim());
        if (lines.length === 0) return { headers: [], rows: [] };

        // Treat first line as header if it contains non-numeric text
        const first = parseCsvLine(lines[0]);
        const hasHeader = first.some((f) => isNaN(Number(f)) && f.length > 0);
        const headerRow = hasHeader ? first : first.map((_, i) => `Column ${i + 1}`);
        const dataLines = hasHeader ? lines.slice(1) : lines;

        const rows = dataLines
            .map((l) => parseCsvLine(l))
            .filter((fields) => fields.some((f) => f))
            .map((fields) => {
                const obj: Record<string, string> = {};
                headerRow.forEach((h, i) => {
                    obj[h] = fields[i] ?? '';
                });
                return obj;
            });

        return { headers: headerRow, rows };
    }

    function autoMapColumns(hdrs: string[]): Record<number, string> {
        const mapping: Record<number, string> = {};
        hdrs.forEach((h, idx) => {
            const lower = h.toLowerCase();
            if (/name|company|entity|issuer/.test(lower)) mapping[idx] = 'name';
            else if (/ticker|symbol/.test(lower)) mapping[idx] = 'ticker';
            else if (/neid|nindex|entity.?id/.test(lower)) mapping[idx] = 'neid';
            else mapping[idx] = '(ignore)';
        });
        return mapping;
    }

    function processCsv(text: string) {
        parseError.value = '';
        try {
            const { headers: hdrs, rows } = parseCsvText(text);
            if (hdrs.length === 0) {
                parseError.value = 'Could not parse CSV — no data found.';
                return;
            }
            headers.value = hdrs;
            parsedRows.value = rows;
            columnMapping.value = autoMapColumns(hdrs);

            // If all columns are auto-mapped cleanly, skip mapping step
            const nameFound = Object.values(columnMapping.value).some((v) => v === 'name');
            if (nameFound) {
                proceedToPreview();
            } else {
                step.value = 'mapping';
            }
        } catch {
            parseError.value = 'Failed to parse CSV. Check the format and try again.';
        }
    }

    async function onFileSelected(files: File[] | null) {
        if (!files?.length) return;
        const file = files[0];
        const text = await file.text();
        processCsv(text);
    }

    function onPasteChange() {
        if (pastedCsv.value.trim()) {
            processCsv(pastedCsv.value);
        }
    }

    // Debounce paste processing so user can finish typing
    let pasteTimer: ReturnType<typeof setTimeout> | null = null;
    watch(pastedCsv, () => {
        if (pasteTimer) clearTimeout(pasteTimer);
        pasteTimer = setTimeout(() => {
            if (pastedCsv.value.trim()) processCsv(pastedCsv.value);
        }, 600);
    });

    // ── resolution ─────────────────────────────────────────────────────────
    function proceedToPreview() {
        // Build initial preview rows from parsed data
        const nameIdx = Object.entries(columnMapping.value).find(([, v]) => v === 'name')?.[0];
        const tickerIdx = Object.entries(columnMapping.value).find(([, v]) => v === 'ticker')?.[0];
        const neidIdx = Object.entries(columnMapping.value).find(([, v]) => v === 'neid')?.[0];

        const nameHeader = nameIdx != null ? headers.value[Number(nameIdx)] : null;
        const tickerHeader = tickerIdx != null ? headers.value[Number(tickerIdx)] : null;
        const neidHeader = neidIdx != null ? headers.value[Number(neidIdx)] : null;

        previewRows.value = parsedRows.value
            .map((row) => ({
                inputName: (nameHeader ? row[nameHeader] : '') || '',
                resolvedName: null,
                neid: neidHeader ? row[neidHeader] || null : null,
                ticker: tickerHeader ? row[tickerHeader] || null : null,
                resolved: false,
                resolving: false,
            }))
            .filter((r) => r.inputName);

        step.value = 'preview';
        resolveNames();
    }

    async function resolveNames() {
        // Rows that already have a NEID don't need resolution
        const needResolution = previewRows.value.filter((r) => !r.neid && r.inputName);
        if (needResolution.length === 0) return;

        resolving.value = true;
        needResolution.forEach((r) => {
            r.resolving = true;
        });

        try {
            const names = needResolution.map((r) => r.inputName);
            const res = await $fetch<{
                results: {
                    inputName: string;
                    neid: string | null;
                    resolvedName: string | null;
                    score: number | null;
                    resolved: boolean;
                }[];
            }>('/api/entities/resolve', {
                method: 'POST',
                body: { names },
            });

            const byName = new Map(res.results.map((r) => [r.inputName, r]));
            previewRows.value.forEach((row) => {
                if (!row.resolving) return;
                const match = byName.get(row.inputName);
                if (match) {
                    row.neid = match.neid;
                    row.resolvedName = match.resolvedName;
                    row.resolved = match.resolved;
                }
                row.resolving = false;
            });
        } catch {
            needResolution.forEach((r) => {
                r.resolving = false;
            });
        } finally {
            resolving.value = false;
        }
    }

    // ── emit ───────────────────────────────────────────────────────────────
    function emitConfirmed() {
        const entities: ResolvedEntityInput[] = confirmedRows.value.map((r) => ({
            inputName: r.inputName,
            resolvedName: r.resolvedName || r.inputName,
            neid: r.neid || null,
            ticker: r.ticker || undefined,
        }));
        emit('add', entities);
        reset();
    }

    function reset() {
        step.value = 'input';
        csvFile.value = [];
        pastedCsv.value = '';
        parseError.value = '';
        headers.value = [];
        columnMapping.value = {};
        parsedRows.value = [];
        previewRows.value = [];
        resolving.value = false;
    }
</script>

<style scoped>
    .preview-table {
        max-height: 320px;
        overflow-y: auto;
    }
</style>
