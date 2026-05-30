export const RISK_TOLERANCE_LABELS: Record<number, string> = {
    1: 'Very conservative',
    2: 'Conservative',
    3: 'Moderate',
    4: 'Growth-oriented',
    5: 'Aggressive',
};

export const RISK_TOLERANCE_DESCRIPTIONS: Record<number, string> = {
    1: 'Very conservative — capital preservation is the priority.',
    2: 'Conservative — modest growth, minimal risk.',
    3: 'Moderate — balanced growth and stability.',
    4: 'Growth-oriented — comfortable with meaningful volatility.',
    5: 'Aggressive — maximize long-term returns, high risk tolerance.',
};

export function riskLabel(tolerance: number): string {
    return RISK_TOLERANCE_LABELS[tolerance] ?? 'Unknown';
}

export function riskDescription(tolerance: number): string {
    return RISK_TOLERANCE_DESCRIPTIONS[tolerance] ?? '';
}
