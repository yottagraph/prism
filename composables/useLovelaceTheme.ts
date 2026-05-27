import { computed, ref, watch } from 'vue';
import { useTheme } from 'vuetify';

import {
    DEFAULT_THEME_ID,
    type PaletteTokens,
    type ThemePreset,
    getPresetPairForToggle,
    getThemePresetById,
    themePresets,
} from '~/utils/theme/themePresets';

const THEME_ID_STORAGE_KEY = 'lovelace.themeId';
const LAST_DARK_STORAGE_KEY = 'lovelace.lastDarkThemeId';
const LAST_LIGHT_STORAGE_KEY = 'lovelace.lastLightThemeId';

// Module-scoped refs so every consumer sees the same active theme.
const currentThemeId = ref<string>(DEFAULT_THEME_ID);
const lastDarkThemeId = ref<string>('lovelace-dark');
const lastLightThemeId = ref<string>('lovelace-light');
let prefsInitialized = false;

function findDefaultThemeId(): string {
    if (typeof window === 'undefined') return DEFAULT_THEME_ID;
    const explicit = window.localStorage?.getItem(THEME_ID_STORAGE_KEY);
    if (explicit) return getThemePresetById(explicit).id;
    const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'lovelace-light' : DEFAULT_THEME_ID;
}

function applyCssVariables(preset: ThemePreset) {
    if (typeof window === 'undefined') return;
    const c = preset.tokens;
    const root = document.documentElement;

    root.style.setProperty('--dynamic-primary', c.primary);
    root.style.setProperty('--dynamic-primary-rgb', c.primaryRgb);
    root.style.setProperty('--dynamic-primary-strong', c.primaryStrong);
    root.style.setProperty('--dynamic-secondary', c.secondary);
    root.style.setProperty('--dynamic-accent', c.accent);
    root.style.setProperty('--dynamic-background', c.background);
    root.style.setProperty('--dynamic-surface', c.surface);
    root.style.setProperty('--dynamic-card-background', c.cardBackground);
    root.style.setProperty('--dynamic-panel-background', c.panelBackground);
    root.style.setProperty('--dynamic-text-primary', c.textPrimary);
    root.style.setProperty('--dynamic-text-secondary', c.textSecondary);
    root.style.setProperty('--dynamic-text-muted', c.textMuted);
    root.style.setProperty('--dynamic-hover', c.hover);
    root.style.setProperty('--dynamic-border', c.border);
    root.style.setProperty('--dynamic-success', c.success);
    root.style.setProperty('--dynamic-warning', c.warning);
    root.style.setProperty('--dynamic-error', c.error);
    root.style.setProperty('--dynamic-header-gradient-start', c.headerGradientStart);
    root.style.setProperty('--dynamic-header-gradient-end', c.headerGradientEnd);
    root.style.setProperty('--dynamic-fg-rgb', c.fgRgb);
    root.style.setProperty('--dynamic-fg-rgb-inverse', c.fgRgbInverse);
    root.style.setProperty('--dynamic-bg-rgb', c.bgRgb);
    root.style.setProperty('--dynamic-overlay-bg', c.overlayBg);
    root.style.setProperty('--dynamic-overlay-border', c.overlayBorder);
    root.style.setProperty('--dynamic-card-shadow', c.cardShadow);
    root.style.setProperty('--dynamic-sidebar-bg', c.sidebarBg);
    root.style.setProperty('--dynamic-sidebar-fg-rgb', c.sidebarFgRgb);
    root.style.setProperty('--dynamic-sidebar-border', c.sidebarBorder);
    root.style.setProperty('--dynamic-map-bg-start', c.mapBgStart);
    root.style.setProperty('--dynamic-map-bg-end', c.mapBgEnd);
    root.style.setProperty('--dynamic-map-county-stroke', c.mapCountyStroke);
    root.style.setProperty('--dynamic-map-state-stroke', c.mapStateStroke);
    root.style.setProperty('--dynamic-score-ramp-low', c.scoreRamp[0]);
    root.style.setProperty('--dynamic-score-ramp-mid', c.scoreRamp[1]);
    root.style.setProperty('--dynamic-score-ramp-high', c.scoreRamp[2]);

    root.dataset.themeId = preset.id;
    root.dataset.themeMode = preset.mode;
}

// Eagerly apply the stored/default theme to reduce flash-of-wrong-theme.
if (typeof window !== 'undefined') {
    const boot = getThemePresetById(findDefaultThemeId());
    currentThemeId.value = boot.id;
    applyCssVariables(boot);

    const storedLastDark = window.localStorage?.getItem(LAST_DARK_STORAGE_KEY);
    const storedLastLight = window.localStorage?.getItem(LAST_LIGHT_STORAGE_KEY);
    if (storedLastDark) lastDarkThemeId.value = storedLastDark;
    if (storedLastLight) lastLightThemeId.value = storedLastLight;
}

export const useLovelaceTheme = () => {
    const vuetifyTheme = useTheme();

    function applyThemeById(themeId: string) {
        const preset = getThemePresetById(themeId);
        currentThemeId.value = preset.id;

        if (preset.mode === 'dark') lastDarkThemeId.value = preset.id;
        else lastLightThemeId.value = preset.id;

        applyCssVariables(preset);
        vuetifyTheme.change(preset.vuetifyTheme);

        if (typeof window !== 'undefined') {
            window.localStorage?.setItem(THEME_ID_STORAGE_KEY, preset.id);
            window.localStorage?.setItem(LAST_DARK_STORAGE_KEY, lastDarkThemeId.value);
            window.localStorage?.setItem(LAST_LIGHT_STORAGE_KEY, lastLightThemeId.value);
        }
    }

    function toggleTheme() {
        applyThemeById(
            getPresetPairForToggle(
                currentThemeId.value,
                lastDarkThemeId.value,
                lastLightThemeId.value
            )
        );
    }

    // Wire up persistent prefs (Firestore-backed) once per session.
    if (!prefsInitialized) {
        prefsInitialized = true;
        try {
            const prefs = useAppFeaturePrefs('appearance', {
                activeThemeId: currentThemeId.value,
                lastDarkThemeId: lastDarkThemeId.value,
                lastLightThemeId: lastLightThemeId.value,
            });

            // Once hydrated from Firestore, adopt the stored theme if present.
            watch(
                () => prefs.activeThemeId,
                (persisted) => {
                    if (persisted && persisted !== currentThemeId.value) {
                        applyThemeById(persisted);
                    }
                },
                { immediate: true }
            );

            // Keep prefs in sync when theme changes locally.
            watch(currentThemeId, (id) => {
                prefs.activeThemeId = id;
            });
            watch(lastDarkThemeId, (id) => {
                prefs.lastDarkThemeId = id;
            });
            watch(lastLightThemeId, (id) => {
                prefs.lastLightThemeId = id;
            });
        } catch {
            // Prefs may not be available (e.g. login page, SSR). Silently fall back to localStorage.
        }
    }

    // Apply on first call (handles Vuetify theme name sync after hydration).
    const initialPreset = getThemePresetById(currentThemeId.value);
    vuetifyTheme.change(initialPreset.vuetifyTheme);

    return {
        availableThemes: computed(() => themePresets),
        currentPreset: computed(() => getThemePresetById(currentThemeId.value)),
        currentThemeId: computed(() => currentThemeId.value),
        currentThemeColors: computed(() => getThemePresetById(currentThemeId.value).tokens),
        isDark: computed(() => getThemePresetById(currentThemeId.value).mode === 'dark'),
        toggleTheme,
        setTheme: applyThemeById,
    };
};
