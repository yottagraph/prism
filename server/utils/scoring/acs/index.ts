import type { H3Event } from 'h3';

import { makeCacheKey, readScoringCache, writeScoringCache } from '../cache';
import type { ContextPackage } from '../contextPackage';
import {
    extractPropertyFacts,
    getEntityName,
    getPropertyValues,
    getSchema,
    normalizePidMap,
} from '../elemental';
import { getFlavorEntities } from '../galaxy';
import { acsBundle, entitySanctions, findexFor } from '../prism';
import type { AcsThresholds, EvidenceItem, LensDetail } from '../types';
import { computeAcsComposite } from './composite';
import { runDirectScreening, type ScreeningListEntry } from './directScreening';
import { traverseOwnershipGraph } from './graphTraversal';
import { evaluateFoci, evaluateJurisdictionExposure } from './jurisdiction';

export interface AcsJurisdictionHit {
    name: string;
    jurisdiction: string | null;
    tier: 1 | 2 | 3 | 4;
    hopDistance: number;
}

export interface AcsFociData {
    foreignOwnershipPct: number;
    foreignBoardPct: number;
    foreignOfficerPct: number;
    overallRisk: 'critical' | 'high' | 'medium' | 'low';
}

export interface AcsResult {
    score: number;
    hasRealData: boolean;
    detail: LensDetail;
    screeningSourceEmpty?: boolean;
    /** Present only when the entity is directly flagged on a sanctions source. */
    sanctions?: SanctionsDetail;
    directMatchCount: number;
    pathMatchCount: number;
    graphNodesScreened: number;
    foci: AcsFociData;
    jurisdictionHits: AcsJurisdictionHit[];
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

export interface SanctionsDetail {
    sanctioned: boolean;
    /** Issuing authority / program names (resolved from the program reference). */
    programs: string[];
    topics: string[];
    sectors: string[];
    startDate: string | null;
    sourceUrls: string[];
    listIds: string[];
}

/**
 * Read the OpenSanctions / OFAC / CSL screening facts attached directly to the
 * entity. These are the same properties that drive the "Sanctions flagged"
 * coverage count, so when an entity is flagged we surface WHY here in ACS:
 * the issuing authority, topic, sector, listing date, and source URL.
 *
 * `sanction_program` is a reference (data_nindex) to the issuing-authority
 * entity, so its raw value is a numeric id that we resolve to a display name.
 */
async function fetchEntitySanctions(event: H3Event, neid: string): Promise<SanctionsDetail> {
    const empty: SanctionsDetail = {
        sanctioned: false,
        programs: [],
        topics: [],
        sectors: [],
        startDate: null,
        sourceUrls: [],
        listIds: [],
    };
    try {
        const bundle = await entitySanctions([neid]).catch(() => null);
        const row =
            bundle?.organizations?.find((r) => r.neid === neid) ?? bundle?.organizations?.[0];
        if (row) {
            return {
                sanctioned: true,
                programs: row.programs ?? [],
                topics: row.topics ?? [],
                sectors: row.sectors ?? [],
                startDate: row.start_date ?? null,
                sourceUrls: [],
                listIds: row.list_ids ?? [],
            };
        }

        const schema = await getSchema(event);
        const pid = normalizePidMap(schema);
        const flagPids = ['sanctioned', 'sanctions_topic', 'sanctions_id', 'sanction_program']
            .map((n) => pid[n])
            .filter((p): p is string => typeof p === 'string' && p.length > 0);
        if (!flagPids.length) return empty;

        const wanted = {
            topic: pid['sanctions_topic'],
            id: pid['sanctions_id'],
            program: pid['sanction_program'],
            startDate: pid['sanction_start_date'],
            sector: pid['sanction_sector'],
            sourceUrl: pid['sanction_source_url'],
        };
        const allPids = [
            ...new Set(
                Object.values(wanted)
                    .concat(pid['sanctioned'])
                    .filter((p): p is string => typeof p === 'string' && p.length > 0)
            ),
        ];

        const values = await getPropertyValues([neid], allPids, true, event);
        const strings = (p?: string): string[] =>
            p
                ? extractPropertyFacts(values, p)
                      .map((f) => (typeof f.value === 'string' ? f.value.trim() : String(f.value)))
                      .filter((v) => v.length > 0)
                : [];

        const topics = [...new Set(strings(wanted.topic))];
        const listIds = [...new Set(strings(wanted.id))];
        const sectors = [...new Set(strings(wanted.sector))];
        const sourceUrls = [...new Set(strings(wanted.sourceUrl))];
        const startDates = strings(wanted.startDate).sort();
        const sanctioned =
            topics.length > 0 ||
            listIds.length > 0 ||
            strings(pid['sanctioned']).length > 0 ||
            strings(wanted.program).length > 0;

        if (!sanctioned) return empty;

        // Resolve the program references (numeric ids) to authority names.
        const programRefs = [...new Set(strings(wanted.program))].slice(0, 4);
        const programs = (
            await Promise.all(
                programRefs.map(async (raw) => {
                    try {
                        return await getEntityName(raw.padStart(20, '0'), event);
                    } catch {
                        return '';
                    }
                })
            )
        ).filter((n): n is string => typeof n === 'string' && n.length > 0);

        return {
            sanctioned: true,
            programs: [...new Set(programs)],
            topics,
            sectors,
            startDate: startDates[0] ? startDates[0].slice(0, 10) : null,
            sourceUrls,
            listIds,
        };
    } catch (error) {
        console.warn('[acs] sanctions fetch failed', error);
        return empty;
    }
}

/** Build human-readable ACS findings/metrics from a sanctions hit. */
function buildSanctionsEvidence(s: SanctionsDetail): {
    metrics: LensDetail['metrics'];
    finding: EvidenceItem;
} {
    const authority = s.programs.length ? s.programs.join(', ') : 'an external screening list';
    const parts: string[] = [
        `Entity is directly listed on a sanctions/screening source via ${authority}.`,
    ];
    if (s.sectors.length) parts.push(`Sector: ${s.sectors.join(', ')}.`);
    if (s.startDate) parts.push(`Listed since ${s.startDate}.`);
    if (s.listIds.length) parts.push(`Reference: ${s.listIds.slice(0, 2).join(', ')}.`);

    const metrics: LensDetail['metrics'] = [{ label: 'Sanctions', value: 'LISTED' }];
    if (s.programs.length)
        metrics.push({ label: 'Issuing authority', value: s.programs.join(', ') });
    if (s.sectors.length) metrics.push({ label: 'Sanctioned sector', value: s.sectors.join(', ') });
    if (s.startDate) metrics.push({ label: 'Listed since', value: s.startDate });

    return {
        metrics,
        finding: {
            text: parts.join(' '),
            date: s.startDate ?? undefined,
            citations: s.sourceUrls.slice(0, 2).map((url) => ({
                source: s.programs[0] || 'Sanctions list',
                url,
                title: s.programs[0] ? `${s.programs[0]} listing` : 'Sanctions listing',
                date: s.startDate ?? undefined,
            })),
        },
    };
}

export async function computeAcsScore(
    event: H3Event,
    portfolioId: string,
    neid: string,
    ctx?: ContextPackage,
    acsThresholds?: AcsThresholds
): Promise<AcsResult> {
    const cacheKey = makeCacheKey(portfolioId, neid, 'acs');
    const cached = await readScoringCache<AcsResult>(event, cacheKey);
    if (cached) return cached;

    const name = await getEntityName(neid, event);
    const screeningFindex =
        (await findexFor('sanctioned_entity')) ??
        (await findexFor('sanctions')) ??
        (await findexFor('screening_list'));
    const acs = await acsBundle([neid], 3, screeningFindex).catch(() => null);
    const seed = acs?.per_seed?.find((row) => row.seed === neid) ?? acs?.per_seed?.[0];
    const traversed =
        seed?.traversal?.map((row) => ({
            neid: row.neid,
            name: row.name || row.neid,
            hopDistance: row.hop ?? 1,
            relationshipType: 'ownership',
            ownershipPercentage: row.ownership_percent ?? null,
            jurisdiction: row.jurisdiction ?? null,
        })) ?? (await traverseOwnershipGraph(event, neid, 3, ctx));
    const screeningList =
        acs?.screening_list_neids?.map((n) => ({
            name: n,
            listSource: (acs?.screening_list_source as any) || 'custom',
        })) ?? (await loadScreeningListFromElemental(event));
    const screeningSourceEmpty = screeningList.length === 0;

    const sanctions = await fetchEntitySanctions(event, neid);
    const directMatches = runDirectScreening(name, [], screeningList);
    const pathMatches = traversed.flatMap((node) => [
        ...runDirectScreening(node.name, [], screeningList),
        ...runDirectScreening(node.neid, [], screeningList),
    ]);
    const jurisdictionContributions = evaluateJurisdictionExposure(traversed);
    const foci = evaluateFoci(traversed);
    const composite = computeAcsComposite(
        {
            directMatches,
            pathMatches,
            traversedNodes: traversed,
            jurisdictionContributions,
            foci,
        },
        acsThresholds
    );

    // A direct sanctions listing on the entity itself is a top-severity adverse
    // signal — surface it prominently and floor the ACS score at critical,
    // regardless of whether the (separate) screening-list flavor is configured.
    const sanctionsFloor = acsThresholds?.ofacExactOverride ?? 90;
    const score = sanctions.sanctioned
        ? Math.max(composite.score, sanctionsFloor)
        : composite.score;
    const riskLevel =
        score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

    const sanctionsEvidence = sanctions.sanctioned ? buildSanctionsEvidence(sanctions) : null;

    const baseFindings =
        composite.detail.findings.length > 0
            ? composite.detail.findings
            : screeningSourceEmpty
              ? [
                    {
                        text: 'No configured screening-list source. Direct and path list-matching were skipped; graph traversal, jurisdiction exposure, and FOCI analysis are still active.',
                        citations: [],
                    },
                ]
              : [
                    {
                        text: 'No direct or ownership-path screening hits were found.',
                        citations: [],
                    },
                ];

    // Extract top jurisdiction hits (tier 1 & 2 = high-sensitivity countries)
    const jurisdictionHits: AcsJurisdictionHit[] = jurisdictionContributions
        .filter((row) => row.tier <= 2)
        .slice(0, 10)
        .map((row) => ({
            name: row.node.name,
            jurisdiction: row.node.jurisdiction ?? null,
            tier: row.tier,
            hopDistance: row.node.hopDistance,
        }));

    const out: AcsResult = {
        score,
        hasRealData: composite.hasRealData || sanctions.sanctioned,
        screeningSourceEmpty,
        sanctions: sanctions.sanctioned ? sanctions : undefined,
        directMatchCount: directMatches.length,
        pathMatchCount: pathMatches.length,
        graphNodesScreened: traversed.length,
        foci,
        jurisdictionHits,
        detail: {
            metrics: [
                { label: 'Risk level', value: riskLevel },
                {
                    label: 'Confidence',
                    value: `${composite.confidence} (${composite.confidenceLevel})`,
                },
                ...(sanctionsEvidence ? sanctionsEvidence.metrics : []),
                ...(screeningSourceEmpty && !sanctions.sanctioned
                    ? [{ label: 'Screening source', value: 'No screening source configured' }]
                    : []),
                ...composite.detail.metrics,
            ],
            // Lead with the sanctions explanation when the entity is flagged.
            findings: sanctionsEvidence
                ? [sanctionsEvidence.finding, ...baseFindings]
                : baseFindings,
        },
    };
    await writeScoringCache(event, cacheKey, out, 7 * 24 * 60 * 60);
    return out;
}
