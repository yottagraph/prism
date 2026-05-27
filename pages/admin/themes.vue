<template>
    <div class="pa-6">
        <div class="d-flex align-center mb-4">
            <v-icon size="large" color="primary" class="mr-3">mdi-palette</v-icon>
            <div>
                <div class="text-h5">Theme Preview</div>
                <div class="text-caption" style="color: var(--dynamic-text-muted)">
                    Side-by-side preview of every preset in the registry.
                </div>
            </div>
        </div>

        <div class="tiles">
            <div
                v-for="preset in themePresets"
                :key="preset.id"
                class="tile"
                :style="tileStyle(preset)"
            >
                <div class="tile-header" :style="headerStyle(preset)">
                    <span class="tile-label">{{ preset.label }}</span>
                    <v-chip
                        size="x-small"
                        variant="flat"
                        :color="preset.mode === 'dark' ? '#333' : '#ccc'"
                        :style="{ color: preset.tokens.textPrimary }"
                    >
                        {{ preset.mode }}
                    </v-chip>
                </div>

                <div class="tile-body">
                    <div class="tile-card" :style="cardStyle(preset)">
                        <div class="swatch-row">
                            <span
                                v-for="(color, label) in primarySwatches(preset)"
                                :key="label"
                                class="swatch"
                                :style="{ background: color }"
                                :title="String(label)"
                            />
                        </div>
                        <div :style="{ color: preset.tokens.textPrimary }" class="text-body-2 mt-2">
                            Primary text sample
                        </div>
                        <div :style="{ color: preset.tokens.textSecondary }" class="text-caption">
                            Secondary text sample
                        </div>
                        <div :style="{ color: preset.tokens.textMuted }" class="text-caption">
                            Muted text sample
                        </div>
                    </div>

                    <div class="tile-sidebar" :style="sidebarStyle(preset)">
                        <div class="sidebar-label">Sidebar</div>
                        <div
                            class="sidebar-link active"
                            :style="{
                                background: `rgba(${preset.tokens.primaryRgb}, 0.12)`,
                                color: preset.tokens.primary,
                            }"
                        >
                            Active
                        </div>
                        <div
                            class="sidebar-link"
                            :style="{ color: `rgba(${preset.tokens.sidebarFgRgb}, 0.7)` }"
                        >
                            Inactive
                        </div>
                    </div>
                </div>

                <div class="tile-footer">
                    <span class="text-caption" :style="{ color: preset.tokens.textMuted }">
                        {{ preset.description }}
                    </span>
                    <v-btn
                        size="x-small"
                        variant="text"
                        :style="{ color: preset.tokens.primary }"
                        @click="setTheme(preset.id)"
                    >
                        Apply
                    </v-btn>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import type { ThemePreset } from '~/utils/theme/themePresets';
    import { themePresets } from '~/utils/theme/themePresets';
    import { useLovelaceTheme } from '~/composables/useLovelaceTheme';

    const { setTheme } = useLovelaceTheme();

    function tileStyle(p: ThemePreset) {
        return {
            background: p.tokens.background,
            borderColor: p.tokens.border,
        };
    }

    function headerStyle(p: ThemePreset) {
        return {
            background: `linear-gradient(135deg, ${p.tokens.headerGradientStart}, ${p.tokens.headerGradientEnd})`,
            color: p.tokens.textPrimary,
            borderBottom: `1px solid ${p.tokens.border}`,
        };
    }

    function cardStyle(p: ThemePreset) {
        return {
            background: p.tokens.cardBackground,
            border: `1px solid ${p.tokens.border}`,
            boxShadow: p.tokens.cardShadow,
        };
    }

    function sidebarStyle(p: ThemePreset) {
        return {
            background: p.tokens.sidebarBg,
            borderLeft: `1px solid ${p.tokens.sidebarBorder}`,
        };
    }

    function primarySwatches(p: ThemePreset) {
        return {
            bg: p.tokens.background,
            surface: p.tokens.surface,
            card: p.tokens.cardBackground,
            primary: p.tokens.primary,
            secondary: p.tokens.secondary,
            accent: p.tokens.accent,
        };
    }
</script>

<style scoped>
    .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
        gap: 20px;
    }

    .tile {
        border: 1px solid;
        border-radius: 12px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .tile-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
    }

    .tile-label {
        font-weight: 600;
        font-size: 0.95rem;
    }

    .tile-body {
        display: flex;
        flex: 1;
        min-height: 140px;
    }

    .tile-card {
        flex: 1;
        padding: 12px;
        margin: 12px;
        border-radius: 8px;
    }

    .tile-sidebar {
        width: 100px;
        padding: 10px 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .sidebar-label {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        opacity: 0.5;
        margin-bottom: 4px;
    }

    .sidebar-link {
        font-size: 0.8rem;
        padding: 4px 8px;
        border-radius: 6px;
    }

    .swatch-row {
        display: flex;
        gap: 4px;
    }

    .swatch {
        width: 24px;
        height: 24px;
        border-radius: 4px;
        border: 1px solid rgba(128, 128, 128, 0.2);
    }

    .tile-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
    }
</style>
