import { Rollover } from "./rollover.js";
import type {
  CheckResult,
  TrackResult,
  UsageEvent,
  ListOptions,
  Page,
  BatchCheckItem,
  BatchCheckResult,
  BatchCheckEntry,
  BatchTrackEvent,
  BatchTrackResult,
  BatchTrackEntry,
  CreditSummary,
  Atomicity,
} from "./types.js";

declare module "./rollover.js" {
  interface Rollover {
    check(params: { wallet: string; feature: string }): Promise<CheckResult>;
    track(params: {
      wallet: string;
      feature: string;
      amount: number;
      idempotencyKey?: string;
    }): Promise<TrackResult>;
    checkBatch(params: {
      wallet: string;
      features: BatchCheckItem[];
    }): Promise<BatchCheckResult>;
    trackBatch(params: {
      wallet: string;
      events: BatchTrackEvent[];
      atomicity?: Atomicity;
      idempotencyKey?: string;
    }): Promise<BatchTrackResult>;
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
 * Checks multiple features in one call, optionally preflighting per-entry `amount` and returning a `creditSummary` when the batch touches credit features.
 *
 * @example
 * ```typescript
 * const gate = await ro.checkBatch({
 *   wallet,
 *   features: [
 *     { feature: "api-calls", amount: 1 },
 *     { feature: "image-gen", amount: 5 },
 *   ],
 * });
 * const blocked = gate.results.filter((r) => !r.allowed);
 * ```
 */
Rollover.prototype.checkBatch = async function (
  this: Rollover,
  params: { wallet: string; features: BatchCheckItem[] },
): Promise<BatchCheckResult> {
  const data = await this._post<Record<string, unknown>>("/v1/check/batch", undefined, {
    wallet: params.wallet,
    features: params.features,
  });
  const results = (data.results as Array<Record<string, unknown>>).map((r): BatchCheckEntry => ({
    feature: r.feature as string,
    allowed: r.allowed as boolean,
    used: r.used as number | undefined,
    remaining: (r.remaining as number) ?? 0,
    limit: (r.limit as number) ?? 0,
    creditCost: r.credit_cost as number | undefined,
    creditBalance: r.credit_balance as number | undefined,
    overLimit: r.over_limit as boolean | undefined,
    errorCode: r.error_code as string | undefined,
    errorMessage: r.error_message as string | undefined,
  }));
  let creditSummary: CreditSummary | undefined;
  if (data.credit_summary) {
    const cs = data.credit_summary as Record<string, unknown>;
    creditSummary = {
      required: cs.required as number,
      available: cs.available as number,
      allowed: cs.allowed as boolean,
    };
  }
  return {
    wallet: data.wallet as string,
    plan: data.plan as string,
    results,
    creditSummary,
  };
};

/**
 * Records every event in one call, tagging each `usage_events` row with the returned `batchId` and using `atomicity` to decide whether a per-event failure rolls back the whole batch.
 *
 * @example
 * ```typescript
 * await ro.trackBatch({
 *   wallet,
 *   events: [
 *     { feature: "api-calls", amount: 1 },
 *     { feature: "image-gen", amount: 5 },
 *   ],
 *   atomicity: "all_or_nothing",
 * });
 * ```
 */
Rollover.prototype.trackBatch = async function (
  this: Rollover,
  params: {
    wallet: string;
    events: BatchTrackEvent[];
    atomicity?: Atomicity;
    idempotencyKey?: string;
  },
): Promise<BatchTrackResult> {
  const headers: Record<string, string> = {
    "Idempotency-Key": params.idempotencyKey ?? crypto.randomUUID(),
  };
  const data = await this._post<Record<string, unknown>>("/v1/track/batch", undefined, {
    wallet: params.wallet,
    events: params.events,
    ...(params.atomicity ? { atomicity: params.atomicity } : {}),
  }, headers);
  const results = (data.results as Array<Record<string, unknown>>).map((r): BatchTrackEntry => ({
    feature: r.feature as string,
    allowed: r.allowed as boolean,
    used: (r.used as number) ?? 0,
    remaining: (r.remaining as number) ?? 0,
    creditBalance: r.credit_balance as number | undefined,
    overLimit: r.over_limit as boolean | undefined,
    errorCode: r.error_code as string | undefined,
    errorMessage: r.error_message as string | undefined,
  }));
  return {
    wallet: data.wallet as string,
    plan: data.plan as string,
    batchId: data.batch_id as string,
    results,
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
