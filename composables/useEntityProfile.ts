/**
 * Entity Deep Dive composable.
 *
 * Loads a single entity from Elemental, hydrates relationships, events, and
 * derives multi-source risk drivers using the seeded scoring helpers. The
 * caller passes the NEID (resolved from the portfolio table).
 */

import { computed, ref, watch } from 'vue';

import { buildGatewayUrl, gatewayHeaders } from '~/utils/elementalHelpers';
import {
    type EntityRiskScore,
    type SourceFusionWeights,
    confidence,
    deriveDrivers,
    deriveTier,
    detectConflicts,
    fuseScore,
    seededEntityScore,
} from './useFusedScoring';

export interface EntityProperty {
    pid: number;
    name: string;
    value: string | number | null;
}

export interface RelatedEntityRef {
    neid: string;
    name: string;
    relationship: string;
}

export interface EntityProfileData {
    neid: string;
    name: string;
    properties: EntityProperty[];
    relationships: {
        companies: RelatedEntityRef[];
        people: RelatedEntityRef[];
        instruments: RelatedEntityRef[];
        locations: RelatedEntityRef[];
    };
    events: Array<{
        date: string;
        category: string;
        title: string;
        severity: 'low' | 'medium' | 'high';
    }>;
    scores: EntityRiskScore;
    drivers: ReturnType<typeof deriveDrivers>;
    conflicts: ReturnType<typeof detectConflicts>;
    confidenceLevel: ReturnType<typeof confidence>;
}

const cache = new Map<string, EntityProfileData>();

export function useEntityProfile(neid: import('vue').Ref<string | null>) {
    const data = ref<EntityProfileData | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function load(forNeid: string, weights: SourceFusionWeights) {
        const cacheKey = `${forNeid}|${JSON.stringify(weights)}`;
        if (cache.has(cacheKey)) {
            data.value = cache.get(cacheKey)!;
            return;
        }
        loading.value = true;
        error.value = null;
        try {
            // Entity name
            let name = forNeid;
            try {
                const nameRes = await $fetch<{ name: string }>(
                    buildGatewayUrl(`entities/${forNeid}/name`),
                    {
                        headers: gatewayHeaders(),
                    }
                );
                name = nameRes?.name || forNeid;
            } catch {
                // Name lookup is best-effort.
            }

            const properties: EntityProperty[] = [];
            const relationships: EntityProfileData['relationships'] = {
                companies: [],
                people: [],
                instruments: [],
                locations: [],
            };
            // Synthesize events + relationship samples from the seed for the
            // demo. These would otherwise come from the History Agent's
            // multi-source pull.
            synthesizeRelationships(forNeid, name, relationships);
            const events = synthesizeEvents(forNeid);

            const subs = seededEntityScore(forNeid);
            const fused = fuseScore(subs, weights);
            const scores: EntityRiskScore = {
                ...subs,
                fused,
                tier: deriveTier(fused),
                updatedAt: Date.now(),
            };
            const drivers = deriveDrivers(forNeid, subs);
            const conflicts = detectConflicts(subs);
            const confidenceLevel = confidence(subs);

            const profile: EntityProfileData = {
                neid: forNeid,
                name,
                properties,
                relationships,
                events,
                scores,
                drivers,
                conflicts,
                confidenceLevel,
            };
            cache.set(cacheKey, profile);
            data.value = profile;
        } catch (e: any) {
            error.value = e?.message || 'Failed to load entity profile';
        } finally {
            loading.value = false;
        }
    }

    watch(
        neid,
        async (val) => {
            if (!val) {
                data.value = null;
                return;
            }
            const { weights } = usePortfolio();
            await load(val, weights.value);
        },
        { immediate: true }
    );

    function refresh(weights: SourceFusionWeights) {
        if (!neid.value) return;
        cache.delete(`${neid.value}|${JSON.stringify(weights)}`);
        return load(neid.value, weights);
    }

    return {
        data: computed(() => data.value),
        loading: computed(() => loading.value),
        error: computed(() => error.value),
        refresh,
    };
}

