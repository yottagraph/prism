/**
 * Portfolio state composable.
 *
 * Holds the active portfolio, its entity list (with resolved NEIDs and
 * agent-computed scores), and CRUD helpers. Persistence uses the per-tenant
 * prefs store (Firestore in BC 2.0, KV on legacy). Entity resolution goes
 * through the gateway `entities/search` endpoint.
 */

import { computed, effectScope, ref, watch } from 'vue';

import portfolioFixture from '~/assets/portfolios-fixture.json';
import householdFixture from '~/assets/household-fixture.json';
import eddFixture from '~/assets/edd-fixture.json';
import { searchEntities } from '~/utils/elementalHelpers';
import {
    type CitationRef,
    DEFAULT_SCORING_SETTINGS,
    type EntityRiskScore,
    type MonitorEntity,
    type RiskTier,
    type ScoringSettings,
    type SourceFusionWeights,
} from './useFusedScoring';
import { primeRelationshipCache, type RelationshipUniverse } from './useRelationships';

export interface SourceCoverageDetail {
    sec: { filings: number; earliest: string | null; latest: string | null };
    news: { articles: number; events: number; earliest: string | null; latest: string | null };
    stock: {
        readings: number;
        instruments: number;
        earliest: string | null;
        latest: string | null;
    };
    poly: { markets: number; active: number };
    fred: { series: number; earliest: string | null; latest: string | null };
    acs: boolean;
    eventPressure: boolean;
    velocity: boolean;
    sanctions: boolean;
    ownership: number;
    fdic: boolean;
}

export interface PortfolioCoverageDetail {
    sec: { entities: number; filings: number; earliest: string | null; latest: string | null };
    news: {
        entities: number;
        articles: number;
        events: number;
        earliest: string | null;
        latest: string | null;
    };
    stock: {
        entities: number;
        readings: number;
        instruments: number;
        earliest: string | null;
        latest: string | null;
    };
    poly: { entities: number; markets: number; active: number };
    fred: { entities: number; series: number; earliest: string | null; latest: string | null };
    acs: number;
    eventPressure: number;
    velocity: number;
    sanctions: number;
    ownership: { entities: number; links: number };
    fdic: number;
}

/**
 * Pre-resolved entity input for createPortfolioFromEntities / addResolvedEntities.
 * When neid is provided (e.g. from search results), it is stored directly instead
 * of being left null until the next scan.
 */
export interface ResolvedEntityInput {
    inputName: string;
    resolvedName?: string;
    neid?: string | null;
    ticker?: string;
    /** Dollars invested at cost. */
    amountInvested?: number;
    /** ISO date (YYYY-MM-DD) the position was opened. */
    purchaseDate?: string;
}

/**
 * Live valuation of a holding, derived from Elemental price history.
 * `shares` is back-solved from `amountInvested / costBasisPrice`, so the
 * position is "priced through time": current value tracks the latest close.
 */
export interface HoldingValuation {
    /** Cost basis dollars at purchase (echo of the seeded/entered amount). */
    amountInvested: number | null;
    /** Implied share count: amountInvested / costBasisPrice. */
    shares: number | null;
    /** Close on (or first trading day after) the purchase date. */
    costBasisPrice: number | null;
    /** Actual trading date used for the cost basis. */
    costBasisDate: string | null;
    /** Most recent close in Elemental's price history. */
    latestClose: number | null;
    /** Date of the latest close. */
    latestDate: string | null;
    /** shares * latestClose. */
    currentValue: number | null;
    /** Percent return from cost basis to latest close. */
    returnPct: number | null;
    /** Instrument currency (best-effort; USD for US-listed names). */
    currency: string | null;
    /** Downsampled value-over-time series (monthly), for sparklines. */
    series: Array<{ date: string; value: number }>;
    /** Populated when the holding could not be valued. */
    error?: string;
}

