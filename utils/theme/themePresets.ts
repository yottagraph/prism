export type ThemeMode = 'dark' | 'light';

export interface PaletteTokens {
    primary: string;
    /** `R, G, B` triplet for `rgba(var(--dynamic-primary-rgb), 0.12)` tints. */
    primaryRgb: string;
    /**
     * Brand-emphasis text color (active pill labels, "Share view", "Live"
     * chip text). Dark presets pick a light shade; light presets pick a dark
     * shade so the same pill reads on both modes.
     */
    primaryStrong: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    cardBackground: string;
    panelBackground: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    hover: string;
    border: string;
    success: string;
    warning: string;
    error: string;
    headerGradientStart: string;
    headerGradientEnd: string;
    /** Foreground as RGB triplet for `rgba(var(--dynamic-fg-rgb), X)` tints. */
    fgRgb: string;
    fgRgbInverse: string;
    bgRgb: string;
    overlayBg: string;
    overlayBorder: string;
    /** Empty for dark presets; subtle 2-stop drop for light presets. */
    cardShadow: string;
    /** Sidebar background — per-preset so light themes get a light sidebar. */
    sidebarBg: string;
    /** Sidebar foreground as `R, G, B` for `rgba(var(--dynamic-sidebar-fg-rgb), X)`. */
    sidebarFgRgb: string;
    /** Sidebar border color. */
    sidebarBorder: string;
    mapBgStart: string;
    mapBgEnd: string;
    mapCountyStroke: string;
    mapStateStroke: string;
    scoreRamp: [string, string, string];
}

export interface ThemePreset {
    id: string;
    label: string;
    description: string;
    mode: ThemeMode;
    vuetifyTheme: string;
    tokens: PaletteTokens;
}

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

const lovelaceDark: ThemePreset = {
    id: 'lovelace-dark',
    label: 'Lovelace Dark',
    description: 'Default cyber-dark brand theme.',
    mode: 'dark',
    vuetifyTheme: 'lovelaceDark',
    tokens: {
        primary: '#3FEA00',
        primaryRgb: '63, 234, 0',
        primaryStrong: 'hsl(140 90% 70%)',
        secondary: '#FF5C00',
        accent: '#003BFF',
        background: '#0A0A0A',
        surface: '#141414',
        cardBackground: '#1E1E1E',
        panelBackground: '#111111',
        textPrimary: '#FFFFFF',
        textSecondary: '#A0AEC0',
        textMuted: '#757575',
        hover: '#1E1E1E',
        border: '#2A2A2A',
        success: '#3FEA00',
        warning: '#FF9F0A',
        error: '#EF4444',
        headerGradientStart: '#0A0A0A',
        headerGradientEnd: '#141414',
        fgRgb: '255, 255, 255',
        fgRgbInverse: '10, 10, 10',
        bgRgb: '10, 10, 10',
        overlayBg: 'rgba(20, 20, 24, 0.96)',
        overlayBorder: 'rgba(255, 255, 255, 0.1)',
        cardShadow: 'none',
        sidebarBg: '#0A0A0C',
        sidebarFgRgb: '255, 255, 255',
        sidebarBorder: 'rgba(255, 255, 255, 0.05)',
        mapBgStart: '#0A0A0A',
        mapBgEnd: '#111111',
        mapCountyStroke: 'rgba(255, 255, 255, 0.08)',
        mapStateStroke: 'rgba(255, 255, 255, 0.25)',
        scoreRamp: ['#1d8db5', '#3fa45a', '#f0b53c'],
    },
};

