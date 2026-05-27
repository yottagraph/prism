<template>
    <v-card class="pa-3 indicator-card">
        <div class="text-subtitle-2 mb-2">Moving Averages</div>
        <v-table density="compact">
            <thead>
                <tr>
                    <th>Period</th>
                    <th class="text-right">Value</th>
                    <th class="text-right">vs Price</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in rows" :key="row.label">
                    <td>{{ row.label }}</td>
                    <td class="text-right font-mono">{{ row.value }}</td>
                    <td class="text-right font-mono" :class="row.diffClass">{{ row.diff }}</td>
                </tr>
            </tbody>
        </v-table>
    </v-card>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    const props = defineProps<{
        latestClose: number | null;
        movingAverages: {
            sma20: number | null;
            sma50: number | null;
            sma200: number | null;
            ema12: number | null;
            ema26: number | null;
        };
    }>();

    function formatPrice(value: number | null) {
        return value == null || !Number.isFinite(value) ? '—' : `$${value.toFixed(2)}`;
    }

    function diff(ma: number | null) {
        if (props.latestClose == null || ma == null || ma === 0)
            return { diff: '—', diffClass: '' };
        const pct = ((props.latestClose - ma) / ma) * 100;
        return {
            diff: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
            diffClass: pct >= 0 ? 'text-success' : 'text-error',
        };
    }

    const rows = computed(() => {
        const entries: Array<{ label: string; v: number | null }> = [
            { label: 'SMA 20', v: props.movingAverages.sma20 },
            { label: 'SMA 50', v: props.movingAverages.sma50 },
            { label: 'SMA 200', v: props.movingAverages.sma200 },
            { label: 'EMA 12', v: props.movingAverages.ema12 },
            { label: 'EMA 26', v: props.movingAverages.ema26 },
        ];
        return entries.map((entry) => {
            const d = diff(entry.v);
            return {
                label: entry.label,
                value: formatPrice(entry.v),
                diff: d.diff,
                diffClass: d.diffClass,
            };
        });
    });
</script>

<style scoped>
    .indicator-card {
        background: rgba(var(--dynamic-fg-rgb), 0.02);
        border: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
    }
    .font-mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
