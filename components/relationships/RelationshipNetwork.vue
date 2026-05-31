<template>
    <v-card class="network-card fill-height d-flex flex-column">
        <div class="d-flex align-center pa-3 network-toolbar flex-wrap" style="gap: 8px">
            <v-btn-toggle v-model="graphMode" mandatory density="compact" color="primary">
                <v-btn value="force" size="small">
                    <v-icon size="small" class="mr-1">mdi-graph-outline</v-icon>
                    Force
                </v-btn>
                <v-btn value="geographic" size="small">
                    <v-icon size="small" class="mr-1">mdi-map-outline</v-icon>
                    Geographic
                </v-btn>
            </v-btn-toggle>

            <v-divider vertical class="mx-1" style="height: 24px" />

            <v-chip-group v-model="activeKinds" multiple selected-class="text-primary">
                <v-chip
                    v-for="k in kindOptions"
                    :key="k.value"
                    :value="k.value"
                    size="x-small"
                    variant="outlined"
                >
                    <span
                        class="legend-dot mr-1"
                        :style="{ background: nodeColor(k.value as any) }"
                    />
                    {{ k.label }}
                </v-chip>
            </v-chip-group>

            <v-spacer />

            <v-chip
                v-if="graphMode === 'geographic' && geoNodesCount > 0"
                size="x-small"
                color="primary"
                variant="tonal"
            >
                {{ geoNodesCount }} /
                {{ nodes.filter((n) => n.kind === 'location').length }} locations mapped
            </v-chip>

            <span class="text-caption text-medium-emphasis">
                {{ renderNodeCount }} nodes · {{ renderEdgeCount }} edges
            </span>
        </div>

        <div class="flex-grow-1 position-relative" style="min-height: 460px">
            <div
                ref="sigmaContainer"
                class="sigma-container fill-height"
                v-show="graphMode === 'force' || geoNodesCount > 0"
            />

            <div
                v-if="graphMode === 'geographic' && geoNodesCount === 0 && !loading"
                class="d-flex flex-column align-center justify-center fill-height text-medium-emphasis"
            >
                <v-icon size="48" class="mb-3 opacity-40">mdi-map-marker-off-outline</v-icon>
                <div class="text-subtitle-2">No geographic coordinates available</div>
                <div class="text-caption mt-1">
                    Location entities in this portfolio have no lat/lng data in Galaxy
                </div>
            </div>

            <div v-if="loading" class="d-flex align-center justify-center fill-height">
                <v-progress-circular indeterminate size="32" />
            </div>

            <div
                v-if="!loading && props.galaxyEnabled === false"
                class="d-flex flex-column align-center justify-center fill-height text-medium-emphasis"
            >
                <v-icon size="48" class="mb-3 opacity-40">mdi-graph-off-outline</v-icon>
                <div class="text-subtitle-2">Relationship data unavailable</div>
                <div class="text-caption mt-1 text-center" style="max-width: 320px">
                    The Galaxy data source is currently offline. Relationship graphs require Galaxy
                    and will populate automatically once it recovers.
                </div>
            </div>
        </div>
    </v-card>
</template>

