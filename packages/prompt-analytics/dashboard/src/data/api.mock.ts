// Dev-only fake API. Synthetic values; imported dynamically behind import.meta.env.DEV.
import type { RevealFinding } from "./types";

const FAKES: RevealFinding[] = [
  { kind: "aws_access_key", category: "secret", before: "export AWS_ACCESS_KEY_ID=", value: "AKIAFAKEFAKEFAKE0000", after: " && ./deploy.sh --prod" },
  { kind: "email", category: "pii", before: "the user ", value: "jane.doe@example.test", after: " keeps getting bounced mail" },
  { kind: "github_token", category: "secret", before: "git push https://", value: "ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE0000", after: "@github.com/acme/app.git fails with 401" },
];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function reveal(id: string): Promise<RevealFinding[]> {
  await wait(250);
  return [FAKES[Number(id.replace(/\D/g, "")) % FAKES.length]];
}
export async function review(_id: string, _status: string): Promise<void> {
  await wait(200);
}

/** Fake tier switch for dev: derives each tier from the ml sample. */
export async function reanalyze(mode: string): Promise<unknown> {
  await wait(1400);
  const base = JSON.parse(JSON.stringify((await import("./sample.dev.json")).default));
  const m = mode === "auto" ? "ml" : mode;
  const e = base.engine;
  e.mode = m; e.requested = mode;
  e.available = ["basic", "ml"];
  if (m === "basic") { base.galaxy.points = { x: [], y: [], c: [], q: [] }; e.reason = "basic: stdlib and duckdb only"; e.upgrade = { mode: "ml", command: "pip install 'prompt-analytics[ml]'" }; e.libs.scikit_learn = null; e.methods = { ...e.methods, time: "Rolling z-score on daily cost", works: "Keyword intents, grouped by shared keywords", footprint: "Counted from session logs" }; }
  if (m === "deep") { e.available = ["basic", "ml", "deep"]; e.accel = "mps"; e.libs.fastembed = "0.5.1"; e.upgrade = null; e.reason = "deep: local embeddings on mps"; e.methods = { ...e.methods, works: "Local embeddings, UMAP-style layout, bootstrap CI" }; }
  if (m === "ml") e.available = ["basic", "ml", "deep"].slice(0, 2);
  return base;
}