const COMPANY_NEIGHBORS = [
    'Atlas Holdings',
    'Crescent Industrials',
    'Harborline Group',
    'Northwind Partners',
    'Sierra Manufacturing',
    'Vertex Logistics',
    'Patriot Brands',
    'Lockstep Capital',
];
const PEOPLE_NEIGHBORS = [
    'Margaret Cole',
    'Avery Holland',
    'Jordan Reyes',
    'Sarah Liang',
    'Damian Ortiz',
    'Priya Shah',
    'Henrik Larsen',
    'Imani Brown',
];
const INSTRUMENTS = [
    'Senior Secured Term Loan',
    '2029 Senior Notes',
    'Revolving Credit Facility',
    'Convertible Notes 2028',
    '2031 Unsecured Notes',
];
const LOCATIONS = [
    'Dallas, TX',
    'Charlotte, NC',
    'Chicago, IL',
    'Atlanta, GA',
    'Houston, TX',
    'Boston, MA',
];

function synthesizeRelationships(
    seed: string,
    name: string,
    out: EntityProfileData['relationships']
) {
    const seedHash = (s: string) => {
        let h = 0;
        for (const c of s) h = (h * 33 + c.charCodeAt(0)) >>> 0;
        return h;
    };
    const base = seedHash(seed + name);
    function pick<T>(arr: T[], n: number, offset: number): T[] {
        const out: T[] = [];
        const used = new Set<number>();
        for (let i = 0; i < n && i < arr.length; i++) {
            const idx = (base + offset + i * 17) % arr.length;
            if (used.has(idx)) continue;
            used.add(idx);
            out.push(arr[idx]);
        }
        return out;
    }

    out.companies = pick(COMPANY_NEIGHBORS, 4, 1).map((n, i) => ({
        neid: `synthetic-co-${i}`,
        name: n,
        relationship: i === 0 ? 'parent_of' : i === 1 ? 'subsidiary_of' : 'compensation_peer_of',
    }));
    out.people = pick(PEOPLE_NEIGHBORS, 4, 2).map((n, i) => ({
        neid: `synthetic-pp-${i}`,
        name: n,
        relationship: i === 0 ? 'officer_of' : i === 1 ? 'director_of' : 'beneficial_owner_of',
    }));
    out.instruments = pick(INSTRUMENTS, 3, 3).map((n, i) => ({
        neid: `synthetic-ix-${i}`,
        name: n,
        relationship: 'issued_by',
    }));
    out.locations = pick(LOCATIONS, 2, 4).map((n, i) => ({
        neid: `synthetic-lc-${i}`,
        name: n,
        relationship: 'located_at',
    }));
}

const EVENT_BANK = [
    {
        category: '8-K Item 5.02',
        title: 'Departure of principal officer',
        severity: 'high' as const,
    },
    {
        category: '8-K Item 4.01',
        title: 'Change of certifying accountant',
        severity: 'high' as const,
    },
    {
        category: '8-K Item 1.01',
        title: 'Entry into material definitive agreement',
        severity: 'medium' as const,
    },
    {
        category: '8-K Item 2.04',
        title: 'Triggering event under direct financial obligation',
        severity: 'high' as const,
    },
    { category: '10-Q', title: 'Quarterly report filed', severity: 'low' as const },
    { category: '10-K', title: 'Annual report filed', severity: 'low' as const },
    { category: '8-K Item 7.01', title: 'Regulation FD disclosure', severity: 'low' as const },
    { category: '8-K Item 8.01', title: 'Other events disclosed', severity: 'medium' as const },
];

function synthesizeEvents(seed: string) {
    const hash = (s: string, salt: string) => {
        let h = 0;
        for (const c of `${s}|${salt}`) h = (h * 33 + c.charCodeAt(0)) >>> 0;
        return h;
    };
    const n = 4 + (hash(seed, 'count') % 3);
    const out: EntityProfileData['events'] = [];
    const today = Date.now();
    for (let i = 0; i < n; i++) {
        const ev = EVENT_BANK[(hash(seed, `e${i}`) % EVENT_BANK.length) | 0];
        const daysAgo = (hash(seed, `d${i}`) % 220) + 5;
        const date = new Date(today - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        out.push({ date, ...ev });
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}
