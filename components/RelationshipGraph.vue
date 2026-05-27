<template>
    <v-card class="graph-card fill-height">
        <div class="d-flex align-center pa-3 graph-toolbar">
            <span class="text-subtitle-2">{{ nodes.length }} nodes · {{ edges.length }} edges</span>
            <v-spacer />
            <v-chip-group v-model="activeFilter" multiple selected-class="text-primary">
                <v-chip
                    v-for="k in kinds"
                    :key="k.value"
                    :value="k.value"
                    size="x-small"
                    variant="outlined"
                    :prepend-icon="legendIcon(k.value)"
                >
                    {{ k.label }}
                </v-chip>
            </v-chip-group>
        </div>
        <svg
            ref="svgEl"
            class="graph-svg"
            :viewBox="`0 0 ${size.w} ${size.h}`"
            preserveAspectRatio="xMidYMid meet"
        >
            <line
                v-for="(e, i) in visibleEdges"
                :key="`e${i}`"
                :x1="positionFor(e.source).x"
                :y1="positionFor(e.source).y"
                :x2="positionFor(e.target).x"
                :y2="positionFor(e.target).y"
                class="graph-edge"
                stroke-width="1"
            />
            <g
                v-for="n in visibleNodes"
                :key="n.id"
                :transform="`translate(${positionFor(n.id).x}, ${positionFor(n.id).y})`"
                @click="emit('selectNode', n)"
                class="node-group"
            >
                <circle
                    :r="nodeRadius(n.kind)"
                    :fill="nodeColor(n.kind)"
                    :stroke="nodeStroke(n.kind)"
                    stroke-width="1.5"
                />
                <text
                    :y="nodeRadius(n.kind) + 12"
                    text-anchor="middle"
                    class="node-label"
                    :class="
                        n.kind === 'portfolio' ? 'node-label--primary' : 'node-label--secondary'
                    "
                >
                    {{ n.label }}
                </text>
            </g>
        </svg>
    </v-card>
</template>

<script setup lang="ts">
    import { computed, onMounted, ref, watch } from 'vue';

    import type { GraphEdge, GraphNode } from '~/composables/useRelationships';

    const props = defineProps<{
        nodes: GraphNode[];
        edges: GraphEdge[];
    }>();
    const emit = defineEmits<{
        selectNode: [node: GraphNode];
    }>();

    const kinds = [
        { value: 'portfolio', label: 'Portfolio' },
        { value: 'company', label: 'Companies' },
        { value: 'person', label: 'People' },
        { value: 'instrument', label: 'Instruments' },
        { value: 'location', label: 'Locations' },
    ];
    const activeFilter = ref<string[]>(kinds.map((k) => k.value));
    const svgEl = ref<SVGSVGElement | null>(null);
    const size = ref({ w: 900, h: 600 });

    const positions = ref<Record<string, { x: number; y: number }>>({});

    const visibleNodes = computed(() =>
        props.nodes.filter((n) => activeFilter.value.includes(n.kind))
    );
    const visibleEdges = computed(() => {
        const ids = new Set(visibleNodes.value.map((n) => n.id));
        return props.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    });

    function nodeRadius(kind: GraphNode['kind']) {
        return kind === 'portfolio' ? 9 : 5;
    }
    function nodeColor(kind: GraphNode['kind']) {
        switch (kind) {
            case 'portfolio':
                return '#3fea00';
            case 'company':
                return '#003bff';
            case 'person':
                return '#22c55e';
            case 'instrument':
                return '#ff5c00';
            case 'location':
                return '#ef4444';
            default:
                return '#888';
        }
    }
    function nodeStroke(kind: GraphNode['kind']) {
        return kind === 'portfolio' ? 'var(--dynamic-primary)' : 'rgba(var(--dynamic-fg-rgb),0.25)';
    }
    function legendIcon(kind: string) {
        switch (kind) {
            case 'portfolio':
                return 'mdi-briefcase-variant';
            case 'company':
                return 'mdi-domain';
            case 'person':
                return 'mdi-account';
            case 'instrument':
                return 'mdi-bank';
            case 'location':
                return 'mdi-map-marker';
            default:
                return 'mdi-circle-outline';
        }
    }

    function positionFor(id: string) {
        return positions.value[id] ?? { x: size.value.w / 2, y: size.value.h / 2 };
    }

    function layout() {
        // Simple layered force-directed approximation: portfolio nodes in
        // concentric inner ring, related types in outer ring grouped by kind.
        const cx = size.value.w / 2;
        const cy = size.value.h / 2;
        const innerR = Math.min(size.value.w, size.value.h) * 0.18;
        const outerR = Math.min(size.value.w, size.value.h) * 0.42;

        const portfolio = props.nodes.filter((n) => n.kind === 'portfolio');
        const others = props.nodes.filter((n) => n.kind !== 'portfolio');

        const out: Record<string, { x: number; y: number }> = {};
        portfolio.forEach((n, i) => {
            const t = (i / Math.max(1, portfolio.length)) * Math.PI * 2;
            out[n.id] = {
                x: cx + Math.cos(t) * innerR,
                y: cy + Math.sin(t) * innerR,
            };
        });

        // Group others by kind to keep clusters visually coherent.
        const grouped = new Map<string, GraphNode[]>();
        others.forEach((n) => {
            const arr = grouped.get(n.kind) ?? [];
            arr.push(n);
            grouped.set(n.kind, arr);
        });
        const kindOrder = ['company', 'person', 'instrument', 'location'];
        const totalOuter = others.length;
        let cursor = 0;
        kindOrder.forEach((k) => {
            const arr = grouped.get(k) ?? [];
            arr.forEach((n) => {
                const t = (cursor / Math.max(1, totalOuter)) * Math.PI * 2;
                const jitter = ((cursor % 3) - 1) * 12;
                out[n.id] = {
                    x: cx + Math.cos(t) * (outerR + jitter),
                    y: cy + Math.sin(t) * (outerR + jitter),
                };
                cursor++;
            });
        });

        positions.value = out;
    }

    onMounted(() => {
        if (svgEl.value) {
            const r = svgEl.value.getBoundingClientRect();
            size.value = { w: Math.max(500, r.width), h: Math.max(400, r.height) };
        }
        layout();
    });

    watch(() => props.nodes, layout, { deep: true });
</script>

<style scoped>
    .graph-card {
        display: flex;
        flex-direction: column;
        min-height: 500px;
    }

    .graph-toolbar {
        border-bottom: 1px solid rgba(var(--dynamic-fg-rgb), 0.05);
    }

    .graph-svg {
        flex: 1 1 auto;
        width: 100%;
        background: radial-gradient(
            circle at center,
            rgba(var(--dynamic-primary-rgb), 0.05),
            transparent 70%
        );
    }

    .node-group {
        cursor: pointer;
        transition: opacity 0.15s ease;
    }

    .node-group:hover {
        opacity: 0.85;
    }

    .graph-edge {
        stroke: rgba(var(--dynamic-fg-rgb), 0.12);
    }

    .node-label {
        font-size: 11px;
        font-family: var(--font-mono, ui-monospace, monospace);
        pointer-events: none;
    }

    .node-label--primary {
        fill: var(--dynamic-text-primary);
    }

    .node-label--secondary {
        fill: var(--dynamic-text-secondary);
    }
</style>
