// Pure math for the live refresh gate and the FLIP-style drilldown. No React, no DOM reads here.
export interface Box { x: number; y: number; w: number; h: number }

/** Refetch only over http(s), only when the tab is visible, and not more often than `gap` ms. */
export const shouldRefresh = (proto: string, visible: boolean, now: number, last: number, gap = 20000) =>
  /^https?:$/.test(proto) && visible && now - last >= gap;

/** A refetch counts as new data only when its generated_at differs (empty stamps never match). */
export const isFresh = (prev: string, next: string) => !!next && next !== prev;

/** First-to-last transform for FLIP: the panel's centre starts on the clicked box's centre at scale `s`
 *  (clamped so text never shrinks to nothing), then eases to identity. */
export function flipFrom(first: Box, last: Box, min = 0.3) {
  const dx = first.x + first.w / 2 - (last.x + last.w / 2), dy = first.y + first.h / 2 - (last.y + last.h / 2);
  const s = Math.min(1, Math.max(min, Math.min(first.w / (last.w || 1), first.h / (last.h || 1)) * 4));
  return { dx, dy, s };
}