<script setup lang="ts">
    import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
    import { useTheme } from 'vuetify';
    import 'leaflet/dist/leaflet.css';
    import Graph from 'graphology';
    import Sigma from 'sigma';
    import forceAtlas2 from 'graphology-layout-forceatlas2';
    import type { GraphNode, GraphEdge } from '~/composables/useRelationships';

    const props = defineProps<{
        nodes: GraphNode[];
        edges: GraphEdge[];
        loading?: boolean;
        galaxyEnabled?: boolean;
    }>();

    const emit = defineEmits<{
        'select-node': [node: GraphNode];
    }>();

    const theme = useTheme();
    const isDark = computed(() => theme.global.current.value.dark);

    // Sigma hardcodes a white (#FFF) background in its drawDiscNodeHover, which
    // makes white label text invisible in dark mode. This replacement reads the
    // labelColor setting to pick a contrasting background at draw time.
    function drawNodeHover(context: CanvasRenderingContext2D, data: any, settings: any): void {
        const textColor: string = settings.labelColor?.color ?? '#000000';
        const isLightText = textColor === '#ffffff' || textColor === '#fff' || textColor === '#FFF';
        const bgColor = isLightText ? '#1a1a1a' : '#ffffff';
        const size: number = settings.labelSize;
        const font: string = settings.labelFont;
        const weight: string = settings.labelWeight;

        context.font = `${weight} ${size}px ${font}`;
        context.fillStyle = bgColor;
        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.shadowBlur = 8;
        context.shadowColor = isLightText ? '#000' : '#999';

        const PADDING = 2;
        if (typeof data.label === 'string') {
            const textWidth = context.measureText(data.label).width;
            const boxWidth = Math.round(textWidth + 5);
            const boxHeight = Math.round(size + 2 * PADDING);
            const radius = Math.max(data.size, size / 2) + PADDING;
            const angleRadian = Math.asin(boxHeight / 2 / radius);
            const xDeltaCoord = Math.sqrt(Math.abs(radius ** 2 - (boxHeight / 2) ** 2));

            context.beginPath();
            context.moveTo(data.x + xDeltaCoord, data.y + boxHeight / 2);
            context.lineTo(data.x + radius + boxWidth, data.y + boxHeight / 2);
            context.lineTo(data.x + radius + boxWidth, data.y - boxHeight / 2);
            context.lineTo(data.x + xDeltaCoord, data.y - boxHeight / 2);
            context.arc(data.x, data.y, radius, angleRadian, -angleRadian);
            context.closePath();
            context.fill();
        } else {
            context.beginPath();
            context.arc(data.x, data.y, data.size + PADDING, 0, Math.PI * 2);
            context.closePath();
            context.fill();
        }

        context.shadowOffsetX = 0;
        context.shadowOffsetY = 0;
        context.shadowBlur = 0;

        // Draw label text in the correct contrasting color
        if (data.label) {
            context.fillStyle = textColor;
            context.font = `${weight} ${size}px ${font}`;
            context.fillText(data.label, data.x + data.size + 3, data.y + size / 3);
        }
    }

    const graphMode = ref<'force' | 'geographic'>('force');
    const activeKinds = ref<string[]>(['portfolio', 'company', 'person', 'instrument', 'location']);

    const kindOptions = [
        { value: 'portfolio', label: 'Portfolio', icon: 'mdi-briefcase-variant' },
        { value: 'company', label: 'Companies', icon: 'mdi-domain' },
        { value: 'person', label: 'People', icon: 'mdi-account' },
        { value: 'instrument', label: 'Instruments', icon: 'mdi-bank' },
        { value: 'location', label: 'Locations', icon: 'mdi-map-marker' },
    ];

    function nodeColor(kind: GraphNode['kind']): string {
        switch (kind) {
            case 'portfolio':
                return '#3FEA00';
            case 'company':
                return '#2196F3';
            case 'person':
                return '#4CAF50';
            case 'instrument':
                return '#FF5722';
            case 'location':
                return '#EF5350';
            default:
                return '#9E9E9E';
        }
    }

    const sigmaContainer = ref<HTMLDivElement | null>(null);
    let sigmaInstance: Sigma | null = null;
    let leafletLayer: { clean?: () => void } | null = null;

    const geoNodesCount = computed(() => {
        if (graphMode.value !== 'geographic') return 0;
        return props.nodes.filter((n) => n.kind === 'location' && n.lat != null && n.lng != null)
            .length;
    });

    const visibleNodes = computed(() => {
        const kinds = new Set(activeKinds.value);
        return props.nodes.filter((n) => kinds.has(n.kind));
    });

    const visibleEdges = computed(() => {
        const ids = new Set(visibleNodes.value.map((n) => n.id));
        return props.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    });

    const renderNodeCount = computed(() => visibleNodes.value.length);
    const renderEdgeCount = computed(() => visibleEdges.value.length);

    function killSigma() {
        if (leafletLayer && typeof leafletLayer.clean === 'function') {
            leafletLayer.clean();
        }
        leafletLayer = null;
        if (sigmaInstance) {
            sigmaInstance.kill();
            sigmaInstance = null;
        }
    }

    function edgeColor(): string {
        return isDark.value ? 'rgba(200,200,200,0.35)' : 'rgba(60,60,60,0.4)';
    }

    function labelColor(): string {
        return isDark.value ? '#ffffff' : '#111111';
    }

    function buildGraph(): Graph {
        const graph = new Graph({ multi: false });
        const nodeSet = visibleNodes.value;
        const edgeSet = visibleEdges.value;
        const ec = edgeColor();

        // Precompute degree map in O(edges) to avoid O(nodes × edges) inner loop.
        const degreeMap = new Map<string, number>();
        for (const edge of edgeSet) {
            degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1);
            degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1);
        }

        for (const node of nodeSet) {
            const isPortfolio = node.kind === 'portfolio';
            const degree = degreeMap.get(node.id) ?? 0;
            const size = isPortfolio ? 12 : Math.max(5, 5 + Math.log1p(degree) * 2);

            graph.addNode(node.id, {
                label: node.label,
                size,
                color: nodeColor(node.kind),
                kind: node.kind,
                neid: node.neid,
                lat: node.lat,
                lng: node.lng,
                x: Math.random() * 1000,
                y: Math.random() * 1000,
            });
        }

        for (const edge of edgeSet) {
            if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue;
            if (graph.hasEdge(edge.source, edge.target)) continue;
            graph.addEdge(edge.source, edge.target, {
                label: edge.relationship,
                size: 1,
                color: ec,
            });
        }

        return graph;
    }

    async function initForce() {
        if (!sigmaContainer.value) return;
        killSigma();

        const graph = buildGraph();
        if (graph.order === 0) return;

        const nodeCount = graph.order;
        const iterations = Math.min(500, Math.max(100, 200 + nodeCount * 2));

        const positions = forceAtlas2(graph, {
            iterations,
            settings: {
                gravity: 1,
                scalingRatio: 10,
                barnesHutOptimize: nodeCount > 200,
                barnesHutTheta: 0.5,
                strongGravityMode: false,
                outboundAttractionDistribution: true,
                linLogMode: false,
                adjustSizes: true,
                edgeWeightInfluence: 1,
                slowDown: 1,
            },
        });

        graph.forEachNode((node) => {
            if (positions[node]) {
                graph.setNodeAttribute(node, 'x', positions[node].x);
                graph.setNodeAttribute(node, 'y', positions[node].y);
            }
        });

        sigmaInstance = new Sigma(graph, sigmaContainer.value, {
            renderEdgeLabels: false,
            allowInvalidContainer: true,
            defaultNodeType: 'circle',
            defaultEdgeType: 'line',
            minCameraRatio: 0.05,
            maxCameraRatio: 10,
            labelRenderedSizeThreshold: 6,
            labelDensity: 0.8,
            labelColor: { color: labelColor() },
            defaultDrawNodeHover: drawNodeHover,
        });

        let highlightedNode: string | null = null;
        const neighborSet = new Set<string>();

        sigmaInstance.on('clickNode', ({ node }: { node: string }) => {
            const found = props.nodes.find((n) => n.id === node);
            if (found) emit('select-node', found);
        });

        sigmaInstance.on('enterNode', ({ node }: { node: string }) => {
            highlightedNode = node;
            neighborSet.clear();
            graph.neighbors(node).forEach((n) => neighborSet.add(n));
            const lc = labelColor();

            sigmaInstance!.setSetting('nodeReducer', (n, data) => {
                if (n === highlightedNode || neighborSet.has(n)) {
                    // Explicitly carry the correct label color through the hover
                    // reducer — Sigma's highlighted ring can otherwise wash out
                    // labels in dark mode.
                    return { ...data, labelColor: lc };
                }
                return { ...data, color: 'rgba(150,150,150,0.15)', label: '' };
            });
            sigmaInstance!.setSetting('edgeReducer', (e, data) => {
                const src = graph.source(e);
                const tgt = graph.target(e);
                if (src === highlightedNode || tgt === highlightedNode) return data;
                return { ...data, color: 'rgba(150,150,150,0.05)' };
            });
        });

        sigmaInstance.on('leaveNode', () => {
            highlightedNode = null;
            neighborSet.clear();
            sigmaInstance!.setSetting('nodeReducer', null as any);
            sigmaInstance!.setSetting('edgeReducer', null as any);
        });
    }

    async function initGeographic() {
        if (!sigmaContainer.value) return;
        killSigma();

        const locationNodes = props.nodes.filter(
            (n) => n.kind === 'location' && n.lat != null && n.lng != null
        );
        if (locationNodes.length === 0) return;

        // Collect portfolio nodes connected to mappable locations
        const connectedPortfolioIds = new Set<string>();
        for (const loc of locationNodes) {
            loc.connectsTo.forEach((id) => connectedPortfolioIds.add(id));
        }
        const portfolioNodes = props.nodes.filter(
            (n) => n.kind === 'portfolio' && connectedPortfolioIds.has(n.id)
        );

        const graph = new Graph({ multi: false });

        // Add location nodes with lat/lng as sigma x/y (will be overridden by leaflet)
        for (const node of locationNodes) {
            graph.addNode(node.id, {
                label: node.label,
                x: node.lng!,
                y: -node.lat!, // sigma Y is inverted vs lat
                lat: node.lat,
                lng: node.lng,
                size: 8,
                color: nodeColor('location'),
                kind: 'location',
                neid: node.neid,
            });
        }

        // Add connected portfolio nodes at centroid of their location connections
        for (const pNode of portfolioNodes) {
            const connectedLocs = locationNodes.filter((l) => l.connectsTo.includes(pNode.id));
            if (connectedLocs.length === 0) continue;
            const avgLng = connectedLocs.reduce((s, l) => s + l.lng!, 0) / connectedLocs.length;
            const avgLat = connectedLocs.reduce((s, l) => s + l.lat!, 0) / connectedLocs.length;
            graph.addNode(pNode.id, {
                label: pNode.label,
                x: avgLng,
                y: -avgLat,
                lat: avgLat,
                lng: avgLng,
                size: 12,
                color: nodeColor('portfolio'),
                kind: 'portfolio',
                neid: pNode.neid,
            });
        }

        // Add edges between portfolio and location
        const ec = edgeColor();
        for (const loc of locationNodes) {
            for (const portId of loc.connectsTo) {
                if (graph.hasNode(portId) && !graph.hasEdge(portId, loc.id)) {
                    graph.addEdge(portId, loc.id, {
                        size: 1,
                        color: ec,
                    });
                }
            }
        }

        sigmaInstance = new Sigma(graph, sigmaContainer.value, {
            renderEdgeLabels: false,
            allowInvalidContainer: true,
            defaultNodeType: 'circle',
            minCameraRatio: 0.001,
            maxCameraRatio: 100,
            labelRenderedSizeThreshold: 4,
            labelColor: { color: labelColor() },
            defaultDrawNodeHover: drawNodeHover,
        });

        sigmaInstance.on('clickNode', ({ node }: { node: string }) => {
            const found = props.nodes.find((n) => n.id === node);
            if (found) emit('select-node', found);
        });

        const { default: bindLeafletLayer } = await import('@sigma/layer-leaflet');

        leafletLayer = bindLeafletLayer(sigmaInstance, {
            tileLayer: {
                urlTemplate: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
                attribution:
                    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            },
        });
    }

    async function rebuild() {
        await nextTick();
        if (graphMode.value === 'force') {
            await initForce();
        } else {
            await initGeographic();
        }
    }

    onMounted(() => {
        void rebuild();
    });

    onUnmounted(() => {
        killSigma();
    });

    watch(
        [graphMode, activeKinds, isDark, () => props.nodes, () => props.edges],
        () => {
            void rebuild();
        },
        { deep: true }
    );
</script>

<style scoped>
    .network-card {
        min-height: 560px;
    }

    .network-toolbar {
        border-bottom: 1px solid rgba(var(--dynamic-fg-rgb), 0.06);
        background: rgba(var(--dynamic-bg-rgb), 0.4);
    }

    .sigma-container {
        width: 100%;
        height: 100%;
        background: radial-gradient(
            circle at center,
            rgba(var(--dynamic-primary-rgb), 0.04),
            transparent 70%
        );
    }

    .legend-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }
</style>
