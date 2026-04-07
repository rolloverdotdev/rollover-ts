import { Rollover } from "./rollover.js";
import type { ListOptions, Page, Subscription } from "./types.js";

declare module "./rollover.js" {
  interface Rollover {
    listSubscriptions(opts?: ListOptions): Promise<Page<Subscription>>;
    getSubscription(params: { id: string }): Promise<Subscription>;
    createSubscription(params: { wallet: string; planSlug: string }): Promise<Subscription>;
    cancelSubscription(params: { id: string }): Promise<Subscription>;
  }
}

/**
 * List subscriptions with optional filters.
 *
 * @example
 * ```typescript
 * const { data: subs } = await ro.listSubscriptions({
 *   wallet: "0xabc...",
 *   status: "active",
 * });
 * ```
 */
Rollover.prototype.listSubscriptions = async function (
  this: Rollover,
  opts?: ListOptions,
): Promise<Page<Subscription>> {
  const q = await this._adminQuery(opts);
  return this._get<Page<Subscription>>("/v1/subscriptions", q);
};

/**
 * Get a single subscription by ID.
 *
 * @example
 * ```typescript
 * const sub = await ro.getSubscription({ id: "sub-123" });
 * ```
 */
Rollover.prototype.getSubscription = async function (
  this: Rollover,
  params: { id: string },
): Promise<Subscription> {
  const q = await this._adminQuery();
  return this._get<Subscription>(`/v1/subscriptions/${encodeURIComponent(params.id)}`, q);
};

/**
 * Create a subscription for a wallet.
 *
 * @example
 * ```typescript
 * const sub = await ro.createSubscription({
 *   wallet: "0xabc...",
 *   planSlug: "starter",
 * });
 * ```
 */
Rollover.prototype.createSubscription = async function (
  this: Rollover,
  params: { wallet: string; planSlug: string },
): Promise<Subscription> {
  const q = await this._adminQuery();
  return this._post<Subscription>("/v1/subscriptions", q, {
    wallet_address: params.wallet,
    plan_slug: params.planSlug,
  });
};

/**
 * Cancel a subscription by ID, marking it to end at the current period.
 */
Rollover.prototype.cancelSubscription = async function (
  this: Rollover,
  params: { id: string },
): Promise<Subscription> {
  const q = await this._adminQuery();
  return this._del(`/v1/subscriptions/${encodeURIComponent(params.id)}`, q) as Promise<Subscription>;
};
