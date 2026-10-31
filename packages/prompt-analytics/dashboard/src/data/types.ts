// Thin re-export of contract.ts so components import from one place.
import type * as C from "./contract";

export type { SessionRow, Source, Intent, Chapter, Insight, RevealFinding, AnalysisMode, DashboardData, ExposureApi } from "./contract";
export type ExposureItem = C.DashboardData["exposure"]["items"][number];
export type Engine = C.DashboardData["engine"];
