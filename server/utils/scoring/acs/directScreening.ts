import type { ScreeningMatch } from './types';
import { DEMO_SCREENING_LIST, type ScreeningListEntry } from './screeningLists';

function normalize(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function tokenOverlapScore(left: string, right: string): number {
    const a = new Set(normalize(left).split(' ').filter(Boolean));
    const b = new Set(normalize(right).split(' ').filter(Boolean));
    if (!a.size || !b.size) return 0;
    const overlap = [...a].filter((token) => b.has(token)).length;
    return overlap / Math.max(a.size, b.size);
}

function classifyMatch(score: number): ScreeningMatch['matchQuality'] | null {
    if (score >= 1) return 'exact';
    if (score >= 0.95) return 'strong';
    if (score >= 0.92) return 'probable';
    if (score >= 0.88) return 'possible';
    return null;
}

function confidenceFromQuality(quality: ScreeningMatch['matchQuality']): number {
    switch (quality) {
        case 'exact':
            return 0.95;
        case 'strong':
            return 0.9;
        case 'probable':
            return 0.7;
        default:
            return 0.4;
    }
}

function riskContribution(
    quality: ScreeningMatch['matchQuality'],
    listSource: ScreeningListEntry['listSource']
) {
    const base =
        listSource === 'OFAC_SDN' ? 100 : listSource === 'CSL' || listSource === 'UN' ? 90 : 70;
    if (quality === 'exact') return base;
    if (quality === 'strong') return Math.round(base * 0.9);
    if (quality === 'probable') return Math.round(base * 0.7);
    return Math.round(base * 0.4);
}

export function runDirectScreening(
    entityName: string,
    identifiers: string[] = [],
    screeningList = DEMO_SCREENING_LIST
): ScreeningMatch[] {
    const matches: ScreeningMatch[] = [];
    const normalizedEntity = normalize(entityName);
    for (const entry of screeningList) {
        const candidateNames = [entry.name, ...(entry.aliases || [])];
        const bestScore = candidateNames.reduce((best, candidate) => {
            const normalizedCandidate = normalize(candidate);
            if (normalizedCandidate === normalizedEntity) return 1;
            return Math.max(best, tokenOverlapScore(entityName, candidate));
        }, 0);
        const quality = classifyMatch(bestScore);
        if (!quality) continue;
        const confidence = confidenceFromQuality(quality);
        const contribution = riskContribution(quality, entry.listSource);
        matches.push({
            matchedEntity: entry.name,
            listSource: entry.listSource,
            matchQuality: quality,
            matchConfidence: confidence,
            matchedIdentifiers: identifiers,
            requiresReview: quality === 'possible',
            riskContribution: contribution,
        });
    }
    return matches.sort((a, b) => b.riskContribution - a.riskContribution);
}
