<template>
    <v-app class="theme-brand">
        <template v-if="showAppFramework">
            <SidebarNav />
            <AppHeader />

            <v-main class="fill-height">
                <ServerStatus />
                <PrefsPersistenceBanner />
                <NuxtPage />
            </v-main>

            <!-- Global Dialogs -->
            <v-dialog v-model="state.showSettingsDialog" max-width="1200">
                <SettingsDialog />
            </v-dialog>

            <!-- Sources Legend Dialog (global, opened from any surface) -->
            <SourcesLegendDialog />

            <!-- Global Notifications -->
            <NotificationContainer />

            <!-- Server Status Footer -->
            <ServerStatusFooter />
        </template>
        <template v-else>
            <NuxtPage />
        </template>
    </v-app>
</template>

<script setup lang="ts">
    import { state } from './utils/appState';

    const route = useRoute();
    const { userName } = useUserState();

    const noFrameworkRoutes = ['/login', '/a0callback', '/logout', '/pending'];

    const showAppFramework = computed(() => {
        if (noFrameworkRoutes.includes(route.path)) {
            return false;
        }
        if (!userName.value) {
            return false;
        }
        return true;
    });
</script>
