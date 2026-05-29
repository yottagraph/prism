/**
 * Maps industry/sector strings (as returned by Elemental) to macro-factor
 * sensitivity buckets. Used by useMacroRegime to compute portfolio tilt.
 *
 * Bucket definitions:
 *   rate_sensitive  — strongly moves with interest rate changes (banks, REITs, utilities)
 *   defensive       — low-beta, essential-goods businesses (staples, healthcare, utilities)
 *   cyclical        — demand tracks economic cycle (industrials, discretionary, materials)
 *   growth_tech     — long-duration, rate-sensitive growth (technology, communications)
 *   energy          — commodity-price driven (oil & gas, mining, renewables)
 *   unclassified    — catch-all for anything not matched
 *
 * Note: utilities appear in both rate_sensitive and defensive; the primary bucket
 * is rate_sensitive since that's the dominant macro factor relationship.
 */

export type MacroFactorBucket =
    | 'rate_sensitive'
    | 'defensive'
    | 'cyclical'
    | 'growth_tech'
    | 'energy'
    | 'unclassified';

/** Ordered matching rules: first pattern match wins. */
const SECTOR_RULES: Array<{ pattern: RegExp; bucket: MacroFactorBucket }> = [
    // Rate-sensitive
    {
        pattern:
            /\b(bank|banking|financial|finance|insurance|reit|real estate|mortgage|broker|invest)/i,
        bucket: 'rate_sensitive',
    },
    {
        pattern: /\b(utility|utilities|electric|water|gas distribution|telecom|telecommunication)/i,
        bucket: 'rate_sensitive',
    },

    // Growth / technology
    {
        pattern:
            /\b(tech|software|semiconductor|hardware|computer|electronic|internet|cloud|saas|ai|data|digital|cyber|platform)/i,
        bucket: 'growth_tech',
    },
    {
        pattern: /\b(communication|media|streaming|social|gaming|entertainment(?! staple))/i,
        bucket: 'growth_tech',
    },

    // Defensive
    {
        pattern:
            /\b(healthcare|health care|pharmaceutical|pharma|biotech|biolog|medical|hospital|drug)/i,
        bucket: 'defensive',
    },
    {
        pattern: /\b(consumer staple|food|beverage|household|personal care|tobacco|grocery)/i,
        bucket: 'defensive',
    },

    // Energy
    {
        pattern:
            /\b(energy|oil|gas|petroleum|mining|metals|coal|refin|exploration|drilling|renewable)/i,
        bucket: 'energy',
    },

    // Cyclical
    {
        pattern:
            /\b(industrial|manufactur|aerospace|defense|transport|trucking|logistic|shipping|airline|rail|construction|chemical|material|machinery|equipment|steel|apparel|textile|paper|furniture|packaging|auto|vehicle|retail|discretionary|hotel|restaurant|leisure|travel)/i,
        bucket: 'cyclical',
    },

    // Broader financial catch (after the first rule already covers banks)
    { pattern: /\bfinancial/i, bucket: 'rate_sensitive' },
];

const BUCKET_LABEL: Record<MacroFactorBucket, string> = {
    rate_sensitive: 'Rate-Sensitive',
    defensive: 'Defensive',
    cyclical: 'Cyclical',
    growth_tech: 'Growth / Tech',
    energy: 'Energy',
    unclassified: 'Other',
};

const BUCKET_ICON: Record<MacroFactorBucket, string> = {
    rate_sensitive: 'mdi-bank-outline',
    defensive: 'mdi-shield-outline',
    cyclical: 'mdi-cog-outline',
    growth_tech: 'mdi-rocket-launch-outline',
    energy: 'mdi-lightning-bolt-outline',
    unclassified: 'mdi-dots-horizontal',
};

export function classifySector(sector: string | null | undefined): MacroFactorBucket {
    if (!sector) return 'unclassified';
    for (const rule of SECTOR_RULES) {
        if (rule.pattern.test(sector)) return rule.bucket;
    }
    return 'unclassified';
}

export function bucketLabel(bucket: MacroFactorBucket): string {
    return BUCKET_LABEL[bucket];
}

export function bucketIcon(bucket: MacroFactorBucket): string {
    return BUCKET_ICON[bucket];
}

export interface SectorTilt {
    bucket: MacroFactorBucket;
    label: string;
    icon: string;
    count: number;
}

/**
 * Given a list of sector strings (one per entity, nulls allowed),
 * returns a sorted tally of how many entities fall in each bucket.
 * Buckets with zero entities are omitted.
 */
export function computeSectorTilt(sectors: (string | null | undefined)[]): SectorTilt[] {
    const counts: Partial<Record<MacroFactorBucket, number>> = {};
    for (const s of sectors) {
        const b = classifySector(s);
        counts[b] = (counts[b] ?? 0) + 1;
    }
    return (Object.keys(counts) as MacroFactorBucket[])
        .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0))
        .map((bucket) => ({
            bucket,
            label: bucketLabel(bucket),
            icon: bucketIcon(bucket),
            count: counts[bucket] ?? 0,
        }));
}
