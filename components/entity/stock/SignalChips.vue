<template>
    <div class="d-flex flex-wrap ga-2">
        <v-chip size="small" variant="tonal" :color="trendColor">
            <v-icon start size="small">{{ trendIcon }}</v-icon>
            {{ trendLabel }}
        </v-chip>
        <v-chip v-if="analytics.goldenCross" size="small" color="success" variant="tonal">
            <v-icon start size="small">mdi-star</v-icon>
            Golden Cross
        </v-chip>
        <v-chip v-if="analytics.deathCross" size="small" color="error" variant="tonal">
            <v-icon start size="small">mdi-skull</v-icon>
            Death Cross
        </v-chip>
        <v-chip
            v-if="analytics.rsi14 != null && analytics.rsi14 < 30"
            size="small"
            color="info"
            variant="tonal"
        >
            RSI Oversold
        </v-chip>
        <v-chip
            v-if="analytics.rsi14 != null && analytics.rsi14 > 70"
            size="small"
            color="warning"
            variant="tonal"
        >
            RSI Overbought
        </v-chip>
        <v-chip
            v-if="analytics.annualisedVol20d != null && analytics.annualisedVol20d > 40"
            size="small"
            color="warning"
            variant="tonal"
        >
            High Volatility
        </v-chip>
        <v-chip
            v-if="analytics.volumeRatio20d != null && analytics.volumeRatio20d > 2"
            size="small"
            color="warning"
            variant="tonal"
        >
            Unusual Volume
        </v-chip>
    </div>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    const props = defineProps<{
        analytics: {
            trend: 'bullish' | 'bearish' | 'neutral' | null;
            goldenCross: boolean;
            deathCross: boolean;
            rsi14: number | null;
            annualisedVol20d: number | null;
            volumeRatio20d: number | null;
        };
    }>();

    const trendLabel = computed(() =>
        props.analytics.trend
            ? `${props.analytics.trend[0].toUpperCase()}${props.analytics.trend.slice(1)} trend`
            : 'Trend unavailable'
    );
    const trendIcon = computed(() => {
        if (props.analytics.trend === 'bullish') return 'mdi-trending-up';
        if (props.analytics.trend === 'bearish') return 'mdi-trending-down';
        return 'mdi-minus';
    });
    const trendColor = computed(() => {
        if (props.analytics.trend === 'bullish') return 'success';
        if (props.analytics.trend === 'bearish') return 'error';
        return 'grey';
    });
</script>
