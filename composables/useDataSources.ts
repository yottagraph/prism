/**
 * Central source-of-truth for every underlying data source Prism reads.
 *
 * The app is not a data source — it fuses independent external sources.
 * This registry drives source badges, tooltips, and the Sources legend dialog.
 */

export type DataSourceKey =
    | 'SEC'
    | 'NEWS'
    | 'STOCK'
    | 'POLY'
    | 'FRED'
    | 'CSL'
    | 'FDIC'
    | 'ELEMENTAL';

export interface DataSourceMeta {
    /** Short badge label, e.g. "SEC" */
    shortLabel: string;
    /** Full human-readable name, e.g. "SEC Filings" */
    label: string;
    /** One plain sentence: what this source IS. */
    whatItIs: string;
    /** One plain sentence: how Prism uses this source. */
    whatWeUseItFor: string;
    /** Example artifact from this source (shown in the legend). */
    exampleArtifact: string;
    /** MDI icon name for the source. */
    icon: string;
    /** Vuetify color token for chips and badges. */
    color: string;
}

export const SOURCE_META: Record<DataSourceKey, DataSourceMeta> = {
    SEC: {
        shortLabel: 'SEC',
        label: 'SEC Filings',
        whatItIs:
            'Official financial disclosures that U.S. public companies file with the Securities and Exchange Commission.',
        whatWeUseItFor:
            'We read these to assess financial strength (balance sheet, leverage) and leadership stability (officer departures, governance events).',
        exampleArtifact: '10-K annual report, 8-K material event',
        icon: 'mdi-file-document-outline',
        color: 'primary',
    },
    NEWS: {
        shortLabel: 'News',
        label: 'News & Sentiment',
        whatItIs:
            "Published news articles, press releases, and media coverage indexed in Elemental's news graph.",
        whatWeUseItFor:
            'We measure negative sentiment, mention velocity, and adverse media density to flag headline risk.',
        exampleArtifact: 'News article, press release',
        icon: 'mdi-newspaper-variant-outline',
        color: 'info',
    },
    STOCK: {
        shortLabel: 'Stock',
        label: 'Stock Market Data',
        whatItIs:
            "Daily price, volume, and technical indicator data sourced from Elemental's market data layer.",
        whatWeUseItFor:
            'We track 30-day price trends, volatility, and technical signals (RSI, MACD) to evaluate price stability.',
        exampleArtifact: 'Daily OHLCV bar, RSI reading',
        icon: 'mdi-chart-line',
        color: 'success',
    },
    POLY: {
        shortLabel: 'Polymarket',
        label: 'Prediction Markets',
        whatItIs:
            'Real-money prediction market contracts on Polymarket where participants bet on future macroeconomic and political outcomes.',
        whatWeUseItFor:
            'We use market-implied probabilities to read macro regime signals — recession odds, Fed rate moves, inflation — as portfolio context.',
        exampleArtifact: 'Prediction market contract',
        icon: 'mdi-podium',
        color: 'purple',
    },
    FRED: {
        shortLabel: 'FRED',
        label: 'FRED Macro Data',
        whatItIs:
            'The Federal Reserve Bank of St. Louis economic database, providing GDP, inflation, interest rates, and hundreds of other macro series.',
        whatWeUseItFor:
            'We overlay macro economic indicators onto portfolio context to show how the broader economy affects your holdings.',
        exampleArtifact: 'CPI series, Fed funds rate',
        icon: 'mdi-bank-outline',
        color: 'warning',
    },
    CSL: {
        shortLabel: 'Screening',
        label: 'Ownership Screening',
        whatItIs:
            "Consolidated sanctions and ownership-graph data from OFAC, OpenSanctions, and Elemental's compliance layer.",
        whatWeUseItFor:
            "We screen each holding's ownership graph for sanctions lists, high-risk jurisdictions, and foreign-influence indicators.",
        exampleArtifact: 'OFAC SDN list, beneficial ownership path',
        icon: 'mdi-shield-check-outline',
        color: 'error',
    },
    FDIC: {
        shortLabel: 'FDIC',
        label: 'FDIC Call Reports',
        whatItIs:
            'Quarterly financial call reports filed by FDIC-insured banks and depository institutions.',
        whatWeUseItFor:
            'We read these for bank-specific financial health metrics and failure risk — supplementing SEC filings for financial institutions.',
        exampleArtifact: 'Quarterly call report, bank failure notice',
        icon: 'mdi-bank',
        color: 'primary',
    },
    ELEMENTAL: {
        shortLabel: 'Elemental',
        label: 'Elemental Knowledge Graph',
        whatItIs:
            "Lovelace's unified entity knowledge graph — the layer that resolves, links, and contextualises all the sources above.",
        whatWeUseItFor:
            'Elemental is the backbone: it resolves company names to canonical entities, links filings to companies, and connects relationships across sources.',
        exampleArtifact: 'Entity resolution, relationship graph',
        icon: 'mdi-graph-outline',
        color: 'secondary',
    },
};

