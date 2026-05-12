import { Rollover } from "./rollover.js";
import type { CheckResult, TrackResult, UsageEvent, ListOptions, Page } from "./types.js";

declare module "./rollover.js" {
  interface Rollover {
    check(params: { wallet: string; feature: string }): Promise<CheckResult>;
    track(params: {
      wallet: string;
      feature: string;
      amount: number;
      idempotencyKey?: string;
    }): Promise<TrackResult>;
    listUsage(opts?: ListOptions): Promise<Page<UsageEvent>>;
  }
}

/**
 * Check if a wallet is allowed to use a feature.
 *
 * @example
 * ```typescript
 * const { allowed, remaining } = await ro.check({
 *   wallet: "0xabc...",
 *   feature: "api-calls",
 * });
 * ```
 */
Rollover.prototype.check = async function (
  this: Rollover,
  params: { wallet: string; feature: string },
): Promise<CheckResult> {
  const data = await this._get<Record<string, unknown>>("/v1/check", {
    wallet: params.wallet,
    feature: params.feature,
  });
  return {
    allowed: data.allowed as boolean,
    used: (data.used as number) ?? 0,
    remaining: (data.remaining as number) ?? 0,
    limit: (data.limit as number) ?? 0,
    plan: (data.plan as string) ?? "",
    creditBalance: (data.credit_balance as number) ?? 0,
    creditCost: (data.credit_cost as number) ?? 0,
  };
};

/**
 * Track usage for a wallet and feature.
 *
 * @example
 * ```typescript
 * const result = await ro.track({
 *   wallet: "0xabc...",
 *   feature: "api-calls",
 *   amount: 1,
 * });
 * ```
 */
Rollover.prototype.track = async function (
  this: Rollover,
  params: {
    wallet: string;
    feature: string;
    amount: number;
    idempotencyKey?: string;
  },
): Promise<TrackResult> {
  const headers: Record<string, string> = {
    "Idempotency-Key": params.idempotencyKey ?? crypto.randomUUID(),
  };
  const data = await this._post<Record<string, unknown>>("/v1/track", undefined, {
    wallet: params.wallet,
    feature: params.feature,
    amount: params.amount,
  }, headers);
  return {
    allowed: data.allowed as boolean,
    used: (data.used as number) ?? 0,
    remaining: (data.remaining as number) ?? 0,
    creditBalance: (data.credit_balance as number) ?? 0,
  };
};

/**
 * List usage events with optional filters.
 *
 * @example
 * ```typescript
 * const { data: events } = await ro.listUsage({
 *   wallet: "0xabc...",
 *   feature: "api-calls",
 *   after: "2025-01-01T00:00:00Z",
 * });
 * ```
 */
Rollover.prototype.listUsage = async function (
  this: Rollover,
  opts?: ListOptions,
): Promise<Page<UsageEvent>> {
  const q = await this._adminQuery(opts);
  return this._get<Page<UsageEvent>>("/v1/usage", q);
};
