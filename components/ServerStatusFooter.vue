<template>
    <v-footer v-if="configuredServers.length > 0" app class="server-status-footer pa-0">
        <!-- Collapsed affordance: single dot + text, click to expand -->
        <div
            v-if="!expanded"
            class="d-flex align-center px-3"
            style="height: 28px; cursor: pointer; gap: 6px"
            @click="expanded = true"
        >
            <v-icon :color="overallColor" size="14">mdi-circle</v-icon>
            <span class="text-caption text-medium-emphasis" style="font-size: 11px">
                System status
            </span>
        </div>

        <!-- Expanded detail row -->
        <v-container v-else fluid class="pa-0 px-3 d-flex align-center" style="height: 36px">
            <div class="d-flex align-center flex-grow-1">
                <span class="text-caption mr-3" style="font-size: 11px">Server Status:</span>

                <div
                    v-for="(server, index) in configuredServers"
                    :key="server.type"
                    class="d-flex align-center"
                >
                    <v-icon
                        :icon="getStatusIcon(server.status)"
                        :color="getStatusColor(server.status)"
                        size="small"
                        :class="{ rotating: server.status === 'checking' }"
                    />
                    <span class="text-caption mx-1" style="font-size: 11px"
                        >{{ server.name }}:</span
                    >
                    <span
                        class="text-caption font-weight-medium mr-3"
                        :class="getStatusTextClass(server.status)"
                        style="font-size: 11px"
                    >
                        {{ getStatusText(server.status) }}
                    </span>

                    <span
                        v-if="server.status === 'available' && server.address"
                        class="text-caption text-medium-emphasis mr-3"
                        style="font-size: 11px"
                    >
                        ({{ formatAddress(server.address) }})
                    </span>

                    <v-divider v-if="index < configuredServers.length - 1" vertical class="mx-2" />
                </div>
            </div>
            <v-btn
                size="x-small"
                variant="text"
                icon="mdi-close"
                density="compact"
                class="ml-2"
                style="opacity: 0.5"
                @click="expanded = false"
            />
        </v-container>
    </v-footer>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue';
    import { useServerStatus } from '~/composables/useServerStatus';

    const { getConfiguredServers } = useServerStatus();
    const configuredServers = computed(() => getConfiguredServers());
    const expanded = ref(false);

    const overallColor = computed(() => {
        const statuses = configuredServers.value.map((s) => s.status);
        if (statuses.some((s) => s === 'unavailable')) return 'error';
        if (statuses.some((s) => s === 'checking')) return 'warning';
        if (statuses.every((s) => s === 'available')) return 'success';
        return 'grey';
    });

    function getStatusColor(status: string) {
        switch (status) {
            case 'available':
                return 'success';
            case 'unavailable':
                return 'error';
            case 'checking':
                return 'warning';
            default:
                return 'grey';
        }
    }

    function getStatusIcon(status: string) {
        switch (status) {
            case 'available':
                return 'mdi-check-circle';
            case 'unavailable':
                return 'mdi-alert-circle';
            case 'checking':
                return 'mdi-loading';
            default:
                return 'mdi-help-circle';
        }
    }

    function getStatusText(status: string) {
        switch (status) {
            case 'available':
                return 'Connected';
            case 'unavailable':
                return 'Disconnected';
            case 'checking':
                return 'Checking...';
            default:
                return 'Unknown';
        }
    }

    function getStatusTextClass(status: string) {
        switch (status) {
            case 'available':
                return 'text-success';
            case 'unavailable':
                return 'text-error';
            case 'checking':
                return 'text-warning';
            default:
                return 'text-grey';
        }
    }

    function formatAddress(address: string) {
        // Remove https:// and trailing slashes for cleaner display
        return address.replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
</script>

<style scoped>
    .server-status-footer {
        border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
        min-height: 28px !important;
        height: auto !important;
    }

    .rotating {
        animation: rotate 1s linear infinite;
    }

    @keyframes rotate {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
</style>