export interface PortfolioEntity extends Pick<MonitorEntity, 'signalAgreement' | 'signalSummary'> {
    /** Name as provided by the user (before resolution). */
    inputName: string;
    /** Canonical name returned by Elemental entity resolution. */
    resolvedName: string;
    /** 20-char NEID, or null if resolution failed. */
    neid: string | null;
    /** Optional ticker (best-effort, populated when available). */
    ticker?: string;
    /** Dollars invested at cost. Drives value-weighting and dollar consequences. */
    amountInvested?: number;
    /** ISO date (YYYY-MM-DD) the position was opened, for backdated valuation. */
    purchaseDate?: string;
    /** Live valuation from Elemental price history (null until valued). */
    valuation?: HoldingValuation | null;
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
    /** Monitor-table rollup fields emitted by scan pipeline. */
    monitor?: Omit<MonitorEntity, 'inputName' | 'resolvedName' | 'neid' | 'scores'>;
    /** Per-lens confidence and coverage metadata from scan output. */
    confidenceLevel?: 'High' | 'Medium' | 'Low';
    coverage?: {
        sec: boolean;
        news: boolean;
        stock: boolean;
        poly: boolean;
        acs?: boolean;
        eventPressure?: boolean;
        velocity?: boolean;
        polymarket?: boolean;
        sanctions?: boolean;
        ownership?: boolean;
        fdic?: boolean;
    };
    coverageDetail?: SourceCoverageDetail;
    drivers?: Array<{
        lens: string;
        source: string;
        score: number;
        finding: { text: string; date?: string; citations: CitationRef[] };
    }>;
    conflicts?: Array<{ lens: string; delta: number }>;
    /** Full lens breakdown from scan — drives FHS/ERS/ACS detail tabs without re-fetching. */
    lensDetails?: Partial<
        Record<
            string,
            {
                metrics: Array<{ label: string; value: string; ref?: string }>;
                findings: Array<{
                    text: string;
                    date?: string;
                    citations: Array<{
                        ref?: string;
                        url?: string;
                        title?: string;
                        source?: string;
                        date?: string;
                        snippet?: string;
                    }>;
                }>;
            }
        >
    >;
}

export interface GoalMeta {
    /** Short purpose label, e.g. "Retirement", "House Down Payment". */
    purpose: string;
    /** Investment horizon in years. */
    horizonYears: number;
    /** Optional financial target in dollars. */
    targetAmount?: number;
    /** How critical this goal is. */
    priority?: 'essential' | 'important' | 'aspirational';
}

/** Sentinel owner for institutional books so they never surface in retail per-user lists. */
export const INSTITUTIONAL_OWNER = '__institutional__';

/**
 * Mandate metadata for institutional books. Parallels GoalMeta for retail:
 * it frames the book for the agent-builder audience (which Solution Pack /
 * policy the agents operate under) instead of a personal savings goal.
 */
export interface MandateMeta {
    /** Solution Pack name, e.g. "Enhanced Due Diligence". */
    pack: string;
    /** The single question the agents answer for this book. */
    question: string;
    /** How the monitoring → analytic → composition agents operate this book. */
    context?: string;
    /** Analytical modules this mandate leads with, e.g. ["FHS", "ERS", "ACS"]. */
    primaryModules?: string[];
}

export interface PortfolioDoc {
    id: string;
    name: string;
    description: string;
    createdAt: number;
    entities: PortfolioEntity[];
    scoring?: ScoringSettings;
    /** Demo user who owns this bucket. */
    ownerUserId?: string;
    /** Goal metadata for goals-based framing. */
    goal?: GoalMeta;
    /** 'retail' (default) for goal buckets, 'institutional' for Workspace books. */
    kind?: 'retail' | 'institutional';
    /** Mandate metadata for institutional books (parallels `goal` for retail). */
    mandate?: MandateMeta;
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
        monitor?: PortfolioEntity['monitor'];
        drivers?: Array<{
            lens: string;
            source: string;
            score: number;
            finding: { text: string; date?: string; citations: CitationRef[] };
        }>;
        conflicts?: Array<{ lens: string; delta: number }>;
        confidenceLevel?: 'High' | 'Medium' | 'Low';
        coverage?: PortfolioEntity['coverage'];
        coverageDetail?: SourceCoverageDetail;
        resolutionError?: string;
        lensDetails?: PortfolioEntity['lensDetails'];
    };
}

const DEFAULT_WEIGHTS: SourceFusionWeights = {
    solvency: 0.35,
    executive: 0.25,
    news: 0.15,
    market: 0,
    eventPressure: 0.25,
};

const debugPrefs = useAppFeaturePrefs('debug-settings', {
    scanDiagnosticsLogs: false,
});

/**
 * Institutional books for the agent-builder Workspace surface. Loaded from
 * edd-fixture.json and always merged in alongside the retail fixtures so they
 * are available regardless of which retail fixture is active.
 */
