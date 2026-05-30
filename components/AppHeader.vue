<template>
    <v-app-bar app density="default" class="app-header">
        <div class="d-flex align-center app-header-title">
            <img :src="logoSrc" alt="Lovelace" class="header-logo" />
            <span class="app-title-text">{{ appName }}</span>
            <!-- build string hidden for demos -->
        </div>

        <v-spacer></v-spacer>

        <!-- Persistent Analyze action -->
        <v-btn
            v-if="showAnalyzeBtn"
            :loading="scanningAll || scanning"
            :prepend-icon="analyzeIcon"
            :disabled="scanningAll || scanning"
            variant="tonal"
            color="primary"
            size="small"
            class="mr-2 analyze-btn"
            @click="onAnalyze"
        >
            {{ analyzeLabel }}
        </v-btn>

        <!-- Theme Picker -->
        <v-menu :close-on-content-click="false" location="bottom end">
            <template v-slot:activator="{ props: menuProps }">
                <v-tooltip text="Theme">
                    <template v-slot:activator="{ props: tooltipProps }">
                        <v-btn
                            icon
                            v-bind="mergeProps(menuProps, tooltipProps)"
                            class="ml-1 header-icon-btn"
                        >
                            <v-icon icon="mdi-palette" class="header-icon"></v-icon>
                        </v-btn>
                    </template>
                </v-tooltip>
            </template>
            <v-card class="theme-menu-card" min-width="280">
                <v-card-text class="pa-3">
                    <ThemePresetPicker :show-description="false" />
                </v-card-text>
            </v-card>
        </v-menu>

        <!-- Settings Gear -->
        <v-tooltip :text="`Settings (${modKey}G)`">
            <template v-slot:activator="{ props: tooltipProps }">
                <v-btn
                    icon
                    v-bind="tooltipProps"
                    data-testid="settings-button"
                    @click="state.showSettingsDialog = true"
                    class="ml-1 header-icon-btn"
                >
                    <v-icon icon="mdi-cog" class="header-icon"></v-icon>
                </v-btn>
            </template>
        </v-tooltip>

        <!-- User Avatar Menu -->
        <v-menu>
            <template v-slot:activator="{ props: menu }">
                <v-tooltip :text="userName">
                    <template v-slot:activator="{ props: tooltip }">
                        <v-btn
                            icon
                            v-bind="mergeProps(menu, tooltip)"
                            data-testid="user-menu-button"
                            class="ml-1 header-icon-btn"
                        >
                            <v-avatar size="32" color="primary">
                                <img
                                    v-if="avatarUrl && !avatarHasError"
                                    :alt="userName"
                                    :src="avatarUrl"
                                    style="width: 100%; height: 100%; object-fit: cover"
                                    crossorigin="anonymous"
                                    referrerpolicy="no-referrer"
                                    @error="handleImageError"
                                    @load="handleImageLoad"
                                />
                                <span v-else class="text-h6 avatar-initials">{{
                                    userInitials
                                }}</span>
                            </v-avatar>
                        </v-btn>
                    </template>
                </v-tooltip>
            </template>
            <v-list>
                <v-list-item data-testid="logout-button" @click="handleLogout">
                    <v-list-item-title>Log Out</v-list-item-title>
                </v-list-item>
            </v-list>
        </v-menu>
    </v-app-bar>
</template>

