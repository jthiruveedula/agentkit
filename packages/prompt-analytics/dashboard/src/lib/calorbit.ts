// Orbit camera for the 3D activity calendar (CSS 3D, no WebGL). Pure math, no DOM.
// The floor is the calendar's XY plane; yaw spins it (rotateZ), pitch tilts it away from top-down (rotateX: 0 = plan view,
// 90 = edge-on), zoom scales it on top of a per-angle fit, and tx/ty shift it on screen so a zoom stays anchored under the pointer.
import { clamp } from "./orbit";

export interface View { yaw: number; pitch: number; zoom: number; tx: number; ty: number }

export const PITCH_MIN = 10, PITCH_MAX = 80, ZOOM_MIN = 0.5, ZOOM_MAX = 3;
/** Fit scale for the default view (the CSS 3D rule uses the same, so toggling 3D on does not jump). */
export const BASE = 0.74;
export const DEFAULT_VIEW: View = { yaw: -30, pitch: 54, zoom: 1, tx: 0, ty: 0 };

export const clampPitch = (p: number) => clamp(p, PITCH_MIN, PITCH_MAX);
export const clampZoom = (z: number) => clamp(z, ZOOM_MIN, ZOOM_MAX);
/** Any angle to (-180, 180]. */
export const wrapYaw = (y: number) => { const w = (((y + 180) % 360) + 360) % 360 - 180; return w === -180 ? 180 : w; };
/** The angle equal to `to` (mod 360) nearest `from`, so an animated reset never spins the long way round. */
export const nearestYaw = (from: number, to: number) => from + wrapYaw(to - from);

/** New screen offset so the point under `c` (px from the transform origin) stays put when zoom goes z0 -> z1. */
export function zoomAround(c: { x: number; y: number }, v: View, z1: number): Pick<View, "zoom" | "tx" | "ty"> {
  const zoom = clampZoom(z1), k = zoom / v.zoom;
  return { zoom, tx: c.x - (c.x - v.tx) * k, ty: c.y - (c.y - v.ty) * k };
}

/** One inertia step: velocity (deg/ms) decays by `decay` per 16.7 ms frame; 0 once it is too slow to see. */
export function inertia(vel: number, dt: number, decay = 0.92, eps = 0.002) {
  const n = vel * Math.pow(decay, dt / (1000 / 60));
  return Math.abs(n) < eps ? 0 : n;
}

/**
 * How much a floor edge faces the camera: 1 = toward it, -1 = away. `normal` is the edge's outward direction in floor
 * degrees (0 = +x/right, 90 = +y/down, 180 = left, 270 = top). CSS rotateZ is clockwise on screen, rotateX tips +y toward us.
 */
export const facing = (yaw: number, normal: number) => Math.sin(((normal + yaw) * Math.PI) / 180);

/**
 * Opacity for billboarded labels on a floor edge. Labels always face the viewer, so they only fade when that edge
 * is on the far side AND the camera is low (rotateX past 55 deg), where they would sit behind the columns.
 */
export function edgeFade(yaw: number, pitch: number, normal: number, min = 0.3) {
  const back = clamp(-facing(yaw, normal), 0, 1), low = clamp((pitch - 55) / 25, 0, 1);
  return 1 - back * low * (1 - min);
}

/**
 * Scale that keeps a w x h floor (plus columns up to `lift` px) inside an aw x ah box at this angle, capped at BASE so
 * the default view matches the CSS rule. Turning the long axis toward the camera shrinks the floor instead of overflowing.
 */
export function fitScale(yaw: number, pitch: number, w: number, h: number, aw: number, ah: number, lift = 50) {
  const r = Math.PI / 180, c = Math.abs(Math.cos(yaw * r)), s = Math.abs(Math.sin(yaw * r));
  const pw = w * c + h * s, ph = (w * s + h * c) * Math.cos(pitch * r) + lift * Math.sin(pitch * r);
  return pw > 0 && ph > 0 ? Math.min(BASE, aw / pw, ah / ph) : BASE;
}

export const viewTransform = (v: View, fit = BASE) =>
  `translate(${v.tx.toFixed(1)}px, ${v.ty.toFixed(1)}px) rotateX(${v.pitch.toFixed(2)}deg) rotateZ(${v.yaw.toFixed(2)}deg) scale(${(fit * v.zoom).toFixed(4)})`;
/** Undoes the floor rotation so a label stands upright facing the camera; scales back up so text never shrinks below ~0.85x. */
export const billboard = (v: View, fit = BASE) =>
  `rotateZ(${(-v.yaw).toFixed(2)}deg) rotateX(${(-v.pitch).toFixed(2)}deg) scale(${Math.max(1, 0.85 / (fit * v.zoom)).toFixed(3)})`;

export const describeView = (v: View) =>
  `View turned ${Math.round(((wrapYaw(v.yaw) - DEFAULT_VIEW.yaw + 540) % 360) - 180)} degrees, tilt ${Math.round(v.pitch)} degrees, zoom ${v.zoom.toFixed(1)}x`;