const lovelaceLight: ThemePreset = {
    id: 'lovelace-light',
    label: 'Lovelace Light',
    description: 'Light mode for presentations and daytime demos.',
    mode: 'light',
    vuetifyTheme: 'lovelaceLight',
    tokens: {
        primary: '#1F8B00',
        primaryRgb: '31, 139, 0',
        primaryStrong: '#15660A',
        secondary: '#D04E02',
        accent: '#0230D0',
        background: '#EEEEF2',
        surface: '#FFFFFF',
        cardBackground: '#FFFFFF',
        panelBackground: '#F1F2F5',
        textPrimary: '#0A0A0A',
        textSecondary: '#2A2F3A',
        textMuted: '#525866',
        hover: '#E8E9ED',
        border: '#CFD2D8',
        success: '#1F8B00',
        warning: '#C2861F',
        error: '#DC2626',
        headerGradientStart: '#F5F7FA',
        headerGradientEnd: '#EAECEF',
        fgRgb: '10, 10, 10',
        fgRgbInverse: '255, 255, 255',
        bgRgb: '238, 238, 242',
        overlayBg: 'rgba(255, 255, 255, 0.96)',
        overlayBorder: 'rgba(10, 10, 10, 0.1)',
        cardShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08)',
        sidebarBg: '#FFFFFF',
        sidebarFgRgb: '10, 10, 10',
        sidebarBorder: '#CFD2D8',
        mapBgStart: '#EEEEF2',
        mapBgEnd: '#F5F7FA',
        mapCountyStroke: 'rgba(10, 10, 10, 0.08)',
        mapStateStroke: 'rgba(10, 10, 10, 0.25)',
        scoreRamp: ['#0f6f93', '#2f8a4b', '#c2861f'],
    },
};

const paper: ThemePreset = {
    id: 'paper',
    label: 'Paper',
    description: 'Warm-neutral light theme with ink-on-paper feel.',
    mode: 'light',
    vuetifyTheme: 'paper',
    tokens: {
        primary: '#5B6E4A',
        primaryRgb: '91, 110, 74',
        primaryStrong: '#3F5130',
        secondary: '#8B6914',
        accent: '#4A6B8A',
        background: '#F4F1EC',
        surface: '#FDFCFA',
        cardBackground: '#FDFCFA',
        panelBackground: '#EFECE6',
        textPrimary: '#1A1A18',
        textSecondary: '#3D3D38',
        textMuted: '#6B6B63',
        hover: '#EAE7E0',
        border: '#D6D1C9',
        success: '#5B6E4A',
        warning: '#B8860B',
        error: '#C53030',
        headerGradientStart: '#F9F7F4',
        headerGradientEnd: '#F0EDE7',
        fgRgb: '26, 26, 24',
        fgRgbInverse: '253, 252, 250',
        bgRgb: '244, 241, 236',
        overlayBg: 'rgba(253, 252, 250, 0.96)',
        overlayBorder: 'rgba(26, 26, 24, 0.1)',
        cardShadow: '0 1px 2px rgba(26, 26, 24, 0.05), 0 1px 3px rgba(26, 26, 24, 0.07)',
        sidebarBg: '#FDFCFA',
        sidebarFgRgb: '26, 26, 24',
        sidebarBorder: '#D6D1C9',
        mapBgStart: '#F4F1EC',
        mapBgEnd: '#F9F7F4',
        mapCountyStroke: 'rgba(26, 26, 24, 0.08)',
        mapStateStroke: 'rgba(26, 26, 24, 0.2)',
        scoreRamp: ['#4A6B8A', '#5B6E4A', '#B8860B'],
    },
};

const bloomberg: ThemePreset = {
    id: 'bloomberg',
    label: 'Bloomberg',
    description: 'Terminal-dark with high-contrast amber accents.',
    mode: 'dark',
    vuetifyTheme: 'bloomberg',
    tokens: {
        primary: '#FF9F0A',
        primaryRgb: '255, 159, 10',
        primaryStrong: 'hsl(36 100% 72%)',
        secondary: '#FF6B35',
        accent: '#2997FF',
        background: '#0C0C0E',
        surface: '#161618',
        cardBackground: '#1C1C20',
        panelBackground: '#121214',
        textPrimary: '#E8E8EC',
        textSecondary: '#9CA3AF',
        textMuted: '#6B7280',
        hover: '#22222A',
        border: '#2C2C34',
        success: '#34D399',
        warning: '#FF9F0A',
        error: '#EF4444',
        headerGradientStart: '#0C0C0E',
        headerGradientEnd: '#161618',
        fgRgb: '232, 232, 236',
        fgRgbInverse: '12, 12, 14',
        bgRgb: '12, 12, 14',
        overlayBg: 'rgba(22, 22, 26, 0.96)',
        overlayBorder: 'rgba(232, 232, 236, 0.1)',
        cardShadow: 'none',
        sidebarBg: '#0C0C0E',
        sidebarFgRgb: '232, 232, 236',
        sidebarBorder: 'rgba(232, 232, 236, 0.05)',
        mapBgStart: '#0C0C0E',
        mapBgEnd: '#121214',
        mapCountyStroke: 'rgba(232, 232, 236, 0.08)',
        mapStateStroke: 'rgba(232, 232, 236, 0.25)',
        scoreRamp: ['#2997FF', '#34D399', '#FF9F0A'],
    },
};

