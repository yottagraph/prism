<template>
    <v-dialog v-model="isOpen" max-width="640" scrollable>
        <v-card>
            <v-card-title class="d-flex align-center ga-2 pt-5 pb-2">
                <v-icon color="primary" size="22">mdi-graph-outline</v-icon>
                <span>Where does Prism's data come from?</span>
            </v-card-title>
            <v-card-subtitle class="pb-3" style="white-space: normal">
                Prism doesn't generate data — it fuses these independent, authoritative sources so
                you can see them all in one place.
            </v-card-subtitle>

            <v-divider />

            <v-card-text class="pa-0">
                <v-list lines="three">
                    <v-list-item
                        v-for="(src, key) in SOURCE_META"
                        :key="key"
                        class="source-legend-row"
                    >
                        <template #prepend>
                            <v-avatar :color="src.color" variant="tonal" size="40" rounded="lg">
                                <v-icon :color="src.color" size="20">{{ src.icon }}</v-icon>
                            </v-avatar>
                        </template>

                        <v-list-item-title class="d-flex align-center ga-2 mb-1">
                            <span class="font-weight-semibold">{{ src.label }}</span>
                            <v-chip size="x-small" :color="src.color" variant="tonal" label>{{
                                src.shortLabel
                            }}</v-chip>
                        </v-list-item-title>

                        <v-list-item-subtitle style="white-space: normal; opacity: 1">
                            <div>{{ src.whatItIs }}</div>
                            <div class="mt-1" style="opacity: 0.75">
                                <span class="font-weight-medium">In Prism:</span>
                                {{ src.whatWeUseItFor }}
                            </div>
                        </v-list-item-subtitle>

                        <template #append>
                            <div
                                class="text-caption text-right source-artifact"
                                style="max-width: 120px; opacity: 0.55"
                            >
                                {{ src.exampleArtifact }}
                            </div>
                        </template>
                    </v-list-item>
                </v-list>
            </v-card-text>

            <v-divider />

            <v-card-actions class="px-4 py-3">
                <div class="text-caption" style="opacity: 0.6">
                    All data is fetched live at scan time through the Elemental API — no local
                    pipelines.
                </div>
                <v-spacer />
                <v-btn variant="text" @click="isOpen = false">Close</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
    import { SOURCE_META } from '~/composables/useDataSources';
    import { useSourcesDialog } from '~/composables/useSourcesDialog';

    const { isOpen } = useSourcesDialog();
</script>

<style scoped>
    .source-legend-row {
        border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    }

    .source-legend-row:last-child {
        border-bottom: none;
    }

    .source-artifact {
        line-height: 1.3;
        white-space: normal;
    }
</style>
