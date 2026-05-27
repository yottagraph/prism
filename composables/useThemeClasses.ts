import { computed } from 'vue';
import { useLovelaceTheme } from './useLovelaceTheme';

/**
 * Composable that provides theme-aware CSS classes and utilities.
 * Reads from the active preset via useLovelaceTheme.
 */
export const useThemeClasses = () => {
    const { currentThemeColors, isDark } = useLovelaceTheme();

    const themeClass = computed(() => 'theme-brand');

    const cardClasses = computed(() => ['theme-card', 'theme-brand']);

    const cardHeaderClasses = computed(() => ['card-header-gradient', 'theme-brand']);

    const metricCardClasses = computed(() => ['theme-metric-card', 'theme-brand']);

    const textClasses = {
        primary: 'theme-text-primary',
        secondary: 'theme-text-secondary',
        muted: 'theme-text-muted',
    };

    const bgClasses = {
        surface: 'theme-bg-surface',
        card: 'theme-bg-card',
        panel: 'theme-bg-panel',
    };

    const dataTableClasses = computed(() => ['theme-data-table', 'theme-brand']);

    const listClasses = computed(() => ['theme-list', 'theme-brand']);

    const getInlineThemeStyles = () => {
        const c = currentThemeColors.value;
        return {
            '--theme-primary': c.primary,
            '--theme-accent': c.accent,
            '--theme-background': c.background,
            '--theme-surface': c.surface,
            '--theme-card-background': c.cardBackground,
            '--theme-text': c.textPrimary,
            '--theme-text-secondary': c.textSecondary,
            '--theme-border': c.border,
            '--theme-header-gradient-start': c.headerGradientStart,
            '--theme-header-gradient-end': c.headerGradientEnd,
        };
    };

    return {
        themeClass,
        cardClasses,
        cardHeaderClasses,
        metricCardClasses,
        dataTableClasses,
        listClasses,
        textClasses,
        bgClasses,
        getInlineThemeStyles,
        themeColors: currentThemeColors,
        isDark,
    };
};
