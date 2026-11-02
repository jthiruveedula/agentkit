/** Viewer display settings: accent preset (data-accent on :root, tokens in styles.css) and glass strength (--glass on :root). */
export const ACCENTS = [["blue", "Blue"], ["teal", "Teal"], ["violet", "Violet"], ["graphite", "Graphite"]] as const;
export type Accent = (typeof ACCENTS)[number][0];
/** Glass steps for the slider: 0 is solid cards, 1 the signed-off look. */
export const GLASS = [[0, "Off (solid)"], [0.5, "Low"], [1, "Medium"], [1.25, "High"]] as const;
export type Settings = { accent: Accent; glass: number };
export const DEFAULTS: Settings = { accent: "blue", glass: 2 };   // glass is an index into GLASS

const KEY = "pa.settings";
export function loadSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return {
      accent: ACCENTS.some(([id]) => id === s.accent) ? s.accent : DEFAULTS.accent,
      glass: Number.isInteger(s.glass) && s.glass >= 0 && s.glass < GLASS.length ? s.glass : DEFAULTS.glass,
    };
  } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: settings last this visit only */ }
}
export function applySettings(s: Settings) {
  const el = document.documentElement;
  if (s.accent === DEFAULTS.accent) el.removeAttribute("data-accent"); else el.dataset.accent = s.accent;
  el.style.setProperty("--glass", String(GLASS[s.glass][0]));
}
