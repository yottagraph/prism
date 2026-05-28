<template>
    <span class="animated-number" :class="{ 'animated-number--changing': animating }">
        {{ display }}
    </span>
</template>

<script setup lang="ts">
    import { onUnmounted, ref, watch } from 'vue';

    const props = withDefaults(
        defineProps<{
            value: number;
            duration?: number;
            format?: (n: number) => string;
        }>(),
        { duration: 650 }
    );

    function format(n: number): string {
        return props.format ? props.format(n) : String(Math.round(n));
    }

    const current = ref(props.value);
    const display = ref(format(props.value));
    const animating = ref(false);
    let raf: number | null = null;

    // easeOutCubic — fast start, gentle settle, reads as a satisfying "fill".
    function ease(t: number): number {
        return 1 - Math.pow(1 - t, 3);
    }

    function animateTo(target: number) {
        if (raf !== null) cancelAnimationFrame(raf);
        const from = current.value;
        const delta = target - from;
        if (Math.abs(delta) < 0.001) {
            current.value = target;
            display.value = format(target);
            return;
        }
        const start = performance.now();
        animating.value = true;
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / props.duration);
            current.value = from + delta * ease(t);
            display.value = format(current.value);
            if (t < 1) {
                raf = requestAnimationFrame(step);
            } else {
                current.value = target;
                display.value = format(target);
                animating.value = false;
                raf = null;
            }
        };
        raf = requestAnimationFrame(step);
    }

    watch(
        () => props.value,
        (v) => animateTo(v)
    );

    onUnmounted(() => {
        if (raf !== null) cancelAnimationFrame(raf);
    });
</script>

<style scoped>
    .animated-number {
        font-variant-numeric: tabular-nums;
        transition: color 0.2s ease;
    }

    .animated-number--changing {
        color: rgb(var(--dynamic-primary-rgb, 63, 234, 0));
    }
</style>
