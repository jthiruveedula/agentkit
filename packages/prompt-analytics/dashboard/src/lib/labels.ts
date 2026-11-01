// Map label helpers (pure): which nodes keep a resting label, and whether two label boxes touch.
export type Box = [number, number, number, number];   // x, y, w, h
/** True when the boxes overlap or sit closer than `gap` px. */
export const boxesTouch = (a: Box, b: Box, gap = 0) => a[0] < b[0] + b[2] + gap && a[0] + a[2] + gap > b[0] && a[1] < b[1] + b[3] + gap && a[1] + a[3] + gap > b[1];
/** Ids that keep a label at rest: hotspots first, then the heaviest, `max` in all (ties by id, so the pick is stable). */
export function labelTop(items: { id: string; w: number; hot?: boolean }[], max: number): string[] {
  return [...items].sort((a, b) => Number(!!b.hot) - Number(!!a.hot) || b.w - a.w || (a.id < b.id ? -1 : 1)).slice(0, max).map((i) => i.id);
}
