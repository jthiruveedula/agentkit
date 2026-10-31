import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export { gsap, ScrollTrigger, useGSAP };
export interface MotionCtx { wide: boolean; root: HTMLElement }
export type MotionFn = (ctx: MotionCtx) => void;

/** Runs `fn` only when the user has not asked for reduced motion. Cleans up tweens/triggers on revert. */
export function withMotion(root: HTMLElement, fn: MotionFn): () => void {
  const mm = gsap.matchMedia();
  mm.add(
    { ok: "(prefers-reduced-motion: no-preference)", wide: "(prefers-reduced-motion: no-preference) and (min-width: 900px)" },
    (c) => { if (c.conditions?.ok) fn({ wide: !!c.conditions.wide, root }); },
  );
  return () => mm.revert();
}

/** Once-only scroll reveal, never scrubbed. */
export const onceAt = (trigger: Element, start = "top 85%") => ({ trigger, start, once: true });
