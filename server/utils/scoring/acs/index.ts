import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from '../cache';
import type { ContextPackage } from '../contextPackage';
import { getEntityName, getSchema } from '../elemental';
import { getFlavorEntities } from '../galaxy';
import type { LensDetail } from '../types';
import { computeAcsComposite } from './composite';
import { runDirectScreening, type ScreeningListEntry } from './directScreening';
import { traverseOwnershipGraph } from './graphTraversal';
import { evaluateFoci, evaluateJurisdictionExposure } from './jurisdiction';

export interface AcsResult {
    score: number;
    hasRealData: boolean;
    detail: LensDetail;
    screeningSourceEmpty?: boolean;
}

let screeningListCache: {
    entries: ScreeningListEntry[];
    expiresAt: number;
} | null = null;
const SCREENING_LIST_TTL_MS = 7 * 24 * 60 * 60_000;
let screeningListLoggedOnce = false;

export async function loadScreeningListFromElemental(
    event: H3Event
): Promise<ScreeningListEntry[]> {
    if (screeningListCache && screeningListCache.expiresAt > Date.now()) {
        return screeningListCache.entries;
    }

    try {
        const schema = await getSchema(event);
        const screeningFlavor = schema.flavors.find(
            (f) =>
                f.name.toLowerCase().includes('screening') ||
                f.name.toLowerCase().includes('sanctions') ||
                f.name.toLowerCase().includes('watchlist')
        );
        if (!screeningFlavor) {
            if (!screeningListLoggedOnce) {
                console.log(
                    '[acs] No screening-list flavor found in Elemental schema — direct screening will be skipped'
                );
                screeningListLoggedOnce = true;
            }
            screeningListCache = { entries: [], expiresAt: Date.now() + SCREENING_LIST_TTL_MS };
            return [];
        }

        const entityIds = await getFlavorEntities(screeningFlavor.name);
        if (!entityIds.length) {
            screeningListCache = { entries: [], expiresAt: Date.now() + SCREENING_LIST_TTL_MS };
            return [];
        }

        const entries: ScreeningListEntry[] = entityIds.map((neid) => ({
            name: neid,
            listSource: 'custom' as const,
        }));

        screeningListCache = { entries, expiresAt: Date.now() + SCREENING_LIST_TTL_MS };
        return entries;
    } catch (error) {
        console.warn('[acs] Failed to load screening list from Elemental', error);
        screeningListCache = { entries: [], expiresAt: Date.now() + 5 * 60_000 };
        return [];
    }
}

export async function computeAcsScore(
    event: H3Event,
    portfolioId: string,
    neid: string,
    ctx?: ContextPackage
): Promise<AcsResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'acs');
    const cached = await readScoringCache<AcsResult>(event, cacheKey);
    if (cached) return cached;

    const screeningList = await loadScreeningListFromElemental(event);
    const screeningSourceEmpty = screeningList.length === 0;

    const name = await getEntityName(neid, event);
    const directMatches = runDirectScreening(name, [], screeningList);
    const traversed = await traverseOwnershipGraph(event, neid, 3, ctx);
    const pathMatches = traversed.flatMap((node) =>
        runDirectScreening(node.name, [], screeningList)
    );
    const jurisdictionContributions = evaluateJurisdictionExposure(traversed);
    const foci = evaluateFoci(traversed);
    const composite = computeAcsComposite({
        directMatches,
        pathMatches,
        traversedNodes: traversed,
        jurisdictionContributions,
        foci,
    });

    const out: AcsResult = {
        score: composite.score,
        hasRealData: composite.hasRealData,
        screeningSourceEmpty,
        detail: {
            metrics: [
                { label: 'Risk level', value: composite.riskLevel },
                {
                    label: 'Confidence',
                    value: `${composite.confidence} (${composite.confidenceLevel})`,
                },
                ...(screeningSourceEmpty
                    ? [{ label: 'Screening source', value: 'No screening source configured' }]
                    : []),
                ...composite.detail.metrics,
            ],
            findings:
                composite.detail.findings.length > 0
                    ? composite.detail.findings
                    : screeningSourceEmpty
                      ? [
                            {
                                text: 'No screening source configured. Direct and path screening were skipped. Only graph traversal, jurisdiction exposure, and FOCI analysis are active.',
                                citations: [],
                            },
                        ]
                      : [
                            {
                                text: 'No direct or ownership-path screening hits were found.',
                                citations: [],
                            },
                        ],
        },
    };
    await writeScoringCache(event, cacheKey, out, 7 * 24 * 60 * 60);
    return out;
}
