type Trend = 'bullish' | 'bearish' | 'neutral' | null;

interface AnalyticsInput {
    rsi14: number | null;
    trend: Trend;
    macd: { macd: number; signal: number; histogram: number } | null;
    annualisedVol20d: number | null;
    volumeRatio20d: number | null;
    fiftyTwoWeek: { high: number; low: number; daysSinceHigh: number; daysSinceLow: number } | null;
}

interface FundamentalsInput {
    marketCap?: number;
    peRatio?: number;
    profitMargin?: number;
    debtToEquity?: number;
}

function formatPct(value: number, digits = 1): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

function formatMoneyCompact(value: number): string {
    if (!Number.isFinite(value)) return 'N/A';
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toFixed(0)}`;
}

export function buildStockNarrative(
    ticker: string | null,
    analytics: AnalyticsInput,
    fundamentals: FundamentalsInput
): string[] {
    const lines: string[] = [];
    const symbol = ticker || 'This stock';

    const momentumParts: string[] = [];
    if (analytics.trend) momentumParts.push(`${analytics.trend} trend`);
    if (analytics.rsi14 != null) momentumParts.push(`RSI ${analytics.rsi14.toFixed(1)}`);
    if (analytics.macd) {
        momentumParts.push(
            analytics.macd.macd >= analytics.macd.signal ? 'MACD above signal' : 'MACD below signal'
        );
    }
    if (momentumParts.length) lines.push(`${symbol} shows ${momentumParts.join(', ')}.`);

    const riskParts: string[] = [];
    if (analytics.annualisedVol20d != null) {
        riskParts.push(`20-day annualized volatility is ${analytics.annualisedVol20d.toFixed(1)}%`);
    }
    if (analytics.volumeRatio20d != null) {
        riskParts.push(`volume is ${analytics.volumeRatio20d.toFixed(2)}x its 20-day average`);
    }
    if (analytics.fiftyTwoWeek) {
        const { high, low, daysSinceHigh, daysSinceLow } = analytics.fiftyTwoWeek;
        riskParts.push(
            `52-week range is $${low.toFixed(2)} to $${high.toFixed(2)} (${daysSinceHigh}d since high, ${daysSinceLow}d since low)`
        );
    }
    if (riskParts.length) lines.push(riskParts.join('. ') + '.');

    const valuationParts: string[] = [];
    if (fundamentals.marketCap != null)
        valuationParts.push(`market cap ${formatMoneyCompact(fundamentals.marketCap)}`);
    if (fundamentals.peRatio != null) valuationParts.push(`P/E ${fundamentals.peRatio.toFixed(2)}`);
    if (fundamentals.profitMargin != null)
        valuationParts.push(`profit margin ${formatPct(fundamentals.profitMargin * 100, 2)}`);
    if (fundamentals.debtToEquity != null)
        valuationParts.push(`debt/equity ${fundamentals.debtToEquity.toFixed(2)}x`);
    if (valuationParts.length) lines.push(`Fundamentals snapshot: ${valuationParts.join(', ')}.`);

    return lines;
}
