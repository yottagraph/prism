export interface ScreeningListEntry {
    name: string;
    aliases?: string[];
    listSource: 'OFAC_SDN' | 'CSL' | 'UN' | 'PEP' | 'custom';
    jurisdiction?: string;
    identifiers?: string[];
}

// Curated demo entries for ACS module wiring.
export const DEMO_SCREENING_LIST: ScreeningListEntry[] = [
    {
        name: 'Rosneft Oil Company',
        aliases: ['Rosneft'],
        listSource: 'OFAC_SDN',
        jurisdiction: 'RU',
    },
    {
        name: 'VEB.RF',
        aliases: ['Vnesheconombank'],
        listSource: 'OFAC_SDN',
        jurisdiction: 'RU',
    },
    {
        name: 'Bank Melli Iran',
        aliases: ['Melli'],
        listSource: 'UN',
        jurisdiction: 'IR',
    },
    {
        name: 'Belaruskali',
        aliases: ['Belarus Potash Company'],
        listSource: 'CSL',
        jurisdiction: 'BY',
    },
    {
        name: 'China General Nuclear Power Corp',
        aliases: ['CGN'],
        listSource: 'CSL',
        jurisdiction: 'CN',
    },
    {
        name: 'Demo PEP Holdings',
        aliases: ['PEP Holdings'],
        listSource: 'PEP',
        jurisdiction: 'AE',
    },
];
