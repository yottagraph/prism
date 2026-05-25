/**
 * Portfolio state composable.
 *
 * Holds the active portfolio, its entity list (with resolved NEIDs and
 * agent-computed scores), and CRUD helpers. Persistence uses the per-tenant
 * prefs store (Firestore in BC 2.0, KV on legacy). Entity resolution goes
 * through the gateway `entities/search` endpoint.
 */

import { computed, ref } from 'vue';

import { searchEntities } from '~/utils/elementalHelpers';
import {
    type EntityRiskScore,
    type RiskTier,
    type SourceFusionWeights,
    deriveTier,
    fuseScore,
    seededEntityScore,
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

const DEFAULT_WEIGHTS: SourceFusionWeights = {
    solvency: 0.4,
    executive: 0.25,
    news: 0.2,
    market: 0.15,
};

// Pre-seeded demo portfolios. Names are real, well-known issuers so entity
// resolution against Elemental returns hits. Scoring is deterministic (seeded
// by NEID) so the demo is reproducible without live agent runs.
function defaultPortfolios(): PortfolioDoc[] {
    const now = Date.now();
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
const lastScanError = ref<string | null>(null);

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
     * Resolve unresolved entities via the gateway's entity search and compute
     * deterministic agent scores. Updates portfolio entities in place.
     */
    async function scanPortfolio(portfolioId: string, opts: { force?: boolean } = {}) {
        const idx = p.portfolios.findIndex((pp) => pp.id === portfolioId);
        if (idx < 0) return;
        scanning.value = true;
        lastScanError.value = null;
        const ents = p.portfolios[idx].entities;
        scanProgress.value = { done: 0, total: ents.length };

        const w = weights.value;

        // Bounded concurrency — keep within History Agent fan-out budget.
        const CONCURRENCY = 6;
        let cursor = 0;

        async function worker() {
            while (cursor < ents.length) {
                const i = cursor++;
                const entity = ents[i];
                if (!opts.force && entity.neid && entity.scores) {
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
                        } else {
                            entity.resolutionError = 'No match in knowledge graph';
                        }
                    }
                    const seed = entity.neid || entity.inputName;
                    const subs = seededEntityScore(seed);
                    const fused = fuseScore(subs, w);
                    entity.scores = {
                        ...subs,
                        fused,
                        tier: deriveTier(fused),
                        updatedAt: Date.now(),
                    };
                } catch (e: any) {
                    entity.resolutionError = e?.message || 'Resolution failed';
                    const subs = seededEntityScore(entity.inputName);
                    const fused = fuseScore(subs, w);
                    entity.scores = {
                        ...subs,
                        fused,
                        tier: deriveTier(fused),
                        updatedAt: Date.now(),
                    };
                } finally {
                    scanProgress.value.done++;
                    p.portfolios[idx].entities = [...ents];
                }
            }
        }

        try {
            await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
        } catch (e: any) {
            lastScanError.value = e?.message || 'Scan failed';
        } finally {
            scanning.value = false;
        }
    }

    return {
        portfolios,
        activePortfolio,
        weights,
        scanning: computed(() => scanning.value),
        scanProgress: computed(() => scanProgress.value),
        lastScanError: computed(() => lastScanError.value),
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