/**
 * Returns the Vuetify color token for a given source key string.
 * Handles both exact DataSourceKey values and the fuzzy strings that
 * appear in citation chips and driver cards (e.g. "SEC Filings", "news").
 *
 * Use this in place of duplicated heuristics across CitationChip,
 * MonitorTable, RiskDriverCards, etc.
 */
export function sourceColor(source: string | undefined | null): string {
    if (!source) return 'primary';
    const upper = source.toUpperCase();
    if (upper === 'SEC' || upper.startsWith('SEC')) return SOURCE_META.SEC.color;
    if (upper === 'NEWS' || upper.includes('NEWS')) return SOURCE_META.NEWS.color;
    if (upper === 'STOCK' || upper.includes('STOCK') || upper.includes('MARKET'))
        return SOURCE_META.STOCK.color;
    if (upper === 'POLY' || upper.includes('POLY') || upper.includes('PREDICTION'))
        return SOURCE_META.POLY.color;
    if (upper === 'FRED' || upper.includes('FRED')) return SOURCE_META.FRED.color;
    if (
        upper === 'CSL' ||
        upper.includes('CSL') ||
        upper.includes('OFAC') ||
        upper.includes('SCREENING') ||
        upper.includes('SANCTION') ||
        upper.includes('COMPLIANCE')
    )
        return SOURCE_META.CSL.color;
    if (upper === 'FDIC' || upper.includes('FDIC')) return SOURCE_META.FDIC.color;
    if (upper === 'ELEMENTAL') return SOURCE_META.ELEMENTAL.color;
    return 'primary';
}

/**
 * Returns the SOURCE_META entry that best matches a source string.
 * Falls back to the SEC entry for unknown sources.
 */
export function sourceMeta(source: string | undefined | null): DataSourceMeta {
    if (!source) return SOURCE_META.SEC;
    const upper = source.toUpperCase();
    if (upper === 'SEC' || upper.startsWith('SEC')) return SOURCE_META.SEC;
    if (upper === 'NEWS' || upper.includes('NEWS')) return SOURCE_META.NEWS;
    if (upper === 'STOCK' || upper.includes('STOCK') || upper.includes('MARKET'))
        return SOURCE_META.STOCK;
    if (upper === 'POLY' || upper.includes('POLY') || upper.includes('PREDICTION'))
        return SOURCE_META.POLY;
    if (upper === 'FRED' || upper.includes('FRED')) return SOURCE_META.FRED;
    if (
        upper === 'CSL' ||
        upper.includes('CSL') ||
        upper.includes('OFAC') ||
        upper.includes('SCREENING') ||
        upper.includes('SANCTION') ||
        upper.includes('COMPLIANCE')
    )
        return SOURCE_META.CSL;
    if (upper === 'FDIC' || upper.includes('FDIC')) return SOURCE_META.FDIC;
    if (upper === 'ELEMENTAL') return SOURCE_META.ELEMENTAL;
    return SOURCE_META.SEC;
}
