<template>
    <svg
        :width="size"
        :height="size"
        :viewBox="`0 0 ${size} ${size}`"
        class="scan-progress-ring"
        :class="{ 'ring--active': value < 100 }"
        aria-hidden="true"
    >
        <!-- Track -->
        <circle
            :cx="size / 2"
            :cy="size / 2"
            :r="radius"
            fill="none"
            :stroke-width="strokeWidth"
            class="ring-track"
        />
        <!-- Fill -->
        <circle
            :cx="size / 2"
            :cy="size / 2"
            :r="radius"
            fill="none"
            :stroke-width="strokeWidth"
            class="ring-fill"
            :style="{
                strokeDasharray: circumference,
                strokeDashoffset: dashOffset,
            }"
        />
    </svg>
</template>

<script setup lang="ts">
    import { computed } from 'vue';

    const props = withDefaults(
        defineProps<{
            /** 0–100 */
            value: number;
            size?: number;
        }>(),
        { value: 0, size: 28 }
    );

    const strokeWidth = computed(() => Math.max(2, props.size * 0.1));
    const radius = computed(() => (props.size - strokeWidth.value) / 2);
    const circumference = computed(() => 2 * Math.PI * radius.value);
    const dashOffset = computed(
        () =>
            circumference.value -
            (Math.min(100, Math.max(0, props.value)) / 100) * circumference.value
    );
</script>

<style scoped>
    .scan-progress-ring {
        /* Start from top (12 o'clock) */
        transform: rotate(-90deg);
        flex-shrink: 0;
    }

    .ring-track {
        stroke: rgba(var(--dynamic-fg-rgb, 128, 128, 128), 0.12);
    }

    .ring-fill {
        stroke: rgb(var(--dynamic-primary-rgb, 63, 234, 0));
        transition: stroke-dashoffset 0.7s cubic-bezier(0.22, 1, 0.36, 1);
    }

    /* Soft glow pulse while filling */
    .ring--active .ring-fill {
        filter: drop-shadow(0 0 3px rgba(var(--dynamic-primary-rgb, 63, 234, 0), 0.5));
        animation: ring-pulse 1.8s ease-in-out infinite;
    }

    @keyframes ring-pulse {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0.6;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .ring-fill {
            transition: none;
        }
        .ring--active .ring-fill {
            animation: none;
        }
    }
</style>
