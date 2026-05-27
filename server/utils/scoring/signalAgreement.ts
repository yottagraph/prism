import type { SignalAgreement } from './types';

export interface SignalAgreementInput {
    sec: { available: boolean; risky: boolean };
    news: { available: boolean; risky: boolean };
    stock: { available: boolean; risky: boolean };
    risk: { available: boolean; risky: boolean };
}

export interface SignalAgreementResult {
    signalAgreement: SignalAgreement;
    sourcesAvailable: number;
    sourcesRisky: number;
    signalSummary: string;
    signalDetails: Array<{
        source: 'SEC' | 'News' | 'Stock' | 'Risk';
        available: boolean;
        risky: boolean;
    }>;
}

export function computeSignalAgreement(input: SignalAgreementInput): SignalAgreementResult {
    const signalDetails: SignalAgreementResult['signalDetails'] = [
        { source: 'SEC', ...input.sec },
        { source: 'News', ...input.news },
        { source: 'Stock', ...input.stock },
        { source: 'Risk', ...input.risk },
    ];
    const availableSources = signalDetails.filter((detail) => detail.available);
    const sourcesAvailable = availableSources.length;
    const sourcesRisky = availableSources.filter((detail) => detail.risky).length;
    const riskDirections = new Set(availableSources.map((detail) => detail.risky));

    let signalAgreement: SignalAgreement;
    if (sourcesAvailable <= 1) {
        signalAgreement = input.sec.available ? 'sec_only' : 'limited';
    } else if (riskDirections.size === 1) {
        signalAgreement = 'agreement';
    } else if (sourcesAvailable < signalDetails.length) {
        signalAgreement = 'partial';
    } else {
        signalAgreement = 'conflict';
    }

    const signalSummary =
        signalAgreement === 'agreement'
            ? sourcesRisky > 0
                ? `Agreement: ${sourcesRisky}/${sourcesAvailable} sources indicate risk.`
                : `Agreement: ${sourcesAvailable} sources indicate stability.`
            : signalAgreement === 'conflict'
              ? `Conflict: ${sourcesRisky}/${sourcesAvailable} sources indicate risk.`
              : signalAgreement === 'partial'
                ? `Partial: ${sourcesAvailable}/${signalDetails.length} sources available.`
                : signalAgreement === 'sec_only'
                  ? 'SEC-only signal available.'
                  : 'Limited data across all sources.';

    return {
        signalAgreement,
        sourcesAvailable,
        sourcesRisky,
        signalSummary,
        signalDetails,
    };
}
