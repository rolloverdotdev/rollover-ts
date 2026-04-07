import { Rollover } from "./rollover.js";
import type { AnalyticsStats } from "./types.js";

declare module "./rollover.js" {
  interface Rollover {
    getAnalytics(): Promise<AnalyticsStats>;
  }
}

/**
 * Get analytics for the organization including MRR, active subscriptions,
 * and top features by usage.
 *
 * @example
 * ```typescript
 * const stats = await ro.getAnalytics();
 * console.log(`MRR: $${stats.mrr}, Active: ${stats.active_subs}`);
 * ```
 */
Rollover.prototype.getAnalytics = async function (
  this: Rollover,
): Promise<AnalyticsStats> {
  const q = await this._adminQuery();
  return this._get<AnalyticsStats>("/v1/analytics", q);
};
