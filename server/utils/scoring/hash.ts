export function hash32(input: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

export function clampScore(v: number): number {
    return Math.max(0, Math.min(100, Math.round(v)));
}