<script setup lang="ts">
    import { computed, mergeProps, watch } from 'vue';

    import { useBrandLogo } from '~/composables/useBrandLogo';
    import { useLovelaceTheme } from '~/composables/useLovelaceTheme';
    import { useUserState } from '~/composables/useUserState';
    import { useProxiedAvatar } from '~/composables/useProxiedAvatar';
    import { usePortfolio } from '~/composables/usePortfolio';
    import { useUser } from '~/composables/useUser';
    import ThemePresetPicker from '~/components/ThemePresetPicker.vue';
    import { state } from '~/utils/appState';

    const { isDark } = useLovelaceTheme();
    const { logoSrc } = useBrandLogo();
    const { clearUser, userPicture, userName } = useUserState();
    const { appName } = useAppInfo();
    const router = useRouter();
    const route = useRoute();

    const { activeUserId } = useUser();
    const {
        activePortfolio,
        scanning,
        scanningAll,
        scanAllProgress,
        hasAnyScored,
        scanPortfolio,
        scanActiveUserPortfolios,
    } = usePortfolio(activeUserId);

    const { proxiedUrl: avatarUrl } = useProxiedAvatar(userPicture);

    const buildString = ref(useRuntimeConfig().public.versionString);
    const avatarHasError = ref(false);

    const isBucketRoute = computed(() => route.path === '/bucket');

    /** Only show on routes where scanning makes sense. */
    const showAnalyzeBtn = computed(() =>
        ['/', '/bucket', '/agents', '/relationships', '/scoring'].includes(route.path)
    );

    const allAnalyzed = computed(() => hasAnyScored.value && !scanning.value && !scanningAll.value);

    const analyzeLabel = computed(() => {
        if (scanningAll.value) {
            const { doneBuckets, totalBuckets } = scanAllProgress.value;
            return `Analyzing ${doneBuckets}/${totalBuckets}`;
        }
        if (scanning.value) return 'Analyzing…';
        if (isBucketRoute.value) return allAnalyzed.value ? 'Re-analyze bucket' : 'Analyze bucket';
        return allAnalyzed.value ? 'Re-analyze all goals' : 'Analyze all goals';
    });

    const analyzeIcon = computed(() => {
        if (scanning.value || scanningAll.value) return undefined;
        return 'mdi-play-circle-outline';
    });

    function onAnalyze() {
        if (isBucketRoute.value && activePortfolio.value) {
            scanPortfolio(activePortfolio.value.id, { force: true });
        } else {
            scanActiveUserPortfolios({ force: true });
        }
    }

    const handleLogout = () => {
        router.push('/logout');
    };

    const isMacPlatform = computed(() => {
        return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    });

    const modKey = computed(() => (isMacPlatform.value ? '⇧⌘' : 'Alt+Shift+'));

    const userInitials = computed(() => {
        if (!userName.value) return '?';
        const names = userName.value.split(' ');
        if (names.length >= 2) {
            return names[0][0] + names[names.length - 1][0];
        }
        return userName.value.substring(0, 2).toUpperCase();
    });

    const handleImageError = (event: Event) => {
        avatarHasError.value = true;
    };

    const handleImageLoad = () => {
        avatarHasError.value = false;
    };

    watch(avatarUrl, () => {
        avatarHasError.value = false;
    });
</script>

<style scoped>
    .app-header {
        background: linear-gradient(
            135deg,
            var(--dynamic-header-gradient-start),
            var(--dynamic-header-gradient-end)
        ) !important;
        color: var(--dynamic-text-primary) !important;
        border-bottom: 1px solid var(--dynamic-border);
    }

    .header-icon-btn {
        color: var(--dynamic-text-primary) !important;
    }

    .header-icon {
        color: var(--dynamic-text-primary) !important;
    }

    .avatar-initials {
        color: var(--dynamic-text-primary);
    }

    .app-header-title {
        display: flex;
        align-items: center;
    }

    .header-logo {
        height: 1.5rem;
        width: auto;
        margin-left: 16px;
        margin-right: 12px;
    }

    .app-title-text {
        font-family: var(--font-primary);
        font-size: var(--type-display-size);
        font-weight: var(--type-display-weight);
        letter-spacing: var(--type-display-tracking);
        line-height: 1.2;
    }

    .app-version-text {
        font-family: var(--font-mono);
        font-size: var(--type-mono-size);
        font-weight: var(--type-mono-weight);
        opacity: 0.6;
        margin-left: 8px;
        position: relative;
        top: 2px;
    }

    .theme-menu-card {
        background: var(--dynamic-card-background) !important;
        border: 1px solid var(--dynamic-border) !important;
    }
</style>