const slate: ThemePreset = {
    id: 'slate',
    label: 'Slate',
    description: 'Cool-neutral medium-dark with muted blue accents.',
    mode: 'dark',
    vuetifyTheme: 'slate',
    tokens: {
        primary: '#60A5FA',
        primaryRgb: '96, 165, 250',
        primaryStrong: 'hsl(217 92% 78%)',
        secondary: '#A78BFA',
        accent: '#34D399',
        background: '#0F172A',
        surface: '#1E293B',
        cardBackground: '#1E293B',
        panelBackground: '#162033',
        textPrimary: '#F1F5F9',
        textSecondary: '#94A3B8',
        textMuted: '#64748B',
        hover: '#263550',
        border: '#334155',
        success: '#34D399',
        warning: '#FBBF24',
        error: '#F87171',
        headerGradientStart: '#0F172A',
        headerGradientEnd: '#1E293B',
        fgRgb: '241, 245, 249',
        fgRgbInverse: '15, 23, 42',
        bgRgb: '15, 23, 42',
        overlayBg: 'rgba(22, 32, 51, 0.96)',
        overlayBorder: 'rgba(241, 245, 249, 0.1)',
        cardShadow: 'none',
        sidebarBg: '#0F172A',
        sidebarFgRgb: '241, 245, 249',
        sidebarBorder: 'rgba(241, 245, 249, 0.05)',
        mapBgStart: '#0F172A',
        mapBgEnd: '#162033',
        mapCountyStroke: 'rgba(241, 245, 249, 0.08)',
        mapStateStroke: 'rgba(241, 245, 249, 0.25)',
        scoreRamp: ['#60A5FA', '#34D399', '#FBBF24'],
    },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const themePresets: ThemePreset[] = [lovelaceDark, lovelaceLight, paper, bloomberg, slate];

export const DEFAULT_THEME_ID = 'lovelace-dark';

export const themePresetById: Record<string, ThemePreset> = Object.fromEntries(
    themePresets.map((p) => [p.id, p])
);

export function getThemePresetById(themeId: string | null | undefined): ThemePreset {
    return themePresetById[themeId ?? ''] ?? themePresetById[DEFAULT_THEME_ID];
}

export function getPresetPairForToggle(
    currentThemeId: string,
    lastDarkThemeId: string,
    lastLightThemeId: string
): string {
    const current = getThemePresetById(currentThemeId);
    return current.mode === 'dark'
        ? getThemePresetById(lastLightThemeId).id
        : getThemePresetById(lastDarkThemeId).id;
}

export function buildVuetifyThemesFromPresets() {
    return Object.fromEntries(
        themePresets.map((preset) => [
            preset.vuetifyTheme,
            {
                dark: preset.mode === 'dark',
                colors: {
                    background: preset.tokens.background,
                    surface: preset.tokens.surface,
                    'surface-variant': preset.tokens.panelBackground,
                    primary: preset.tokens.primary,
                    secondary: preset.tokens.secondary,
                    warning: preset.tokens.warning,
                    error: preset.tokens.error,
                    info: preset.tokens.accent,
                    success: preset.tokens.success,
                    'on-background': preset.tokens.textPrimary,
                    'on-surface': preset.tokens.textPrimary,
                },
            },
        ])
    );
}
