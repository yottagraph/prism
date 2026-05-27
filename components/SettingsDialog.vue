<template>
    <v-card class="settings-dialog">
        <v-card-title class="d-flex align-center">
            <span>Settings</span>
            <v-spacer></v-spacer>
            <v-btn icon variant="text" @click="state.showSettingsDialog = false">
                <v-icon>mdi-close</v-icon>
            </v-btn>
        </v-card-title>

        <v-tabs v-model="activeTab" color="primary" density="comfortable" align-tabs="start">
            <v-tab value="general">
                <v-icon start size="small">mdi-cog-outline</v-icon>
                General
            </v-tab>
            <v-tab value="logs">
                <v-icon start size="small">mdi-pulse</v-icon>
                Elemental Logs
            </v-tab>
        </v-tabs>

        <v-divider />

        <v-card-text class="settings-body">
            <v-window v-model="activeTab">
                <v-window-item value="general">
                    <v-container>
                        <v-row>
                            <v-col cols="12">
                                <h3 class="text-h6 mb-2">Server Configuration</h3>
                                <div class="mt-3">
                                    <div class="text-body-2 mb-1">Current Query Server:</div>
                                    <code class="text-caption">{{
                                        currentQueryServer || 'Not configured'
                                    }}</code>
                                </div>
                                <div class="text-caption text-medium-emphasis mt-3">
                                    Use <code>/configure_query_server</code> in Cursor to change the
                                    Query Server address, or update it in the Broadchurch Portal.
                                </div>
                            </v-col>
                            <v-col cols="12">
                                <h3 class="text-h6 mb-2">Diagnostics</h3>
                                <v-switch
                                    v-model="debugPrefs.scanDiagnosticsLogs"
                                    color="primary"
                                    inset
                                    label="Enable scan diagnostics logging"
                                />
                                <div class="text-caption text-medium-emphasis">
                                    When enabled, scan emits detailed API-call diagnostics to the
                                    browser console and scan SSE payload.
                                </div>
                            </v-col>
                        </v-row>
                    </v-container>
                </v-window-item>

                <v-window-item value="logs">
                    <ElementalLogsTab />
                </v-window-item>
            </v-window>
        </v-card-text>

        <v-divider />

        <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn variant="text" @click="state.showSettingsDialog = false">Close</v-btn>
        </v-card-actions>
    </v-card>
</template>

<script setup lang="ts">
    import { ref } from 'vue';
    import ElementalLogsTab from '~/components/settings/ElementalLogsTab.vue';
    import { state } from '~/utils/appState';

    const config = useRuntimeConfig();
    const currentQueryServer = computed(() => config.public.queryServerAddress as string);
    const debugPrefs = useAppFeaturePrefs('debug-settings', {
        scanDiagnosticsLogs: false,
    });

    const activeTab = ref<'general' | 'logs'>('general');
</script>

<style scoped>
    .settings-dialog {
        min-height: 60vh;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
    }

    .settings-body {
        flex: 1;
        overflow-y: auto;
    }

    code {
        padding: 2px 4px;
        background-color: rgba(0, 0, 0, 0.05);
        border-radius: 3px;
        font-family: monospace;
    }
</style>
