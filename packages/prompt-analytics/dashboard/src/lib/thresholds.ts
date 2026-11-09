// Every "enough data" threshold in one place. Each says what it gates, so a number on screen can be traced to a rule.
// Pure constants, no imports: safe to import from any lib module.

/** Sessions below which a rate is shown faded and flagged "low" (scorecard, router, intent tables). */
export const MIN_N = 30;
/** Per-week chart: a week with fewer sessions with a prompt draws a hollow dot ("too few to read alone"). */
export const WEEK_MIN_N = 25;
/** Router cell (tool x kind of change) needs this many sessions before it gets a rate. */
export const ROUTER_MIN_N = 15;
/** Loop breaker: a rephrase bucket with fewer sessions draws no rate. */
export const LOOP_MIN_N = 10;
/** Golden hours: a weekday-hour cell with fewer sessions draws no rate. */
export const GOLD_MIN_N = 10;
/** Golden hours: familywise error rate across all tested cells (Bonferroni). */
export const GOLD_ALPHA = 0.05;
/** A prior period with fewer sessions than this gives no delta ("low base"). */
export const MIN_PRIOR_N = 5;
/** Cost deltas: the share of priced sessions may differ by at most this much between periods, else no delta is shown. */
export const PRICING_SHARE_TOL = 0.1;
/** Trends, golden hours and patterns unlock after this much span and this many sessions. */
export const MIN_DAYS = 7;
export const MIN_SESSIONS = 20;
/** Weekly Wrapped needs this many sessions in its 7 days. */
export const WRAP_MIN_SESSIONS = 5;
/** Playbook / habits need this many sessions; effects pass Benjamini-Hochberg at this q. */
export const PLAYBOOK_MIN_SESSIONS = 30;
export const FDR_Q = 0.1;
