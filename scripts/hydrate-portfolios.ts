import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type FixtureEntity = {
    inputName: string;
    resolvedName: string;
    neid: string | null;
};

type FixturePortfolio = {
    id: string;
    name: string;
    description: string;
    entities: FixtureEntity[];
};

function usage() {
    console.log('Usage: tsx scripts/hydrate-portfolios.ts <gatewayUrl> <tenantOrgId> <qsApiKey>');
}

async function resolveEntity(
    gatewayUrl: string,
    tenantOrgId: string,
    qsApiKey: string,
    query: string
): Promise<FixtureEntity> {
    try {
        const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/api/qs/${tenantOrgId}/entities/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': qsApiKey,
            },
            body: JSON.stringify({
                queries: [{ queryId: 1, query }],
                includeNames: true,
                maxResults: 1,
            }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as any;
        const match = data?.results?.[0]?.matches?.[0];
        if (match?.neid) {
            return {
                inputName: query,
                resolvedName: match.name || query,
                neid: match.neid,
            };
        }
    } catch {
        // Keep unresolved when API call fails.
    }
    return {
        inputName: query,
        resolvedName: query,
        neid: null,
    };
}

async function main() {
    const [, , gatewayUrl, tenantOrgId, qsApiKey] = process.argv;
    if (!gatewayUrl || !tenantOrgId || !qsApiKey) {
        usage();
        process.exit(1);
    }

    const sourcePath = path.resolve(process.cwd(), 'assets/portfolios-fixture.json');
    const outputPath = sourcePath;
    const raw = JSON.parse(readFileSync(sourcePath, 'utf-8')) as {
        portfolios: FixturePortfolio[];
    };

    const portfolios: FixturePortfolio[] = [];
    for (const portfolio of raw.portfolios) {
        const resolvedEntities: FixtureEntity[] = [];
        for (const entity of portfolio.entities) {
            const resolved = await resolveEntity(gatewayUrl, tenantOrgId, qsApiKey, entity.inputName);
            resolvedEntities.push(resolved);
        }
        portfolios.push({
            ...portfolio,
            entities: resolvedEntities,
        });
    }

    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(
        outputPath,
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                portfolios,
            },
            null,
            2
        ) + '\n'
    );
    console.log(`Wrote ${outputPath}`);
}

void main();
