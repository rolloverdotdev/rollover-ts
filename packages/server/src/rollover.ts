import { parseError } from "./errors.js";
import type {
  AnalyticsStats,
  CheckResult,
  CreditBalance,
  CreditTransaction,
  CreateFeatureParams,
  CreatePlanParams,
  Feature,
  GrantResult,
  Invoice,
  ListOptions,
  Organization,
  Page,
  Plan,
  Subscription,
  TrackResult,
  UpdateFeatureParams,
  UpdatePlanParams,
  UsageEvent,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.rollover.dev";

export interface RolloverConfig {
  apiKey: string;
  baseUrl?: string;
}

/**
 * Rollover server-side SDK client.
 *
 * @example
 * ```typescript
 * import { Rollover } from "@rolloverdotdev/server";
 *
 * const ro = new Rollover({ apiKey: "ro_test_..." });
 * const { allowed } = await ro.check({ wallet: "0xabc...", feature: "api-calls" });
 * ```
 */
export class Rollover {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly mode: "test" | "live";
  private slugCache: string | null = null;
  private slugPromise: Promise<string> | null = null;

  constructor(config: RolloverConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.mode = config.apiKey.startsWith("ro_test_") ? "test" : "live";
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
  async check(params: { wallet: string; feature: string }): Promise<CheckResult> {
    const data = await this.get<Record<string, unknown>>("/v1/check", {
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
  }

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
  async track(params: {
    wallet: string;
    feature: string;
    amount: number;
    idempotencyKey?: string;
  }): Promise<TrackResult> {
    const headers: Record<string, string> = {};
    if (params.idempotencyKey) {
      headers["Idempotency-Key"] = params.idempotencyKey;
    }
    const data = await this.post<Record<string, unknown>>("/v1/track", undefined, {
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
  }

  /**
   * Get the credit balance for a wallet.
   *
   * @example
   * ```typescript
   * const { balance } = await ro.getCredits({ wallet: "0xabc..." });
   * ```
   */
  async getCredits(params: { wallet: string }): Promise<CreditBalance> {
    return this.get<CreditBalance>("/v1/credits", { wallet: params.wallet });
  }

  /**
   * Grant credits to a wallet.
   *
   * @example
   * ```typescript
   * const { balance, granted } = await ro.grantCredits({
   *   wallet: "0xabc...",
   *   amount: 500,
   *   description: "Welcome bonus",
   * });
   * ```
   */
  async grantCredits(params: {
    wallet: string;
    amount: number;
    description?: string;
    expiresAt?: string;
  }): Promise<GrantResult> {
    return this.post<GrantResult>("/v1/credits", undefined, {
      wallet: params.wallet,
      amount: params.amount,
      ...(params.description && { description: params.description }),
      ...(params.expiresAt && { expires_at: params.expiresAt }),
    });
  }

  /**
   * List credit transactions with optional filters.
   *
   * @example
   * ```typescript
   * const { data: txns } = await ro.listCreditTransactions({ wallet: "0xabc..." });
   * ```
   */
  async listCreditTransactions(opts?: ListOptions): Promise<Page<CreditTransaction>> {
    const q = await this.adminQuery(opts);
    return this.get<Page<CreditTransaction>>("/v1/credits/transactions", q);
  }

  /**
   * List all plans for the organization.
   *
   * @example
   * ```typescript
   * const { data: plans, total } = await ro.listPlans({ limit: 10 });
   * ```
   */
  async listPlans(opts?: ListOptions): Promise<Page<Plan>> {
    const q = await this.adminQuery(opts);
    return this.get<Page<Plan>>("/v1/plans", q);
  }

  /**
   * Get a single plan by slug.
   *
   * @example
   * ```typescript
   * const plan = await ro.getPlan({ slug: "starter" });
   * ```
   */
  async getPlan(params: { slug: string }): Promise<Plan> {
    const q = await this.adminQuery();
    return this.get<Plan>(`/v1/plans/${encodeURIComponent(params.slug)}`, q);
  }

  /**
   * Create a new plan.
   *
   * @example
   * ```typescript
   * const plan = await ro.createPlan({
   *   slug: "starter",
   *   name: "Starter",
   *   price_usdc: "9.99",
   *   billing_period: "monthly",
   * });
   * ```
   */
  async createPlan(params: CreatePlanParams): Promise<Plan> {
    const q = await this.adminQuery();
    return this.post<Plan>("/v1/plans", q, params);
  }

  /**
   * Update an existing plan by slug, sending only the fields provided.
   *
   * @example
   * ```typescript
   * const plan = await ro.updatePlan({
   *   slug: "starter",
   *   name: "Starter Plus",
   *   price_usdc: "14.99",
   * });
   * ```
   */
  async updatePlan(params: { slug: string } & UpdatePlanParams): Promise<Plan> {
    const q = await this.adminQuery();
    const { slug, ...body } = params;
    return this.patch<Plan>(`/v1/plans/${encodeURIComponent(slug)}`, q, body);
  }

  /**
   * Archive a plan by slug.
   */
  async archivePlan(params: { slug: string }): Promise<void> {
    const q = await this.adminQuery();
    await this.del(`/v1/plans/${encodeURIComponent(params.slug)}`, q);
  }

  /**
   * Add a feature to a plan.
   *
   * @example
   * ```typescript
   * const feature = await ro.createFeature({
   *   planSlug: "starter",
   *   feature_slug: "api-calls",
   *   name: "API Calls",
   *   limit_amount: 10000,
   *   reset_period: "monthly",
   * });
   * ```
   */
  async createFeature(params: CreateFeatureParams & { planSlug: string }): Promise<Feature> {
    const q = await this.adminQuery();
    const { planSlug, ...body } = params;
    return this.post<Feature>(`/v1/plans/${encodeURIComponent(planSlug)}/features`, q, body);
  }

  /**
   * Update an existing feature on a plan, sending only the fields provided.
   *
   * @example
   * ```typescript
   * const feature = await ro.updateFeature({
   *   planSlug: "starter",
   *   featureSlug: "api-calls",
   *   limit_amount: 20000,
   * });
   * ```
   */
  async updateFeature(
    params: { planSlug: string; featureSlug: string } & UpdateFeatureParams,
  ): Promise<Feature> {
    const q = await this.adminQuery();
    const { planSlug, featureSlug, ...body } = params;
    return this.patch<Feature>(
      `/v1/plans/${encodeURIComponent(planSlug)}/features/${encodeURIComponent(featureSlug)}`,
      q,
      body,
    );
  }

  /**
   * Delete a feature from a plan.
   */
  async deleteFeature(params: { planSlug: string; featureSlug: string }): Promise<void> {
    const q = await this.adminQuery();
    await this.del(
      `/v1/plans/${encodeURIComponent(params.planSlug)}/features/${encodeURIComponent(params.featureSlug)}`,
      q,
    );
  }

  /**
   * List public pricing for an organization (no auth required).
   *
   * @example
   * ```typescript
   * const plans = await ro.listPricing("acme");
   * ```
   */
  async listPricing(orgSlug: string): Promise<Plan[]> {
    return this.get<Plan[]>(`/v1/pricing/${encodeURIComponent(orgSlug)}`);
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
  async listSubscriptions(opts?: ListOptions): Promise<Page<Subscription>> {
    const q = await this.adminQuery(opts);
    return this.get<Page<Subscription>>("/v1/subscriptions", q);
  }

  /**
   * Get a single subscription by ID.
   *
   * @example
   * ```typescript
   * const sub = await ro.getSubscription({ id: "sub-123" });
   * ```
   */
  async getSubscription(params: { id: string }): Promise<Subscription> {
    const q = await this.adminQuery();
    return this.get<Subscription>(`/v1/subscriptions/${encodeURIComponent(params.id)}`, q);
  }

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
  async createSubscription(params: { wallet: string; planSlug: string }): Promise<Subscription> {
    const q = await this.adminQuery();
    return this.post<Subscription>("/v1/subscriptions", q, {
      wallet_address: params.wallet,
      plan_slug: params.planSlug,
    });
  }

  /**
   * Cancel a subscription by ID, marking it to end at the current period.
   */
  async cancelSubscription(params: { id: string }): Promise<Subscription> {
    const q = await this.adminQuery();
    return this.del(`/v1/subscriptions/${encodeURIComponent(params.id)}`, q) as Promise<Subscription>;
  }

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
  async listUsage(opts?: ListOptions): Promise<Page<UsageEvent>> {
    const q = await this.adminQuery(opts);
    return this.get<Page<UsageEvent>>("/v1/usage", q);
  }

  /**
   * Get the organization associated with the current API key.
   *
   * @example
   * ```typescript
   * const org = await ro.getOrganization();
   * ```
   */
  async getOrganization(): Promise<Organization> {
    return this.get<Organization>("/v1/organization");
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
  async getAnalytics(): Promise<AnalyticsStats> {
    const q = await this.adminQuery();
    return this.get<AnalyticsStats>("/v1/analytics", q);
  }

  /**
   * List invoices with optional filters.
   *
   * @example
   * ```typescript
   * const { data: invoices } = await ro.listInvoices({ wallet: "0xabc..." });
   * ```
   */
  async listInvoices(opts?: ListOptions): Promise<Page<Invoice>> {
    const q = await this.adminQuery(opts);
    return this.get<Page<Invoice>>("/v1/invoices", q);
  }

  private async resolveSlug(): Promise<string> {
    if (this.slugCache) return this.slugCache;
    if (!this.slugPromise) {
      this.slugPromise = this.get<Organization>("/v1/organization")
        .then((org) => {
          this.slugCache = org.slug;
          return org.slug;
        })
        .catch((err) => {
          this.slugPromise = null;
          throw err;
        });
    }
    return this.slugPromise;
  }

  private async adminQuery(opts?: ListOptions): Promise<Record<string, string>> {
    const slug = await this.resolveSlug();
    const q: Record<string, string> = { slug, mode: this.mode };
    if (opts?.limit) q.limit = String(opts.limit);
    if (opts?.offset) q.offset = String(opts.offset);
    if (opts?.wallet) q.wallet = opts.wallet;
    if (opts?.status) q.status = opts.status;
    if (opts?.planId) q.plan_id = opts.planId;
    if (opts?.feature) q.feature = opts.feature;
    if (opts?.after) q.after = opts.after;
    if (opts?.before) q.before = opts.before;
    return q;
  }

  private async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this.request("GET", path, query) as Promise<T>;
  }

  private async post<T>(
    path: string,
    query?: Record<string, string>,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    return this.request("POST", path, query, body, extraHeaders) as Promise<T>;
  }

  private async patch<T>(
    path: string,
    query?: Record<string, string>,
    body?: unknown,
  ): Promise<T> {
    return this.request("PATCH", path, query, body) as Promise<T>;
  }

  private async del(
    path: string,
    query?: Record<string, string>,
  ): Promise<unknown> {
    return this.request("DELETE", path, query);
  }

  private async request(
    method: string,
    path: string,
    query?: Record<string, string>,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<unknown> {
    let url = `${this.baseUrl}${path}`;
    if (query && Object.keys(query).length > 0) {
      url += "?" + new URLSearchParams(query).toString();
    }

    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      ...extraHeaders,
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw await parseError(response);
    }

    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined;
    }

    return response.json();
  }
}
