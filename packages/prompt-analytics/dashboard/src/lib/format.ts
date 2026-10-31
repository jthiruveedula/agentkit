const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const fmtInt = (n: number) => INT.format(Number.isFinite(n) ? Math.round(n) : 0);

/** 1234 -> 1.2k, 12_400_000 -> 12.4M */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const a = Math.abs(n);
  const unit = (v: number, s: string) => `${v >= 100 ? Math.round(v) : +v.toFixed(1)}${s}`;
  if (a >= 1e9) return unit(n / 1e9, "B");
  if (a >= 1e6) return unit(n / 1e6, "M");
  if (a >= 1e4) return unit(n / 1e3, "k");
  if (a >= 1e3) return unit(n / 1e3, "k");
  return fmtInt(n);
}

export function fmtUSD(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  return Math.abs(n) >= 1000 ? `$${INT.format(Math.round(n))}` : `$${n.toFixed(2)}`;
}

/** fraction -> percent string. 0.256 -> "26%" */
export const fmtPct = (f: number, digits = 0) => `${(Number.isFinite(f) ? f * 100 : 0).toFixed(digits)}%`;

export const fmtSigned = (n: number, digits = 0) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(digits)}`;

export function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Cap a headline at 12 words. */
export function clampWords(s: string, max = 12): string {
  const w = s.trim().split(/\s+/);
  return w.length <= max ? s.trim() : `${w.slice(0, max).join(" ")}...`;
}

export function fmtValue(v: number, unit: string): string {
  if (unit === "USD") return fmtUSD(v);
  if (unit === "%") return `${+v.toFixed(1)}%`;
  if (unit === "x") return `${+v.toFixed(1)}x`;
  if (unit === "min") return `${+v.toFixed(1)} min`;
  if (unit === "tokens") return `${fmtCompact(v)} tokens`;
  return fmtCompact(v);
}
