// Shared numeric helpers (used by lib/sunburst.ts).
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
