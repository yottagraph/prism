export interface OhlcvPoint {
    date: string;
    close: number;
    open?: number;
    high?: number;
    low?: number;
    volume?: number;
}

export interface MacdLatest {
    macd: number;
    signal: number;
    histogram: number;
}

export interface BollingerLatest {
    upper: number;
    middle: number;
    lower: number;
    percentB: number;
}

export interface FiftyTwoWeekRange {
    high: number;
    low: number;
    daysSinceHigh: number;
    daysSinceLow: number;
}

export type TrendSignal = 'bullish' | 'bearish' | 'neutral';

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function lastN<T>(arr: T[], n: number): T[] {
    if (n <= 0) return [];
    if (arr.length <= n) return arr.slice();
    return arr.slice(arr.length - n);
}

function mean(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const m = mean(values);
    const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

export function sma(closes: number[], period: number): number | null {
    const points = closes.filter(isFiniteNumber);
    if (points.length < period || period <= 0) return null;
    return mean(lastN(points, period));
}

export function ema(closes: number[], period: number): number | null {
    const points = closes.filter(isFiniteNumber);
    if (points.length < period || period <= 0) return null;
    const k = 2 / (period + 1);
    let prev = mean(points.slice(0, period));
    for (let i = period; i < points.length; i++) {
        prev = points[i] * k + prev * (1 - k);
    }
    return prev;
}

export function rsi(closes: number[], period = 14): number | null {
    const points = closes.filter(isFiniteNumber);
    if (points.length <= period) return null;

    let gain = 0;
    let loss = 0;
    for (let i = 1; i <= period; i++) {
        const delta = points[i] - points[i - 1];
        if (delta >= 0) gain += delta;
        else loss += Math.abs(delta);
    }
    let avgGain = gain / period;
    let avgLoss = loss / period;

    for (let i = period + 1; i < points.length; i++) {
        const delta = points[i] - points[i - 1];
        const nextGain = delta > 0 ? delta : 0;
        const nextLoss = delta < 0 ? Math.abs(delta) : 0;
        avgGain = (avgGain * (period - 1) + nextGain) / period;
        avgLoss = (avgLoss * (period - 1) + nextLoss) / period;
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

function emaSeries(closes: number[], period: number): Array<number | null> {
    const out: Array<number | null> = new Array(closes.length).fill(null);
    if (period <= 0 || closes.length < period) return out;
    const k = 2 / (period + 1);
    let prev = mean(closes.slice(0, period));
    out[period - 1] = prev;
    for (let i = period; i < closes.length; i++) {
        prev = closes[i] * k + prev * (1 - k);
        out[i] = prev;
    }
    return out;
}

export function macd(closes: number[]): MacdLatest | null {
    const points = closes.filter(isFiniteNumber);
    if (points.length < 35) return null;
    const fast = emaSeries(points, 12);
    const slow = emaSeries(points, 26);
    const macdSeries: Array<number | null> = points.map((_, i) =>
        fast[i] != null && slow[i] != null ? (fast[i] as number) - (slow[i] as number) : null
    );

    const macdValues = macdSeries.filter(isFiniteNumber);
    if (macdValues.length < 9) return null;
    const signalSeries = emaSeries(macdValues, 9);
    const signal = signalSeries[signalSeries.length - 1];
    const macdValue = macdValues[macdValues.length - 1];
    if (!isFiniteNumber(signal) || !isFiniteNumber(macdValue)) return null;
    return {
        macd: macdValue,
        signal,
        histogram: macdValue - signal,
    };
}

export function bollinger(closes: number[], period = 20, k = 2): BollingerLatest | null {
    const points = closes.filter(isFiniteNumber);
    if (points.length < period) return null;
    const window = lastN(points, period);
    const middle = mean(window);
    const sigma = stdDev(window);
    const upper = middle + k * sigma;
    const lower = middle - k * sigma;
    const last = points[points.length - 1];
    const band = upper - lower;
    const percentB = band > 0 ? (last - lower) / band : 0.5;
    return {
        upper,
        middle,
        lower,
        percentB: Math.max(0, Math.min(1, percentB)),
    };
}

export function atr(rows: OhlcvPoint[], period = 14): number | null {
    if (rows.length < period + 1) return null;
    const tr: number[] = [];
    for (let i = 1; i < rows.length; i++) {
        const curr = rows[i];
        const prevClose = rows[i - 1].close;
        const high = isFiniteNumber(curr.high) ? curr.high : curr.close;
        const low = isFiniteNumber(curr.low) ? curr.low : curr.close;
        tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }
    if (tr.length < period) return null;
    return mean(lastN(tr, period));
}

export function roc(closes: number[], period = 10): number | null {
    const points = closes.filter(isFiniteNumber);
    if (points.length <= period) return null;
    const now = points[points.length - 1];
    const then = points[points.length - 1 - period];
    if (!then) return null;
    return (now - then) / then;
}

export function annualisedVol(closes: number[], period = 20): number | null {
    const points = closes.filter(isFiniteNumber);
    if (points.length < period + 1) return null;
    const returns: number[] = [];
    const window = lastN(points, period + 1);
    for (let i = 1; i < window.length; i++) {
        const prev = window[i - 1];
        if (!prev) continue;
        returns.push((window[i] - prev) / prev);
    }
    if (returns.length < 2) return null;
    return stdDev(returns) * Math.sqrt(252) * 100;
}

export function volumeRatio(rows: OhlcvPoint[], period = 20): number | null {
    const withVolume = rows.filter((row) => isFiniteNumber(row.volume) && row.volume! >= 0);
    if (withVolume.length < period + 1) return null;
    const latest = withVolume[withVolume.length - 1].volume as number;
    const priorWindow = withVolume.slice(Math.max(0, withVolume.length - 1 - period), -1);
    const avg = mean(priorWindow.map((row) => row.volume as number));
    if (!avg) return null;
    return latest / avg;
}

export function goldenDeathCross(closes: number[]): { goldenCross: boolean; deathCross: boolean } {
    const points = closes.filter(isFiniteNumber);
    if (points.length < 202) return { goldenCross: false, deathCross: false };

    const sma50Now = sma(points, 50);
    const sma200Now = sma(points, 200);
    const prevPoints = points.slice(0, -1);
    const sma50Prev = sma(prevPoints, 50);
    const sma200Prev = sma(prevPoints, 200);

    if (
        !isFiniteNumber(sma50Now) ||
        !isFiniteNumber(sma200Now) ||
        !isFiniteNumber(sma50Prev) ||
        !isFiniteNumber(sma200Prev)
    ) {
        return { goldenCross: false, deathCross: false };
    }

    return {
        goldenCross: sma50Prev <= sma200Prev && sma50Now > sma200Now,
        deathCross: sma50Prev >= sma200Prev && sma50Now < sma200Now,
    };
}

export function fiftyTwoWeekHighLow(
    rows: OhlcvPoint[],
    latestDate?: string | null
): FiftyTwoWeekRange | null {
    if (!rows.length) return null;
    const sorted = rows.slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const anchor = latestDate ? Date.parse(latestDate) : Date.parse(sorted[sorted.length - 1].date);
    if (!Number.isFinite(anchor)) return null;
    const cutoff = anchor - 365 * 86400000;
    const window = sorted.filter((row) => {
        const ts = Date.parse(row.date);
        return Number.isFinite(ts) && ts >= cutoff && ts <= anchor;
    });
    if (!window.length) return null;

    const highRow = window.reduce((best, row) => (row.close > best.close ? row : best), window[0]);
    const lowRow = window.reduce((best, row) => (row.close < best.close ? row : best), window[0]);

    const highTs = Date.parse(highRow.date);
    const lowTs = Date.parse(lowRow.date);
    return {
        high: highRow.close,
        low: lowRow.close,
        daysSinceHigh: Math.max(0, Math.floor((anchor - highTs) / 86400000)),
        daysSinceLow: Math.max(0, Math.floor((anchor - lowTs) / 86400000)),
    };
}

export function trendSignal(params: {
    latestClose: number | null;
    sma50: number | null;
    sma200: number | null;
    rsi14: number | null;
    macd: MacdLatest | null;
}): TrendSignal | null {
    const { latestClose, sma50, sma200, rsi14, macd } = params;
    if (
        !isFiniteNumber(latestClose) ||
        !isFiniteNumber(sma50) ||
        !isFiniteNumber(sma200) ||
        !isFiniteNumber(rsi14) ||
        !macd
    ) {
        return null;
    }
    const bullishScore =
        (latestClose > sma50 ? 1 : 0) +
        (sma50 > sma200 ? 1 : 0) +
        (macd.macd > macd.signal ? 1 : 0) +
        (rsi14 >= 45 && rsi14 <= 75 ? 1 : 0);
    const bearishScore =
        (latestClose < sma50 ? 1 : 0) +
        (sma50 < sma200 ? 1 : 0) +
        (macd.macd < macd.signal ? 1 : 0) +
        (rsi14 <= 55 && rsi14 >= 25 ? 1 : 0);

    if (bullishScore >= 3 && bullishScore > bearishScore) return 'bullish';
    if (bearishScore >= 3 && bearishScore > bullishScore) return 'bearish';
    return 'neutral';
}
