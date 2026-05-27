/**
 * Portfolio state composable.
 *
 * Holds the active portfolio, its entity list (with resolved NEIDs and
 * agent-computed scores), and CRUD helpers. Persistence uses the per-tenant
 * prefs store (Firestore in BC 2.0, KV on legacy). Entity resolution goes
 * through the gateway `entities/search` endpoint.
 */

import { computed, ref } from 'vue';

import portfolioFixture from '~/assets/portfolios-fixture.json';
import { searchEntities } from '~/utils/elementalHelpers';
import {
    type CitationRef,
    type EntityRiskScore,
    type RiskTier,
    type SourceFusionWeights,
} from './useFusedScoring';

export interface PortfolioEntity {
    /** Name as provided by the user (before resolution). */
    inputName: string;
    /** Canonical name returned by Elemental entity resolution. */
    resolvedName: string;
    /** 20-char NEID, or null if resolution failed. */
    neid: string | null;
    /** Optional ticker (best-effort, populated when available). */
    ticker?: string;
    /** When this entity was added (epoch ms). */
    addedAt: number;
    /** Latest agent-computed scores (null until first scan). */
    scores: EntityRiskScore | null;
    /** Analyst override severity. */
    assessment?: {
        tier: RiskTier;
        justification: string;
        savedAt: number;
    };
    /** Resolution error message, if entity could not be resolved. */
    resolutionError?: string;
}

export interface PortfolioDoc {
    id: string;
    name: string;
    description: string;
    createdAt: number;
    entities: PortfolioEntity[];
}

interface PortfolioPrefsShape {
    portfolios: PortfolioDoc[];
    activePortfolioId: string | null;
    weights: SourceFusionWeights;
}

interface ScanEntityEventPayload {
    index: number;
    entity: {
        inputName: string;
        resolvedName: string;
        neid: string | null;
        scores: EntityRiskScore | null;
        drivers?: Array<{
            lens: string;
            source: string;
            score: number;
            finding: { text: string; date?: string; citations: CitationRef[] };
        }>;
        conflicts?: Array<{ lens: string; delta: number }>;
        confidenceLevel?: 'High' | 'Medium' | 'Low';
        coverage?: { sec: boolean; news: boolean; stock: boolean; poly: boolean };
        resolutionError?: string;
    };
}

const DEFAULT_WEIGHTS: SourceFusionWeights = {
    solvency: 0.4,
    executive: 0.25,
    news: 0.2,
    market: 0.15,
};

const debugPrefs = useAppFeaturePrefs('debug-settings', {
    scanDiagnosticsLogs: false,
});

// Preloaded demo portfolios. Names are real, well-known issuers so entity
// resolution against Elemental returns hits.
function defaultPortfolios(): PortfolioDoc[] {
    const now = Date.now();
    const fixturePortfolios = (portfolioFixture as any)?.portfolios;
    if (Array.isArray(fixturePortfolios) && fixturePortfolios.length > 0) {
        return fixturePortfolios.map((portfolio: any) => ({
            id: portfolio.id,
            name: portfolio.name,
            description: portfolio.description || '',
            createdAt: now,
            entities: (portfolio.entities || []).map((entity: any) => ({
                inputName: entity.inputName,
                resolvedName: entity.resolvedName || entity.inputName,
                neid: entity.neid || null,
                addedAt: now,
                scores: null,
            })),
        }));
    }
    return [
        {
            id: 'clo-mid-market',
            name: 'CLO Mid-Market',
            description: 'Mid-cap industrial and service issuers typical of a CLO.',
            createdAt: now,
            entities: [
                'Ford Motor Company',
                'General Motors',
                'Carnival Corporation',
                'Macy\u2019s',
                'Bed Bath & Beyond',
                'AMC Entertainment',
                'Hertz Global',
                'United States Steel',
                'Cleveland-Cliffs',
                'Wynn Resorts',
                'Las Vegas Sands',
                'Royal Caribbean',
                'JetBlue Airways',
                'American Airlines',
                'Delta Air Lines',
                'Norwegian Cruise Line',
                'Spirit Airlines',
                'Chesapeake Energy',
                'Occidental Petroleum',
                'Halliburton',
                'Schlumberger',
                'Marathon Oil',
                'Sunrun',
                'Plug Power',
                'Beyond Meat',
                'Peloton Interactive',
                'GameStop',
                'Rite Aid',
                'CVS Health',
                'Walgreens Boots Alliance',
            ].map((n) => ({
                inputName: n,
                resolvedName: n,
                neid: null,
                addedAt: now,
                scores: null,
            })),
        },
        {
            id: 'tech-growth',
            name: 'Tech Growth',
            description: 'High-growth tech with governance-heavy signal profile.',
            createdAt: now,
            entities: [
                'Snowflake',
                'Datadog',
                'Cloudflare',
                'MongoDB',
                'CrowdStrike',
                'Palantir Technologies',
                'Coinbase',
                'Robinhood',
                'Shopify',
                'Roblox',
                'Unity Software',
                'DoorDash',
                'Airbnb',
                'Lyft',
                'Pinterest',
            ].map((n) => ({
                inputName: n,
                resolvedName: n,
                neid: null,
                addedAt: now,
                scores: null,
            })),
        },
        {
            id: 'distressed-watchlist',
            name: 'Distressed Watchlist',
            description: 'Names with known recent distress signals.',
            createdAt: now,
            entities: [
                'WeWork',
                'Bed Bath & Beyond',
                'Rite Aid',
                'Yellow Corporation',
                'SVB Financial Group',
                'Signature Bank',
                'First Republic Bank',
                'Lordstown Motors',
                'Mullen Automotive',
                'Tupperware Brands',
            ].map((n) => ({
                inputName: n,
                resolvedName: n,
                neid: null,
                addedAt: now,
                scores: null,
            })),
        },
    ];
}

