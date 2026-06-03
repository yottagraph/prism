import type { H3Event } from 'h3';

import type { ContextPackage } from '../contextPackage';
import type { GovernanceSnapshot } from './types';

const C_SUITE_TERMS = [
    'CEO',
    'CFO',
    'CTO',
    'COO',
    'CMO',
    'CHIEF',
    'PRESIDENT',
    'PRINCIPAL EXECUTIVE',
    'PRINCIPAL FINANCIAL',
];

function parseDaysFromDate(value: string | undefined): number | null {
    if (!value) return null;
    const ts = Date.parse(value);
    if (!Number.isFinite(ts)) return null;
    return Math.max(0, Math.round((Date.now() - ts) / 86_400_000));
}

export async function buildGovernanceSnapshot(
    event: H3Event,
    neid: string,
    ctx?: ContextPackage
): Promise<GovernanceSnapshot & { references: string[] }> {
    let officerCount = 0;
    let directorCount = 0;
    const cSuiteRoles = new Set<string>();
    let departures90d = 0;
    let departures12m = 0;
    let auditorChanges12m = 0;
    const references: string[] = [];

    if (ctx) {
        officerCount = ctx.officers.length;
        directorCount = ctx.directors.length;
        const allPeople = [...ctx.officers, ...ctx.directors];
        for (const person of allPeople) {
            const title = (person.title ?? '').toUpperCase();
            if (C_SUITE_TERMS.some((term) => title.includes(term))) {
                cSuiteRoles.add(title || 'C-SUITE');
            }
            const days = parseDaysFromDate(person.endDate ?? undefined);
            if (days != null) {
                if (days <= 90) departures90d += 1;
                if (days <= 365) departures12m += 1;
            }
            if (person.ref) references.push(person.ref);
        }
        auditorChanges12m = ctx.events.filter((e) =>
            e.eventType.toUpperCase().includes('AUDITOR')
        ).length;
        ctx.events.forEach((e) => {
            if (e.ref) references.push(e.ref);
        });
    }

    return {
        officerCount,
        directorCount,
        cSuiteCount: cSuiteRoles.size,
        cSuiteRoles: [...cSuiteRoles],
        departures90d,
        departures12m,
        auditorChanges12m,
        references: [...new Set(references)],
    };
}