function institutionalBooks(now: number): PortfolioDoc[] {
    const books = (eddFixture as any)?.books;
    if (!Array.isArray(books)) return [];
    return books.map((book: any) => ({
        id: book.id,
        name: book.name,
        description: book.description || '',
        createdAt: book.createdAt ?? now,
        ownerUserId: book.ownerUserId ?? INSTITUTIONAL_OWNER,
        kind: 'institutional' as const,
        ...(book.mandate ? { mandate: book.mandate } : {}),
        entities: (book.entities || []).map((entity: any) => ({
            inputName: entity.inputName,
            resolvedName: entity.resolvedName || entity.inputName,
            neid: entity.neid || null,
            addedAt: now,
            scores: null,
        })),
    }));
}

// Preloaded demo portfolios. Prefer household fixture (goals-based) over the
// legacy CLO fixture when available. Institutional books are always appended.
function defaultPortfolios(): PortfolioDoc[] {
    const now = Date.now();
    const institutional = institutionalBooks(now);

    // Household fixture takes precedence (goals-based personas)
    const householdPortfolios = (householdFixture as any)?.portfolios;
    if (Array.isArray(householdPortfolios) && householdPortfolios.length > 0) {
        const retail = householdPortfolios.map((portfolio: any) => ({
            id: portfolio.id,
            name: portfolio.name,
            description: portfolio.description || '',
            createdAt: portfolio.createdAt ?? now,
            ownerUserId: portfolio.ownerUserId ?? 'maya',
            kind: 'retail' as const,
            ...(portfolio.goal ? { goal: portfolio.goal } : {}),
            entities: (portfolio.entities || []).map((entity: any) => ({
                inputName: entity.inputName,
                resolvedName: entity.resolvedName || entity.inputName,
                neid: entity.neid || null,
                ...(typeof entity.amountInvested === 'number'
                    ? { amountInvested: entity.amountInvested }
                    : {}),
                ...(entity.purchaseDate ? { purchaseDate: entity.purchaseDate } : {}),
                addedAt: now,
                scores: null,
            })),
        }));
        return [...retail, ...institutional];
    }

    // Legacy fallback: portfolios-fixture.json
    const fixturePortfolios = (portfolioFixture as any)?.portfolios;
    if (Array.isArray(fixturePortfolios) && fixturePortfolios.length > 0) {
        const legacy = fixturePortfolios.map((portfolio: any) => ({
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
        return [...legacy, ...institutional];
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
        ...institutional,
    ];
}

// Module-scoped state so every consumer of usePortfolio() shares the same
// portfolios + active selection.
const prefs = ref<ReturnType<typeof useAppFeaturePrefs<PortfolioPrefsShape>> | null>(null);

/**
 * Session-scoped scan result cache.
 * Key: `${portfolioId}::${inputName}`. Written during scans.
 * Re-applied whenever prefs re-hydration (auth transition, slow disk read)
 * clobbers freshly-computed in-memory scores with stale data from disk.
 */
const _sessionScores = new Map<string, PortfolioEntity>();
let _sessionWatchInstalled = false;

function _cacheEntityScore(portfolioId: string, entity: PortfolioEntity) {
    if (entity.scores) {
        _sessionScores.set(`${portfolioId}::${entity.inputName}`, { ...entity });
    }
}

function _reapplySessionScores() {
    if (!prefs.value || _sessionScores.size === 0) return;
    for (const portfolio of prefs.value.portfolios ?? []) {
        let changed = false;
        const updatedEntities = portfolio.entities.map((entity) => {
            if (entity.scores) return entity; // already has scores, nothing to do
            const cached = _sessionScores.get(`${portfolio.id}::${entity.inputName}`);
            if (cached?.scores) {
                changed = true;
                return { ...entity, ...cached };
            }
            return entity;
        });
        if (changed) {
            const idx = prefs.value!.portfolios.findIndex((p) => p.id === portfolio.id);
            if (idx >= 0) {
                prefs.value!.portfolios[idx] = { ...portfolio, entities: updatedEntities };
            }
        }
    }
}

function _installSessionWatcher() {
    if (_sessionWatchInstalled) return;
    _sessionWatchInstalled = true;
    const scope = effectScope(true);
    scope.run(() => {
        // Watch for portfolios array reference change (signals a prefs re-hydration
        // wholesale-replaced the array). On detection, re-apply any session scores.
        watch(
            () => prefs.value?.portfolios,
            () => {
                _reapplySessionScores();
            }
        );
    });
}
const scanning = ref(false);
const scanningAll = ref(false);
const scanAllProgress = ref<{ doneBuckets: number; totalBuckets: number }>({
    doneBuckets: 0,
    totalBuckets: 0,
});
const scanProgress = ref<{ done: number; total: number }>({ done: 0, total: 0 });
const scanStatusMessage = ref('Idle');
const scanStatusHistory = ref<Array<{ at: number; phase: string; message: string }>>([]);
const scanStartedAt = ref<number | null>(null);
const scanCompletedAt = ref<number | null>(null);
const lastScanError = ref<string | null>(null);
const lastScanCoverage = ref<{ sec: number; news: number; stock: number; poly: number }>({
    sec: 0,
    news: 0,
    stock: 0,
    poly: 0,
});
const lastScanCoverageDetail = ref<PortfolioCoverageDetail>({
    sec: { entities: 0, filings: 0, earliest: null, latest: null },
    news: { entities: 0, articles: 0, events: 0, earliest: null, latest: null },
    stock: { entities: 0, readings: 0, instruments: 0, earliest: null, latest: null },
    poly: { entities: 0, markets: 0, active: 0 },
    fred: { entities: 0, series: 0, earliest: null, latest: null },
    acs: 0,
    eventPressure: 0,
    velocity: 0,
    sanctions: 0,
    ownership: { entities: 0, links: 0 },
    fdic: 0,
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

function migratePortfolioScoring(portfolios: PortfolioDoc[], legacyWeights?: SourceFusionWeights) {
    let migrated = false;
    for (const portfolio of portfolios) {
        if (!portfolio.scoring) {
            portfolio.scoring = {
                ...structuredClone(DEFAULT_SCORING_SETTINGS),
                weights: legacyWeights
                    ? { ...legacyWeights }
                    : { ...DEFAULT_SCORING_SETTINGS.weights },
            };
            migrated = true;
        }
    }
    return migrated;
}

/** Assign ownerUserId to portfolios that pre-date the goals pivot. */
function migratePortfolioOwnership(portfolios: PortfolioDoc[], defaultUserId: string) {
    let migrated = false;
    for (const portfolio of portfolios) {
        if (!portfolio.ownerUserId) {
            portfolio.ownerUserId = defaultUserId;
            migrated = true;
        }
    }
    return migrated;
}

/**
 * Inject institutional fixture books that aren't already present. Prefs are
 * persisted, so users provisioned before the Workspace pivot won't have these
 * books on disk — this back-fills them without disturbing retail buckets.
 */
function migrateInjectInstitutionalBooks(portfolios: PortfolioDoc[]) {
    const existing = new Set(portfolios.map((p) => p.id));
    let migrated = false;
    for (const book of institutionalBooks(Date.now())) {
        if (!existing.has(book.id)) {
            portfolios.push(book);
            migrated = true;
        }
    }
    return migrated;
}

function ensurePrefs(activeUserId?: string) {
    if (!prefs.value) {
        const defaults = defaultPortfolios();
        prefs.value = useAppFeaturePrefs<PortfolioPrefsShape>('portfolio-risk', {
            portfolios: defaults,
            activePortfolioId: defaults[0]?.id ?? 'maya-retirement',
            weights: DEFAULT_WEIGHTS,
        });
        if (!prefs.value.portfolios || prefs.value.portfolios.length === 0) {
            prefs.value.portfolios = defaults;
            prefs.value.activePortfolioId = defaults[0]?.id ?? 'maya-retirement';
        }
        migratePortfolioScoring(prefs.value.portfolios, prefs.value.weights);
        migratePortfolioOwnership(prefs.value.portfolios, activeUserId ?? 'default');
        migrateInjectInstitutionalBooks(prefs.value.portfolios);
        _installSessionWatcher();
    }
    return prefs.value!;
}

export function usePortfolio(activeUserId?: globalThis.Ref<string | null>) {
    const p = ensurePrefs(activeUserId?.value ?? undefined);

    /** All portfolios owned by the active user (or all if no filter). */
    const portfolios = computed(() => {
        const uid = activeUserId?.value;
        if (!uid) return p.portfolios;
        return p.portfolios.filter((pp) => !pp.ownerUserId || pp.ownerUserId === uid);
    });

    const activePortfolio = computed(
        () =>
            portfolios.value.find((pp) => pp.id === p.activePortfolioId) ??
            portfolios.value[0] ??
            null
    );
    const activeScoring = computed({
        get: (): ScoringSettings => {
            const portfolio = activePortfolio.value;
            return portfolio?.scoring ?? structuredClone(DEFAULT_SCORING_SETTINGS);
        },
        set: (s: ScoringSettings) => {
            const portfolio = activePortfolio.value;
            if (!portfolio) return;
            const idx = p.portfolios.findIndex((pp) => pp.id === portfolio.id);
            if (idx >= 0) p.portfolios[idx].scoring = s;
        },
    });

    const weights = computed({
        get: () => activeScoring.value.weights,
        set: (w: SourceFusionWeights) => {
            activeScoring.value = { ...activeScoring.value, weights: w };
        },
    });

    // Scan state (and the portfolio-wide FRED/Polymarket macro signals) are
    // module-global. When the active portfolio changes we must reset them so a
    // freshly-selected, unscanned portfolio reads as blank instead of showing
    // the macro context left over from a different portfolio's scan.
    function resetScanGateAndMacro() {
        scanStartedAt.value = null;
        scanCompletedAt.value = null;
        scanStatusMessage.value = 'Idle';
        scanStatusHistory.value = [];
        lastScanError.value = null;
        useState<unknown[]>('macro-context-signals-fred', () => []).value = [];
        useState<unknown[]>('macro-context-signals-polymarket', () => []).value = [];
    }

    function setActivePortfolio(id: string) {
        if (p.activePortfolioId === id) return;
        p.activePortfolioId = id;
        resetScanGateAndMacro();
    }

    function createPortfolio(name: string, names: string[]): PortfolioDoc {
        const now = Date.now();
        const id = `${slugify(name)}-${now.toString(36)}`;
        const portfolio: PortfolioDoc = {
            id,
            name,
            description: '',
            createdAt: now,
            ownerUserId: activeUserId?.value ?? 'default',
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
        resetScanGateAndMacro();
        return portfolio;
    }

    function updateGoal(portfolioId: string, goal: GoalMeta | null) {
        const idx = p.portfolios.findIndex((pp) => pp.id === portfolioId);
        if (idx < 0) return;
        if (goal === null) {
            const { goal: _removed, ...rest } = p.portfolios[idx];
            p.portfolios[idx] = rest as PortfolioDoc;
        } else {
            p.portfolios[idx] = { ...p.portfolios[idx], goal };
        }
        p.portfolios = [...p.portfolios];
    }

    function createPortfolioFromEntities(
        name: string,
        entities: ResolvedEntityInput[],
        goal?: import('./usePortfolio').GoalMeta
    ): PortfolioDoc {
        const now = Date.now();
        const id = `${slugify(name)}-${now.toString(36)}`;
        const portfolio: PortfolioDoc = {
            id,
            name,
            description: '',
            createdAt: now,
            ownerUserId: activeUserId?.value ?? 'default',
            ...(goal ? { goal } : {}),
            entities: entities

                .filter((e) => e.inputName?.trim())
                .map((e) => ({
                    inputName: e.inputName.trim(),
                    resolvedName: e.resolvedName || e.inputName.trim(),
                    neid: e.neid ?? null,
                    ticker: e.ticker,
                    ...(typeof e.amountInvested === 'number'
                        ? { amountInvested: e.amountInvested }
                        : {}),
                    ...(e.purchaseDate ? { purchaseDate: e.purchaseDate } : {}),
                    addedAt: now,
                    scores: null,
                })),
        };
        p.portfolios = [...p.portfolios, portfolio];
        p.activePortfolioId = id;
        resetScanGateAndMacro();
        return portfolio;
    }

    /**
     * Create an institutional book for the agent-builder Workspace. Parallels
     * `createPortfolioFromEntities` but stamps the institutional sentinel owner
     * and `kind` so it surfaces on the Workspace surface (and never in retail
     * per-user bucket lists), and carries a mandate instead of a savings goal.
     */
    function createInstitutionalBook(
        name: string,
        entities: ResolvedEntityInput[],
        mandate?: MandateMeta
    ): PortfolioDoc {
        const now = Date.now();
        const id = `${slugify(name)}-${now.toString(36)}`;
        const portfolio: PortfolioDoc = {
            id,
            name,
            description: '',
            createdAt: now,
            ownerUserId: INSTITUTIONAL_OWNER,
            kind: 'institutional',
            ...(mandate ? { mandate } : {}),
            entities: entities
                .filter((e) => e.inputName?.trim())
                .map((e) => ({
                    inputName: e.inputName.trim(),
                    resolvedName: e.resolvedName || e.inputName.trim(),
                    neid: e.neid ?? null,
                    ticker: e.ticker,
                    addedAt: now,
                    scores: null,
                })),
        };
        p.portfolios = [...p.portfolios, portfolio];
        p.activePortfolioId = id;
        resetScanGateAndMacro();
        return portfolio;
    }

    function addResolvedEntities(portfolioId: string, entities: ResolvedEntityInput[]) {
        const idx = p.portfolios.findIndex((pp) => pp.id === portfolioId);
        if (idx < 0) return;
        const existingNames = new Set(
            p.portfolios[idx].entities.map((e) => e.inputName.toLowerCase())
        );
        const existingNeids = new Set(
            p.portfolios[idx].entities.map((e) => e.neid).filter(Boolean)
        );
        const now = Date.now();
        const fresh = entities
            .filter((e) => e.inputName?.trim())
            .filter((e) => {
                const name = e.inputName.trim().toLowerCase();
                if (existingNames.has(name)) return false;
                if (e.neid && existingNeids.has(e.neid)) return false;
                return true;
            })
            .map<PortfolioEntity>((e) => ({
                inputName: e.inputName.trim(),
                resolvedName: e.resolvedName || e.inputName.trim(),
                neid: e.neid ?? null,
                ticker: e.ticker,
                ...(typeof e.amountInvested === 'number'
                    ? { amountInvested: e.amountInvested }
                    : {}),
                ...(e.purchaseDate ? { purchaseDate: e.purchaseDate } : {}),
                addedAt: now,
                scores: null,
            }));
        p.portfolios[idx].entities = [...p.portfolios[idx].entities, ...fresh];
    }

    function deletePortfolio(id: string) {
        const wasActive = p.activePortfolioId === id;
        p.portfolios = p.portfolios.filter((pp) => pp.id !== id);
        if (wasActive) {
            p.activePortfolioId = p.portfolios[0]?.id ?? null;
            resetScanGateAndMacro();
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
        scanStartedAt.value = Date.now();
        scanCompletedAt.value = null;
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
                    scoring: activeScoring.value,
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
                if (event === 'fast-row') {
                    const idx2 = data?.index;
                    if (typeof idx2 === 'number' && ents[idx2]) {
                        const current = ents[idx2];
                        if (data.neid) current.neid = data.neid;
                        if (data.resolvedName) current.resolvedName = data.resolvedName;
                        p.portfolios[idx].entities = [...ents];
                    }
                } else if (event === 'entity') {
                    const payload = data as ScanEntityEventPayload;
                    const current = ents[payload.index];
                    if (!current) continue;
                    current.neid = payload.entity.neid;
                    current.resolvedName = payload.entity.resolvedName || current.resolvedName;
                    current.resolutionError = payload.entity.resolutionError;
                    current.scores = payload.entity.scores;
                    current.monitor = payload.entity.monitor;
                    current.drivers = payload.entity.drivers;
                    current.conflicts = payload.entity.conflicts;
                    current.confidenceLevel = payload.entity.confidenceLevel;
                    current.coverage = payload.entity.coverage;
                    current.coverageDetail = payload.entity.coverageDetail;
                    current.lensDetails = payload.entity.lensDetails;
                    current.signalAgreement = payload.entity.monitor?.signalAgreement;
                    current.signalSummary = payload.entity.monitor?.signalSummary;
                    p.portfolios[idx].entities = [...ents];
                    _cacheEntityScore(portfolioId, current);
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
                    if (data?.coverageDetail) {
                        lastScanCoverageDetail.value = data.coverageDetail;
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
                        current.monitor = entityOut.monitor ?? current.monitor;
                        current.drivers = entityOut.drivers ?? current.drivers;
                        current.conflicts = entityOut.conflicts ?? current.conflicts;
                        current.confidenceLevel =
                            entityOut.confidenceLevel ?? current.confidenceLevel;
                        current.coverage = entityOut.coverage ?? current.coverage;
                        current.coverageDetail = entityOut.coverageDetail ?? current.coverageDetail;
                        current.lensDetails = entityOut.lensDetails ?? current.lensDetails;
                        current.signalAgreement =
                            entityOut.monitor?.signalAgreement ?? current.signalAgreement;
                        current.signalSummary =
                            entityOut.monitor?.signalSummary ?? current.signalSummary;
                        if (entityOut.resolutionError) {
                            failedNames.push(
                                entityOut.resolvedName ||
                                    entityOut.inputName ||
                                    `row ${entityIndex + 1}`
                            );
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

                    // Mark scan complete now so the UI unlocks immediately; the
                    // stream stays open while the server pre-warms profile caches
                    // and builds the relationship universe (delivered via a
                    // separate `universe` event).
                    scanning.value = false;
                    scanCompletedAt.value = Date.now();

                    // Fetch stock profiles for each entity. This warms the
                    // server-side cache AND writes price data back into the
                    // entity monitor so the $ / 30d table columns populate
                    // without a separate request.
                    const stockEntities = ents.filter((e) => e.neid);
                    for (const stockEntity of stockEntities) {
                        fetch(
                            `/api/portfolios/${portfolioId}/entity/${stockEntity.neid}/stock?name=${encodeURIComponent(stockEntity.resolvedName)}`
                        )
                            .then((res) => (res.ok ? res.json() : null))
                            .then((stockData: any) => {
                                if (!stockData || !stockEntity.monitor) return;
                                stockEntity.monitor = {
                                    ...stockEntity.monitor,
                                    stockChange30dPercent:
                                        stockData.returnPct ??
                                        stockEntity.monitor.stockChange30dPercent,
                                    stockChangePercent:
                                        stockData.analytics?.roc10 ??
                                        stockEntity.monitor.stockChangePercent,
                                    stockTrendSignal:
                                        stockData.analytics?.trend ??
                                        stockEntity.monitor.stockTrendSignal,
                                };
                                p.portfolios[idx].entities = [...ents];
                            })
                            .catch(() => undefined);
                    }

                    // Fire-and-forget per-entity AI headline summaries so they
                    // don't block the scan itself. Results trickle into
                    // entity.monitor.headlineSummary as they land.
                    const summaryEntities = ents
                        .filter((e) => e.neid)
                        .map((e) => ({ neid: e.neid as string, resolvedName: e.resolvedName }));
                    if (summaryEntities.length > 0) {
                        fetch('/api/news-summary/generate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ entities: summaryEntities }),
                        })
                            .then((res) => (res.ok ? res.json() : null))
                            .then(
                                (
                                    payload: {
                                        summaries?: Record<string, string | null>;
                                    } | null
                                ) => {
                                    if (!payload?.summaries) return;
                                    const summaries = payload.summaries;
                                    let changed = false;
                                    for (const entity of ents) {
                                        if (!entity.neid) continue;
                                        const blurb = summaries[entity.neid];
                                        if (
                                            typeof blurb === 'string' &&
                                            blurb.trim() &&
                                            entity.monitor
                                        ) {
                                            entity.monitor = {
                                                ...entity.monitor,
                                                headlineSummary: blurb.trim(),
                                            };
                                            changed = true;
                                        }
                                    }
                                    if (changed) {
                                        p.portfolios[idx].entities = [...ents];
                                    }
                                }
                            )
                            .catch(() => undefined);
                    }
                } else if (event === 'universe') {
                    // Relationship universe built server-side after done — prime
                    // client cache so the Relationship tab is a near-instant hit.
                    if (data?.universe) {
                        primeRelationshipCache(portfolioId, data.universe as RelationshipUniverse);
                    }
                } else if (event === 'error') {
                    throw new Error(data?.message || 'Scan pipeline failed');
                }
            }
            // Holdings are now resolved + scored — value them through time.
            void valuePortfolio(portfolioId);
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
            // Safety net: the done handler sets these immediately, but if the
            // stream closes without a done event (network drop, error) we still
            // need to clear the spinner.
            if (scanning.value) scanning.value = false;
            if (!scanCompletedAt.value) scanCompletedAt.value = Date.now();
            if (!lastScanError.value && scanStatusMessage.value === 'Idle') {
                scanStatusMessage.value = 'Scan complete.';
            }
        }
    }

    /**
     * Price each holding "through time" from its cost-basis dollars + purchase
     * date via the server valuation endpoint, then attach the result to each
     * entity. Best-effort: failures leave existing valuations untouched.
     */
    async function valuePortfolio(portfolioId: string) {
        const idx = p.portfolios.findIndex((pp) => pp.id === portfolioId);
        if (idx < 0) return;
        const ents = p.portfolios[idx].entities;
        const holdings = ents.map((entity) => ({
            inputName: entity.inputName,
            neid: entity.neid,
            purchaseDate: entity.purchaseDate ?? null,
            amountInvested:
                typeof entity.amountInvested === 'number' ? entity.amountInvested : null,
        }));
        // Nothing to value if no holding carries a cost basis.
        if (!holdings.some((h) => typeof h.amountInvested === 'number')) return;
        try {
            const res = await $fetch<{ valuations: HoldingValuation[] }>(
                '/api/holdings/valuation',
                {
                    method: 'POST',
                    body: { portfolioId, holdings },
                    timeout: 120_000,
                }
            );
            const valuations = Array.isArray(res?.valuations) ? res.valuations : [];
            valuations.forEach((valuation, i) => {
                const current = ents[i];
                if (!current) return;
                current.valuation = valuation;
            });
            p.portfolios[idx].entities = [...ents];
        } catch (e) {
            console.warn('[valuePortfolio] valuation request failed', e);
        }
    }

    /**
     * Scan every bucket owned by the active user sequentially.
     * Exposes module-level `scanningAll` / `scanAllProgress` for the global header.
     */
    async function scanActiveUserPortfolios(opts: { force?: boolean } = {}) {
        const buckets = portfolios.value;
        if (buckets.length === 0) return;
        scanningAll.value = true;
        scanAllProgress.value = { doneBuckets: 0, totalBuckets: buckets.length };
        for (const bucket of buckets) {
            await scanPortfolio(bucket.id, opts);
            scanAllProgress.value = {
                doneBuckets: scanAllProgress.value.doneBuckets + 1,
                totalBuckets: buckets.length,
            };
        }
        scanningAll.value = false;
    }

    /** True when at least one entity across the active user's buckets has been scored. */
    const hasAnyScored = computed(() =>
        portfolios.value.some((bucket) => bucket.entities.some((e) => e.scores))
    );

    /**
     * Shared post-analysis summary consumed by Overview, Relationships, Ask, and AppHeader.
     * All pages should read from this instead of computing their own state.
     */
    const analysisSummary = computed(() => {
        const buckets = portfolios.value;
        let totalHoldings = 0;
        let scoredHoldings = 0;
        let unresolvedHoldings = 0;
        let needsAttention = 0;
        let analyzedBucketCount = 0;
        let relationshipReadyCount = 0;
        let worstScore = 0;
        let worstBucketId: string | null = null;
        let worstBucketName: string | null = null;

        for (const bucket of buckets) {
            const bucketAnalyzed = bucket.entities.some((e) => e.scores != null);
            if (bucketAnalyzed) analyzedBucketCount++;
            for (const entity of bucket.entities) {
                totalHoldings++;
                if (entity.scores) {
                    scoredHoldings++;
                    if ((entity.scores.fused ?? 0) > worstScore) {
                        worstScore = entity.scores.fused ?? 0;
                        worstBucketId = bucket.id;
                        worstBucketName = bucket.name;
                    }
                    if ((entity.scores.fused ?? 0) >= 60) needsAttention++;
                }
                if (entity.resolutionError) unresolvedHoldings++;
                if (entity.neid) relationshipReadyCount++;
            }
        }

        const isComplete =
            analyzedBucketCount === buckets.length && buckets.length > 0 && scoredHoldings > 0;

        return {
            totalBuckets: buckets.length,
            analyzedBuckets: analyzedBucketCount,
            totalHoldings,
            scoredHoldings,
            unresolvedHoldings,
            needsAttention,
            relationshipReadyCount,
            worstBucketId,
            worstBucketName,
            worstScore,
            isComplete,
        };
    });

    return {
        portfolios,
        activePortfolio,
        activeScoring,
        weights,
        scanning: computed(() => scanning.value),
        scanningAll: computed(() => scanningAll.value),
        scanAllProgress: computed(() => scanAllProgress.value),
        hasAnyScored,
        analysisSummary,
        scanProgress: computed(() => scanProgress.value),
        scanStatusMessage: computed(() => scanStatusMessage.value),
        scanStatusHistory: computed(() => scanStatusHistory.value),
        scanStartedAt: computed(() => scanStartedAt.value),
        scanCompletedAt: computed(() => scanCompletedAt.value),
        lastScanError: computed(() => lastScanError.value),
        lastScanCoverage: computed(() => lastScanCoverage.value),
        lastScanCoverageDetail: computed(() => lastScanCoverageDetail.value),
        setActivePortfolio,
        createPortfolio,
        createPortfolioFromEntities,
        createInstitutionalBook,
        deletePortfolio,
        addEntities,
        addResolvedEntities,
        removeEntity,
        updateGoal,
        saveAssessment,
        scanPortfolio,
        scanActiveUserPortfolios,
        valuePortfolio,
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
