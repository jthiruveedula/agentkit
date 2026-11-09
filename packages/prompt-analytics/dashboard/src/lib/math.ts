// Shared numeric helpers (the 3D calendar and terrain cameras: lib/calorbit.ts, lib/terrain.ts).
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
