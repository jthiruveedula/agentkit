// Secret scan for text the user is about to copy out of the dashboard. A TypeScript port of the rules in
// prompt_analytics/privacy.py (`_BUILTINS`, `_HOMEDIR`, the entropy cut and `Redactor.find_leaks`), minus the
// noisy PII heuristics (phone, ipv4, hostname, card) that find_leaks also skips. Keep the two in step.
// Already-redacted placeholders ([REDACTED:kind], [USER]) are fine; anything else matching a rule blocks the copy.

const RULES: [kind: string, rx: RegExp, group: number][] = [
  ["pem", /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|[\s\S]*$)/g, 0],
  ["aws", /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[0-9A-Z]{16}\b/g, 0],
  ["github", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/g, 0],
  ["anthropic", /\bsk-ant-[A-Za-z0-9_-]{20,}/g, 0],
  ["openai", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g, 0],
  ["google", /\bAIza[0-9A-Za-z_-]{35}\b/g, 0],
  ["slack", /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, 0],
  ["stripe", /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}/g, 0],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 0],
  ["bearer", /(\bbearer\s+)([A-Za-z0-9._~+/=-]{16,})/gi, 2],
  ["urlcred", /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)(@)/gi, 2],
  ["assign", /(["']?[\w.-]*(?:api[_-]?key|secret|token|passw(?:or)?d|credential|private[_-]?key|access[_-]?key)[\w.-]*["']?\s*[:=]\s*)(\[REDACTED:[^\]\s]*\]|"[^"\n]*"|'[^'\n]*'|[^\s,;}\])]+)/gi, 2],
  ["email", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, 0],
  ["email", /\b[A-Za-z0-9._+-]+%40[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, 0],
  ["ssn", /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g, 0],
];
const HOMEDIR = [/(\/Users\/|\/home\/)(?!\[USER\])[^/\s"'`]+/, /([A-Z]:\\{1,2}Users\\{1,2})(?!\[USER\])[^\\\s"'`]+/i];
const PLACEHOLDER = /\[REDACTED:[a-z_-]+(?::[0-9a-f]{8})?\]|\[USER\]/;
const ENTROPY = /(?<![A-Za-z0-9+/_=-])[A-Za-z0-9+/_=-]{24,}(?![A-Za-z0-9+/_=-])/g;
const HEX_ID = /^(?:[0-9a-fA-F]{32}|[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$/;
const UUID = /^[0-9a-fA-F]{8}-(?:[0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$/;

function shannon(s: string): number {
  const c = new Map<string, number>();
  for (const ch of s) c.set(ch, (c.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of c.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
}

/** Kinds of secret or personal data still present in `text` (empty = clean). Deterministic and pure. */
export function findSecrets(text: string): string[] {
  const hits = new Set<string>();
  for (const [kind, rx, group] of RULES) {
    for (const m of text.matchAll(rx)) {
      if (!PLACEHOLDER.test(m[group] ?? "")) { hits.add(kind); break; }
    }
  }
  if (HOMEDIR.some((rx) => rx.test(text))) hits.add("homedir");
  for (const [tok] of text.matchAll(ENTROPY)) {
    if (HEX_ID.test(tok) || UUID.test(tok) || tok.split("/").length - 1 >= 2) continue;
    const classes = [/[a-z]/, /[A-Z]/, /\d/].filter((r) => r.test(tok)).length;
    if (classes >= 3 && shannon(tok) >= 4.0) { hits.add("entropy"); break; }
  }
  return [...hits];
}

/** Plain-language reason for a blocked copy. */
export const secretReason = (kinds: string[]) => `Looks like it contains ${kinds.join(", ")}. Remove it from the draft before copying.`;