// Module-scoped state so every consumer of usePortfolio() shares the same
// portfolios + active selection.
const prefs = ref<ReturnType<typeof useAppFeaturePrefs<PortfolioPrefsShape>> | null>(null);
const scanning = ref(false);
const scanProgress = ref<{ done: number; total: number }>({ done: 0, total: 0 });
const scanStatusMessage = ref('Idle');
const scanStatusHistory = ref<Array<{ at: number; phase: string; message: string }>>([]);
const lastScanError = ref<string | null>(null);
const lastScanCoverage = ref<{ sec: number; news: number; stock: number; poly: number }>({
    sec: 0,
    news: 0,
    stock: 0,
    poly: 0,
});

interface AgentStreamEvent {
    event: string;
    data: any;
}

function pushScanStatus(message: string, phase = 'info') {
    scanStatusHistory.value.push({
        at: Date.now(),
        phase,
        message,
    });
    if (scanStatusHistory.value.length > 80) {
        scanStatusHistory.value = scanStatusHistory.value.slice(-80);
    }
}

function ensurePrefs() {
    if (!prefs.value) {
        prefs.value = useAppFeaturePrefs<PortfolioPrefsShape>('portfolio-risk', {
            portfolios: defaultPortfolios(),
            activePortfolioId: 'clo-mid-market',
            weights: DEFAULT_WEIGHTS,
        });
        if (!prefs.value.portfolios || prefs.value.portfolios.length === 0) {
            prefs.value.portfolios = defaultPortfolios();
            prefs.value.activePortfolioId = 'clo-mid-market';
        }
    }
    return prefs.value!;
}

