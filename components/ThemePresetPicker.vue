<template>
    <div class="theme-picker">
        <button
            v-for="themePreset in availableThemes"
            :key="themePreset.id"
            type="button"
            :class="['theme-option', { active: currentThemeId === themePreset.id }]"
            @click="setTheme(themePreset.id)"
        >
            <span class="swatches" aria-hidden="true">
                <span class="swatch" :style="{ background: themePreset.tokens.background }" />
                <span class="swatch" :style="{ background: themePreset.tokens.surface }" />
                <span class="swatch" :style="{ background: themePreset.tokens.primary }" />
            </span>
            <span class="meta">
                <span class="label">{{ themePreset.label }}</span>
                <span v-if="showDescription" class="description">
                    {{ themePreset.description }}
                </span>
            </span>
            <v-icon
                v-if="currentThemeId === themePreset.id"
                icon="mdi-check"
                size="small"
                class="check"
            />
        </button>
    </div>
</template>

<script setup lang="ts">
    import { useLovelaceTheme } from '~/composables/useLovelaceTheme';

    withDefaults(defineProps<{ showDescription?: boolean }>(), { showDescription: true });

    const { availableThemes, currentThemeId, setTheme } = useLovelaceTheme();
</script>

<style scoped>
    .theme-picker {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .theme-option {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: transparent;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: left;
        width: 100%;
        color: var(--dynamic-text-primary);
    }

    .theme-option:hover {
        background: rgba(var(--dynamic-fg-rgb), 0.06);
    }

    .theme-option.active {
        border-color: rgba(var(--dynamic-primary-rgb), 0.45);
        background: rgba(var(--dynamic-primary-rgb), 0.08);
    }

    .swatches {
        display: flex;
        gap: 3px;
        flex-shrink: 0;
    }

    .swatch {
        width: 20px;
        height: 20px;
        border-radius: 4px;
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.12);
    }

    .meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    .label {
        font-family: var(--font-primary);
        font-size: 0.875rem;
        font-weight: 500;
        line-height: 1.2;
    }

    .description {
        font-size: 0.75rem;
        color: var(--dynamic-text-muted);
        line-height: 1.3;
    }

    .check {
        margin-left: auto;
        color: var(--dynamic-primary);
        flex-shrink: 0;
    }
</style>
