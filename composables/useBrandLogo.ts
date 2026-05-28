import { computed, type ComputedRef } from 'vue';

import { useLovelaceTheme } from './useLovelaceTheme';

/**
 * Lovelace wordmark variants served from `public/`.
 *
 * - `wht` — white wordmark + light-gray mark. Use on dark surfaces.
 * - `blk` — black wordmark + dark mark. Use on light surfaces.
 * - `grn` — black wordmark inside a green mark. Reserved for accent/marketing.
 */
const LOGO_PATHS = {
    wht: '/LL-logo-full-wht.svg',
    blk: '/LL-logo-full-blk.svg',
    grn: '/LL-logo-full-grn.svg',
} as const;

export type BrandLogoVariant = keyof typeof LOGO_PATHS;

export interface UseBrandLogoResult {
    /** Path to the wordmark that best fits the active theme mode. */
    logoSrc: ComputedRef<string>;
    /** Variant key (`'wht'` | `'blk'` | `'grn'`) of `logoSrc`. */
    logoVariant: ComputedRef<BrandLogoVariant>;
    /** Look up a specific variant by name when theme-awareness isn't wanted. */
    getLogoSrc: (variant: BrandLogoVariant) => string;
}

/**
 * Returns the Lovelace wordmark that pairs with the active theme — white
 * on dark themes, black on light themes. Call this anywhere a Lovelace
 * logo is rendered so it doesn't disappear against light surfaces.
 */
export const useBrandLogo = (): UseBrandLogoResult => {
    const { isDark } = useLovelaceTheme();

    const logoVariant = computed<BrandLogoVariant>(() => (isDark.value ? 'wht' : 'blk'));
    const logoSrc = computed(() => LOGO_PATHS[logoVariant.value]);

    return {
        logoSrc,
        logoVariant,
        getLogoSrc: (variant: BrandLogoVariant) => LOGO_PATHS[variant],
    };
};