export function usePortfolio() {
    const p = ensurePrefs();

    const portfolios = computed(() => p.portfolios);
    const activePortfolio = computed(
        () => p.portfolios.find((pp) => pp.id === p.activePortfolioId) ?? p.portfolios[0] ?? null
    );
    const weights = computed({
        get: () => p.weights ?? DEFAULT_WEIGHTS,
        set: (w: SourceFusionWeights) => {
            p.weights = w;
        },
    });

    function setActivePortfolio(id: string) {
        p.activePortfolioId = id;
    }

    function createPortfolio(name: string, names: string[]): PortfolioDoc {
        const now = Date.now();
        const id = `${slugify(name)}-${now.toString(36)}`;
        const portfolio: PortfolioDoc = {
            id,
            name,
            description: '',
            createdAt: now,
            entities: names
                .map((n) => n.trim())
                .filter(Boolean)
                .map((n) => ({
                    inputName: n,
                    resolvedName: n,
                    neid: null,
                    addedAt: now,
                    scores: null,
                })),
        };
        p.portfolios = [...p.portfolios, portfolio];
        p.activePortfolioId = id;
        return portfolio;
    }

    function deletePortfolio(id: string) {
        p.portfolios = p.portfolios.filter((pp) => pp.id !== id);
        if (p.activePortfolioId === id) {
            p.activePortfolioId = p.portfolios[0]?.id ?? null;
        }
    }

    function addEntities(portfolioId: string, names: string[]) {
        const idx = p.portfolios.findIndex((pp) => pp.id === portfolioId);
        if (idx < 0) return;
        const existing = new Set(p.portfolios[idx].entities.map((e) => e.inputName.toLowerCase()));
        const now = Date.now();
        const fresh = names
            .map((n) => n.trim())
            .filter((n) => n && !existing.has(n.toLowerCase()))
            .map<PortfolioEntity>((n) => ({
                inputName: n,
                resolvedName: n,
                neid: null,
                addedAt: now,
                scores: null,
            }));
        p.portfolios[idx].entities = [...p.portfolios[idx].entities, ...fresh];
    }

    function removeEntity(portfolioId: string, inputName: string) {
        const idx = p.portfolios.findIndex((pp) => pp.id === portfolioId);
        if (idx < 0) return;
        p.portfolios[idx].entities = p.portfolios[idx].entities.filter(
            (e) => e.inputName !== inputName
        );
    }

    function saveAssessment(
        portfolioId: string,
        neid: string,
        tier: RiskTier,
        justification: string
    ) {
        const pi = p.portfolios.findIndex((pp) => pp.id === portfolioId);
        if (pi < 0) return;
        const ei = p.portfolios[pi].entities.findIndex((e) => e.neid === neid);
        if (ei < 0) return;
        p.portfolios[pi].entities[ei].assessment = {
            tier,
            justification,
            savedAt: Date.now(),
        };
    }

    /**
     * Resolve entities and compute multi-source scores through the server-side
     * scan pipeline (`POST /api/agents/scan`) using SSE updates.
     */
    async function scanPortfolio(portfolioId: string, opts: { force?: boolean } = {}) {
        const idx = p.portfolios.findIndex((pp) => pp.id === portfolioId);
        if (idx < 0) return;
        scanning.value = true;
        lastScanError.value = null;
        scanStatusMessage.value = 'Starting scan…';
        scanStatusHistory.value = [];
        pushScanStatus('Starting scan', 'init');
        const ents = p.portfolios[idx].entities;
        scanProgress.value = { done: 0, total: ents.length };

        try {
            const response = await fetch('/api/agents/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    portfolioId,
                    force: !!opts.force,
                    debugLogs: !!debugPrefs.scanDiagnosticsLogs,
                    weights: weights.value,
                    entities: ents.map((entity) => ({
                        inputName: entity.inputName,
                        resolvedName: entity.resolvedName,
                        neid: entity.neid,
                    })),
                }),
            });
            if (!response.ok || !response.body) {
                throw new Error(`Scan request failed (${response.status})`);
            }
            scanStatusMessage.value = 'Connected, waiting for server updates…';
            pushScanStatus(scanStatusMessage.value, 'init');

            for await (const { event, data } of readScanSSE(response)) {
                if (event === 'entity') {
                    const payload = data as ScanEntityEventPayload;
                    const current = ents[payload.index];
                    if (!current) continue;
                    current.neid = payload.entity.neid;
                    current.resolvedName = payload.entity.resolvedName || current.resolvedName;
                    current.resolutionError = payload.entity.resolutionError;
                    current.scores = payload.entity.scores;
                    p.portfolios[idx].entities = [...ents];
                    if (payload.entity.resolutionError) {
                        scanStatusMessage.value = `Issue loading ${payload.entity.inputName}: ${payload.entity.resolutionError}`;
                        pushScanStatus(scanStatusMessage.value, 'warning');
                    } else if (payload.entity.scores) {
                        scanStatusMessage.value = `Loaded ${payload.entity.resolvedName} (${payload.entity.scores.fused})`;
                    }
                } else if (event === 'progress') {
                    scanProgress.value = {
                        done: data?.done ?? scanProgress.value.done,
                        total: data?.total ?? scanProgress.value.total,
                    };
                    scanStatusMessage.value = `Scanning ${scanProgress.value.done}/${scanProgress.value.total} entities…`;
                } else if (event === 'status') {
                    if (typeof data?.message === 'string' && data.message.trim()) {
                        scanStatusMessage.value = data.message;
                        pushScanStatus(scanStatusMessage.value, data?.phase || 'status');
                    }
                } else if (event === 'done') {
                    if (data?.coverage) {
                        lastScanCoverage.value = data.coverage;
                    }
                    if (data?.diagnostics) {
                        console.info('[scan diagnostics]', data.diagnostics);
                    }
                    const entitiesOut = Array.isArray(data?.entities) ? data.entities : [];
                    const failedNames: string[] = [];
                    entitiesOut.forEach((entityOut: any, entityIndex: number) => {
                        const current = ents[entityIndex];
                        if (!current) return;
                        current.neid = entityOut.neid;
                        current.resolvedName = entityOut.resolvedName || current.resolvedName;
                        current.resolutionError = entityOut.resolutionError;
                        current.scores = entityOut.scores ?? current.scores;
                        if (entityOut.resolutionError) {
                            failedNames.push(entityOut.resolvedName || entityOut.inputName || `row ${entityIndex + 1}`);
                        }
                    });
                    p.portfolios[idx].entities = [...ents];
                    if (failedNames.length > 0) {
                        const preview = failedNames.slice(0, 3).join(', ');
                        lastScanError.value =
                            failedNames.length > 3
                                ? `${failedNames.length} entities failed to fully load (e.g. ${preview}).`
                                : `${failedNames.length} entities failed to fully load: ${preview}.`;
                        pushScanStatus(lastScanError.value, 'warning');
                    }
                    if (!lastScanError.value) {
                        scanStatusMessage.value = 'Scan complete.';
                        pushScanStatus(scanStatusMessage.value, 'complete');
                    }
                } else if (event === 'error') {
                    throw new Error(data?.message || 'Scan pipeline failed');
                }
            }
        } catch (e: any) {
            lastScanError.value = e?.message || 'Scan failed';
            scanStatusMessage.value = `Scan failed: ${lastScanError.value}`;
            pushScanStatus(scanStatusMessage.value, 'error');
            // Best-effort resolution without local placeholder scoring when scan API is unavailable.
            for (const entity of ents) {
                if (entity.neid && entity.scores && !opts.force) {
                    scanProgress.value.done++;
                    continue;
                }
                try {
                    if (!entity.neid || opts.force) {
                        const matches = await searchEntities(entity.inputName, {
                            maxResults: 1,
                            flavors: ['organization'],
                        });
                        if (matches.length > 0) {
                            entity.neid = matches[0].neid;
                            entity.resolvedName = matches[0].name || entity.inputName;
                            entity.resolutionError = undefined;
                        }
                    }
                    entity.scores = null;
                } finally {
                    scanProgress.value.done++;
                }
            }
            p.portfolios[idx].entities = [...ents];
        } finally {
            scanning.value = false;
            if (!lastScanError.value && scanStatusMessage.value === 'Idle') {
                scanStatusMessage.value = 'Scan complete.';
            }
        }
    }

    return {
        portfolios,
        activePortfolio,
        weights,
        scanning: computed(() => scanning.value),
        scanProgress: computed(() => scanProgress.value),
        scanStatusMessage: computed(() => scanStatusMessage.value),
        scanStatusHistory: computed(() => scanStatusHistory.value),
        lastScanError: computed(() => lastScanError.value),
        lastScanCoverage: computed(() => lastScanCoverage.value),
        setActivePortfolio,
        createPortfolio,
        deletePortfolio,
        addEntities,
        removeEntity,
        saveAssessment,
        scanPortfolio,
    };
}

function slugify(name: string): string {
    return (
        name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'portfolio'
    );
}

async function* readScanSSE(response: Response): AsyncGenerator<AgentStreamEvent> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split('\n\n');
            buffer = blocks.pop() || '';
            for (const block of blocks) {
                const parsed = parseScanSSEBlock(block);
                if (parsed) yield parsed;
            }
        }
    } finally {
        reader.releaseLock();
    }
}

function parseScanSSEBlock(block: string): AgentStreamEvent | null {
    let eventType = 'message';
    let dataLine = '';
    for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataLine = line.slice(6);
    }
    if (!dataLine) return null;
    try {
        return { event: eventType, data: JSON.parse(dataLine) };
    } catch {
        return { event: eventType, data: dataLine };
    }
}
