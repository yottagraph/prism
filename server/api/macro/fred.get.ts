import { callMcpTool, extractMcpStructuredContent } from '~/server/utils/scoring/mcpGateway';

interface MacroSignal {
    label: string;
    value: number;
    displayValue: string;
    unit: string;
    kind: 'fundamental';
    trend: 'up' | 'down' | 'flat';
    note: string;
    macroScore?: number;
    history?: number[];
    historyStart?: string | null;
    historyEnd?: string | null;
}

interface FredSeriesConfig {
    seriesId: string;
    label: string;
    unit: string;
    invertTrend?: boolean;
    macroDirection: 'rising_good' | 'rising_bad' | 'neutral';
}

const CURATED_SERIES: FredSeriesConfig[] = [
    { seriesId: 'GDP', label: 'GDP (nominal)', unit: 'B$', macroDirection: 'rising_good' },
    {
        seriesId: 'UNRATE',
        label: 'Unemployment Rate',
        unit: '%',
        invertTrend: true,
        macroDirection: 'rising_bad',
    },
    { seriesId: 'CPIAUCSL', label: 'CPI (All Urban)', unit: 'index', macroDirection: 'rising_bad' },
    { seriesId: 'DFF', label: 'Fed Funds Rate', unit: '%', macroDirection: 'neutral' },
    { seriesId: 'T10Y2Y', label: 'Yield Spread 10Y-2Y', unit: '%', macroDirection: 'rising_good' },
    { seriesId: 'GS10', label: '10Y Treasury', unit: '%', macroDirection: 'neutral' },
];

const HISTORY_LIMIT = 20;

let cachedSignals: { signals: MacroSignal[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchSeriesObservations(
    event: any,
    seriesId: string
): Promise<{
    latest: number;
    previous: number | null;
    date: string | null;
    history: number[];
    historyStart: string | null;
    historyEnd: string | null;
} | null> {
    try {
        const result = await callMcpTool(
            'elemental',
            'elemental_get_entity',
            {
                entity_id: { id_type: 'fred_series_id', id: seriesId },
                properties: ['observation'],
                history: { limit: HISTORY_LIMIT },
            },
            event
        );
        const data = extractMcpStructuredContent<{
            entity?: {
                historical_properties?: Record<
                    string,
                    Array<{ value?: unknown; recorded_at?: string }>
                >;
                properties?: Record<string, { value?: unknown }>;
            };
        }>(result);

        const hist = data?.entity?.historical_properties?.observation;
        if (hist && hist.length > 0) {
            const sorted = [...hist].sort((a, b) =>
                (b.recorded_at ?? '').localeCompare(a.recorded_at ?? '')
            );
            const latestVal = Number(sorted[0].value);
            if (!Number.isFinite(latestVal)) return null;
            const previousVal = sorted.length > 1 ? Number(sorted[1].value) : null;
            // Build history in chronological order (oldest → newest) for sparklines,
            // keeping each value paired with its date so we can label the time axis.
            const chronological = [...sorted]
                .reverse()
                .map((o) => ({ value: Number(o.value), date: o.recorded_at ?? null }))
                .filter((o) => Number.isFinite(o.value));
            const history = chronological.map((o) => o.value);
            return {
                latest: latestVal,
                previous: Number.isFinite(previousVal) ? previousVal : null,
                date: sorted[0].recorded_at ?? null,
                history,
                historyStart: chronological.length > 0 ? chronological[0].date : null,
                historyEnd:
                    chronological.length > 0 ? chronological[chronological.length - 1].date : null,
            };
        }

        const obs = data?.entity?.properties?.observation;
        if (obs?.value != null) {
            const val = Number(obs.value);
            return Number.isFinite(val)
                ? {
                      latest: val,
                      previous: null,
                      date: null,
                      history: [val],
                      historyStart: null,
                      historyEnd: null,
                  }
                : null;
        }
        return null;
    } catch {
        return null;
    }
}

function computeTrend(
    latest: number,
    previous: number | null,
    invert: boolean
): 'up' | 'down' | 'flat' {
    if (previous == null) return 'flat';
    const delta = latest - previous;
    const pctChange = previous !== 0 ? Math.abs(delta / previous) : Math.abs(delta);
    if (pctChange < 0.001) return 'flat';
    const raw: 'up' | 'down' = delta > 0 ? 'up' : 'down';
    return invert ? (raw === 'up' ? 'down' : 'up') : raw;
}

function formatDisplayValue(value: number, unit: string): string {
    if (unit === '%') {
        const rounded = Math.round(value * 100) / 100;
        const sign = rounded >= 0 ? '' : '';
        return `${sign}${rounded.toFixed(2)}%`;
    }
    if (unit === 'B$') {
        if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}T`;
        return `$${value.toFixed(0)}B`;
    }
    // index (CPI, etc.)
    return (Math.round(value * 10) / 10).toFixed(1);
}

function formatNote(
    config: FredSeriesConfig,
    latest: number,
    previous: number | null,
    date: string | null
): string {
    const parts: string[] = [];
    if (date) parts.push(date.slice(0, 10));
    if (previous != null) {
        const delta = latest - previous;
        const sign = delta >= 0 ? '+' : '';
        parts.push(`${sign}${delta.toFixed(2)} ${config.unit}`);
    }
    return parts.join(' · ') || config.unit;
}

function computeFredMacroScore(
    latest: number,
    previous: number | null,
    direction: FredSeriesConfig['macroDirection']
): number {
    if (direction === 'neutral' || previous == null) return 0;
    const delta = latest - previous;
    const pctChange = previous !== 0 ? Math.abs(delta / previous) : Math.abs(delta);
    if (pctChange < 0.001) return 0;
    const dirSign = direction === 'rising_good' ? 1 : -1;
    return Math.sign(delta) * dirSign;
}

export default defineEventHandler(async (event) => {
    if (cachedSignals && Date.now() < cachedSignals.expiresAt) {
        return cachedSignals.signals;
    }

    const results = await Promise.allSettled(
        CURATED_SERIES.map(async (config) => {
            const obs = await fetchSeriesObservations(event, config.seriesId);
            if (!obs) return null;
            return {
                label: config.label,
                value: obs.latest,
                displayValue: formatDisplayValue(obs.latest, config.unit),
                unit: config.unit,
                kind: 'fundamental' as const,
                trend: computeTrend(obs.latest, obs.previous, config.invertTrend ?? false),
                note: formatNote(config, obs.latest, obs.previous, obs.date),
                macroScore: computeFredMacroScore(obs.latest, obs.previous, config.macroDirection),
                history: obs.history,
                historyStart: obs.historyStart,
                historyEnd: obs.historyEnd,
            } satisfies MacroSignal;
        })
    );

    const signals = results
        .map((r) => (r.status === 'fulfilled' ? r.value : null))
        .filter((s): s is NonNullable<typeof s> => s != null);

    if (signals.length > 0) {
        cachedSignals = { signals, expiresAt: Date.now() + CACHE_TTL_MS };
    }
    return signals;
});
