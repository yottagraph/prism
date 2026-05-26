import type { PortfolioPattern } from './relationships';
import { detectPatterns as detectFromUniverse } from './relationships';

/**
 * Explicit pattern detector module used by Relationship Explorer routes.
 * Keeps the six PRD patterns in one place.
 */
export function detectPortfolioPatterns(
    universe: Parameters<typeof detectFromUniverse>[0]
): PortfolioPattern[] {
    return detectFromUniverse(universe);
}
