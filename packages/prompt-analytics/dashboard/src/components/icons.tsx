/** Tile icons: 16px, 1.5px stroke, currentColor, decorative. Inline paths, no library. */
const P: Record<string, string> = {
  sessions: "M3 4h10M3 8h10M3 12h6",
  spend: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 4.5v7M9.8 6.2C9.5 5.6 8.9 5.4 8 5.4c-1 0-1.8.5-1.8 1.2S7 7.8 8 8s1.8.6 1.8 1.3-.8 1.3-1.8 1.3c-.9 0-1.6-.3-1.8-.9",
  tokens: "M8 2l6 3-6 3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3",
  cpa: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  applied: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM5.5 8.5l2 2 3-4",
  exposed: "M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4zM8 6v3M8 11v.1",
};
export const Icon = ({ n }: { n: string }) => (
  <svg className="ic" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={P[n] ?? P.cpa} /></svg>
);
