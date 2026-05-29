/**
 * Portfolio Summary state: history, config, and feedback persistence.
 *
 * Summaries are stored via useAppFeaturePrefs keyed by portfolio ID.
 * Each portfolio keeps up to MAX_HISTORY past summaries.
 */
import { computed, ref } from 'vue';
import { useAppFeaturePrefs } from './useAppFeaturePrefs';

const MAX_HISTORY = 10;

export interface SummaryHistoryItem {
    id: string;
    portfolioId: string;
    summary: string;
    entity_count: number;
    generated_at: string;
    feedback: 'positive' | 'negative' | null;
    config?: {
        style?: string;
        focus?: string;
        tone?: string;
        model?: string;
    };
    usage?: {
        total_tokens: number;
        cost_usd: number;
        model: string;
        latency_ms: number;
    } | null;
}

export interface SummaryPrefsShape {
    byPortfolio: Record<string, SummaryHistoryItem[]>;
}

const prefs = useAppFeaturePrefs<SummaryPrefsShape>('portfolio-summaries', {
    byPortfolio: {},
});

export function usePortfolioSummary(portfolioId: string) {
    const history = computed<SummaryHistoryItem[]>(() => prefs.byPortfolio[portfolioId] ?? []);

    function saveToHistory(
        item: Omit<SummaryHistoryItem, 'id' | 'portfolioId'>
    ): SummaryHistoryItem {
        const record: SummaryHistoryItem = {
            ...item,
            id: crypto.randomUUID(),
            portfolioId,
        };
        const existing = [...(prefs.byPortfolio[portfolioId] ?? [])];
        existing.unshift(record);
        if (existing.length > MAX_HISTORY) existing.length = MAX_HISTORY;
        prefs.byPortfolio = { ...prefs.byPortfolio, [portfolioId]: existing };
        return record;
    }

    function setFeedback(id: string, feedback: 'positive' | 'negative') {
        const list = [...(prefs.byPortfolio[portfolioId] ?? [])];
        const idx = list.findIndex((h) => h.id === id);
        if (idx === -1) return;
        list[idx] = { ...list[idx], feedback };
        prefs.byPortfolio = { ...prefs.byPortfolio, [portfolioId]: list };
    }

    function clearHistory() {
        prefs.byPortfolio = { ...prefs.byPortfolio, [portfolioId]: [] };
    }

    return {
        history,
        saveToHistory,
        setFeedback,
        clearHistory,
    };
}
