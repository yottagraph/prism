<template>
    <v-card variant="outlined" class="mb-4">
        <v-card-title class="text-subtitle-1 d-flex align-center ga-2">
            Material events Settings
            <SourceBadge source="SEC" :show-icon="true" :clickable="true" />
        </v-card-title>
        <v-card-subtitle>
            Controls how 8-K and other SEC events contribute to the Event Pressure lens score.
        </v-card-subtitle>
        <v-card-text>
            <v-row>
                <v-col cols="12" md="6">
                    <div class="text-subtitle-2 mb-3">Per-type Severity</div>
                    <v-select
                        v-for="field in typeWeightFields"
                        :key="field.key"
                        :model-value="
                            events.typeWeights[field.key as keyof typeof events.typeWeights]
                        "
                        :items="severityOptions"
                        density="comfortable"
                        variant="outlined"
                        :label="field.label"
                        :hint="field.hint"
                        persistent-hint
                        class="mb-2"
                        @update:model-value="updateTypeWeight(field.key, $event)"
                    />
                    <v-divider class="my-3" />
                    <v-text-field
                        :model-value="events.defaultWeight"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        label="Default fallback weight"
                        hint="Weight for events not matching any keyword"
                        persistent-hint
                        step="1"
                        min="0"
                        max="50"
                        class="mb-2"
                        @update:model-value="updateField('defaultWeight', $event)"
                    />
                    <v-text-field
                        :model-value="events.baseOffset"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        label="Base offset (starting score)"
                        hint="Added to total before clamping (0–100)"
                        persistent-hint
                        step="1"
                        min="0"
                        max="50"
                        @update:model-value="updateField('baseOffset', $event)"
                    />
                </v-col>
                <v-col cols="12" md="6">
                    <div class="text-subtitle-2 mb-3">Recency Decay</div>
                    <v-row dense>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="events.recency.daysFresh"
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="Fresh window (days)"
                                step="1"
                                min="1"
                                class="mb-2"
                                @update:model-value="updateRecency('daysFresh', $event)"
                            />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="events.recency.multFresh"
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="Fresh multiplier"
                                step="0.05"
                                min="0"
                                max="2"
                                class="mb-2"
                                @update:model-value="updateRecency('multFresh', $event)"
                            />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="events.recency.daysRecent"
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="Recent window (days)"
                                step="1"
                                min="1"
                                class="mb-2"
                                @update:model-value="updateRecency('daysRecent', $event)"
                            />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="events.recency.multRecent"
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="Recent multiplier"
                                step="0.05"
                                min="0"
                                max="2"
                                class="mb-2"
                                @update:model-value="updateRecency('multRecent', $event)"
                            />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="events.recency.daysModerate"
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="Moderate window (days)"
                                step="1"
                                min="1"
                                class="mb-2"
                                @update:model-value="updateRecency('daysModerate', $event)"
                            />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="events.recency.multModerate"
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="Moderate multiplier"
                                step="0.05"
                                min="0"
                                max="2"
                                class="mb-2"
                                @update:model-value="updateRecency('multModerate', $event)"
                            />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="events.recency.multStale"
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="Stale multiplier"
                                hint="Events older than moderate window"
                                persistent-hint
                                step="0.05"
                                min="0"
                                max="1"
                                class="mb-2"
                                @update:model-value="updateRecency('multStale', $event)"
                            />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="events.recency.multNoDate"
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="No-date multiplier"
                                hint="Events without a parseable date"
                                persistent-hint
                                step="0.05"
                                min="0"
                                max="1"
                                class="mb-2"
                                @update:model-value="updateRecency('multNoDate', $event)"
                            />
                        </v-col>
                    </v-row>
                    <v-alert type="info" variant="tonal" density="compact" class="mb-4">
                        An event {{ previewDays }} days old contributes {{ previewMultiplier }}×
                        weight.
                    </v-alert>

                    <div class="text-subtitle-2 mb-3">Clustering Bonus</div>
                    <v-text-field
                        :model-value="events.cluster.windowDays"
                        type="number"
                        density="comfortable"
                        variant="outlined"
                        label="Cluster window (days)"
                        hint="Time window for counting recent events"
                        persistent-hint
                        step="1"
                        min="1"
                        class="mb-2"
                        @update:model-value="updateCluster('windowDays', $event)"
                    />
                    <v-row dense>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="events.cluster.countMedium"
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="Medium count"
                                step="1"
                                min="1"
                                class="mb-2"
                                @update:model-value="updateCluster('countMedium', $event)"
                            />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="events.cluster.bonusMedium"
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="Medium bonus"
                                step="1"
                                min="0"
                                class="mb-2"
                                @update:model-value="updateCluster('bonusMedium', $event)"
                            />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="events.cluster.countHigh"
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="High count"
                                step="1"
                                min="1"
                                class="mb-2"
                                @update:model-value="updateCluster('countHigh', $event)"
                            />
                        </v-col>
                        <v-col cols="6">
                            <v-text-field
                                :model-value="events.cluster.bonusHigh"
                                type="number"
                                density="comfortable"
                                variant="outlined"
                                label="High bonus"
                                step="1"
                                min="0"
                                class="mb-2"
                                @update:model-value="updateCluster('bonusHigh', $event)"
                            />
                        </v-col>
                    </v-row>
                </v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';
    import {
        type EventPressureSettings,
        type EventSeverity,
        EVENT_SEVERITY_WEIGHTS,
    } from '~/composables/useFusedScoring';

    const props = defineProps<{ events: EventPressureSettings }>();
    const emit = defineEmits<{ 'update:events': [value: EventPressureSettings] }>();

    const severityOptions = [
        {
            title: `Critical (weight: ${EVENT_SEVERITY_WEIGHTS.critical})`,
            value: 'critical' as EventSeverity,
        },
        {
            title: `Major (weight: ${EVENT_SEVERITY_WEIGHTS.major})`,
            value: 'major' as EventSeverity,
        },
        {
            title: `Minor (weight: ${EVENT_SEVERITY_WEIGHTS.minor})`,
            value: 'minor' as EventSeverity,
        },
        {
            title: `Trivial (weight: ${EVENT_SEVERITY_WEIGHTS.trivial})`,
            value: 'trivial' as EventSeverity,
        },
    ];

    const typeWeightFields = [
        { key: 'bankruptcy', label: 'Bankruptcy', hint: 'Matches BANKRUPTCY keyword' },
        { key: 'delisting', label: 'Delisting', hint: 'Matches DELIST keyword' },
        { key: 'default', label: 'Default / debt', hint: 'Matches DEFAULT keyword' },
        { key: 'auditor', label: 'Auditor', hint: 'Matches AUDITOR keyword' },
        { key: 'restructuring', label: 'Restructuring', hint: 'Matches RESTRUCTUR keyword' },
        { key: 'officer', label: 'Officer', hint: 'Matches OFFICER keyword' },
        { key: 'director', label: 'Director', hint: 'Matches DIRECTOR keyword' },
        { key: 'impairment', label: 'Impairment', hint: 'Matches IMPAIR keyword' },
    ];

    const previewDays = 45;
    const previewMultiplier = computed(() => {
        const r = props.events.recency;
        if (previewDays <= r.daysFresh) return r.multFresh.toFixed(2);
        if (previewDays <= r.daysRecent) return r.multRecent.toFixed(2);
        if (previewDays <= r.daysModerate) return r.multModerate.toFixed(2);
        return r.multStale.toFixed(2);
    });

    function updateField(key: 'baseOffset' | 'defaultWeight', raw: unknown) {
        emit('update:events', { ...props.events, [key]: Number(raw) || 0 });
    }

    function updateTypeWeight(key: string, raw: unknown) {
        emit('update:events', {
            ...props.events,
            typeWeights: { ...props.events.typeWeights, [key]: raw as EventSeverity },
        });
    }

    function updateRecency(key: string, raw: unknown) {
        emit('update:events', {
            ...props.events,
            recency: { ...props.events.recency, [key]: Number(raw) || 0 },
        });
    }

    function updateCluster(key: string, raw: unknown) {
        emit('update:events', {
            ...props.events,
            cluster: { ...props.events.cluster, [key]: Number(raw) || 0 },
        });
    }
</script>
