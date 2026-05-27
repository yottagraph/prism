<template>
    <v-app-bar app density="default" class="app-header">
        <div class="d-flex align-center app-header-title">
            <img src="/LL-logo-full-wht.svg" alt="Lovelace" class="header-logo" />
            <span class="app-title-text">{{ appName }}</span>
            <span class="app-version-text">{{ buildString }}</span>
        </div>

        <v-spacer></v-spacer>

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
    import { mergeProps, watch } from 'vue';

    import { useLovelaceTheme } from '~/composables/useLovelaceTheme';
    import { useUserState } from '~/composables/useUserState';
    import { useProxiedAvatar } from '~/composables/useProxiedAvatar';
    import ThemePresetPicker from '~/components/ThemePresetPicker.vue';

    import { state } from '~/utils/appState';

    const { isDark } = useLovelaceTheme();
    const { clearUser, userPicture, userName } = useUserState();
    const { appName } = useAppInfo();
    const router = useRouter();

    const { proxiedUrl: avatarUrl } = useProxiedAvatar(userPicture);

    const buildString = ref(useRuntimeConfig().public.versionString);

    const avatarHasError = ref(false);

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
        console.error('Avatar image failed to load:', {
            originalUrl: userPicture.value,
            proxiedUrl: avatarUrl.value,
            error: event,
            type: event.type,
        });
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
        font-family: var(--font-headline);
        font-weight: 400;
        letter-spacing: 0.05em;
        font-size: 1.25rem;
        line-height: 1.2;
    }

    .app-version-text {
        font-family: var(--font-mono);
        font-weight: 400;
        font-size: 0.7rem;
        opacity: 0.5;
        margin-left: 8px;
        position: relative;
        top: 2px;
    }

    .theme-menu-card {
        background: var(--dynamic-card-background) !important;
        border: 1px solid var(--dynamic-border) !important;
    }
</style>
