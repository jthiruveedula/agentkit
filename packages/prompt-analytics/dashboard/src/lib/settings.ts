/** Viewer display settings: glass strength (--glass on :root). One accent (blue) by design, so no accent picker.
 *  Glass steps for the slider: 0 is solid cards, 1 the signed-off look. */
export const GLASS = [[0, "Off (solid)"], [0.5, "Low"], [1, "Medium"], [1.25, "High"]] as const;
export type Settings = { glass: number };
export const DEFAULTS: Settings = { glass: 2 };   // glass is an index into GLASS

const KEY = "pa.settings";
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      glass: Number.isInteger(s.glass) && s.glass >= 0 && s.glass < GLASS.length ? s.glass : DEFAULTS.glass,
    };
  } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: settings last this visit only */ }
}
export function applySettings(s: Settings) {
  document.documentElement.style.setProperty("--glass", String(GLASS[s.glass][0]));
}
