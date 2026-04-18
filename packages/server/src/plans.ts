import { Rollover } from "./rollover.js";
import type {
  CreateFeatureParams,
  CreatePlanParams,
  Feature,
  ListOptions,
  Page,
  Plan,
  UpdateFeatureParams,
  UpdatePlanParams,
} from "./types.js";

declare module "./rollover.js" {
  interface Rollover {
    listPlans(opts?: ListOptions): Promise<Page<Plan>>;
    getPlan(params: { slug: string }): Promise<Plan>;
    createPlan(params: CreatePlanParams): Promise<Plan>;
    updatePlan(params: { slug: string } & UpdatePlanParams): Promise<Plan>;
    archivePlan(params: { slug: string }): Promise<void>;
    deletePlan(params: { slug: string }): Promise<void>;
    createFeature(params: CreateFeatureParams & { planSlug: string }): Promise<Feature>;
    updateFeature(
      params: { planSlug: string; featureSlug: string } & UpdateFeatureParams,
    ): Promise<Feature>;
    deleteFeature(params: { planSlug: string; featureSlug: string }): Promise<void>;
    listPricing(orgSlug: string): Promise<Plan[]>;
  }
}

/**
 * List all plans for the organization.
 *
 * @example
 * ```typescript
 * const { data: plans, total } = await ro.listPlans({ limit: 10 });
 * ```
 */
Rollover.prototype.listPlans = async function (
  this: Rollover,
  opts?: ListOptions,
): Promise<Page<Plan>> {
  const q = await this._adminQuery(opts);
  return this._get<Page<Plan>>("/v1/plans", q);
};

/**
 * Get a single plan by slug.
 *
 * @example
 * ```typescript
 * const plan = await ro.getPlan({ slug: "starter" });
 * ```
 */
Rollover.prototype.getPlan = async function (
  this: Rollover,
  params: { slug: string },
): Promise<Plan> {
  const q = await this._adminQuery();
  return this._get<Plan>(`/v1/plans/${encodeURIComponent(params.slug)}`, q);
};

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
Rollover.prototype.createPlan = async function (
  this: Rollover,
  params: CreatePlanParams,
): Promise<Plan> {
  const q = await this._adminQuery();
  return this._post<Plan>("/v1/plans", q, params);
};

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
Rollover.prototype.updatePlan = async function (
  this: Rollover,
  params: { slug: string } & UpdatePlanParams,
): Promise<Plan> {
  const q = await this._adminQuery();
  const { slug, ...body } = params;
  return this._put<Plan>(`/v1/plans/${encodeURIComponent(slug)}`, q, body);
};

/**
 * Archive a plan by slug, hiding it from new subscribers while existing subscribers keep
 * their current subscription on the revision they signed up on.
 */
Rollover.prototype.archivePlan = async function (
  this: Rollover,
  params: { slug: string },
): Promise<void> {
  const q = await this._adminQuery();
  await this._del(`/v1/plans/${encodeURIComponent(params.slug)}`, q);
};

/**
 * Hard delete a plan and all of its revisions; the server returns 409
 * `plan_has_subscriptions` when any subscription past or present references it, so reach for
 * `archivePlan` whenever the plan has ever had a subscriber.
 */
Rollover.prototype.deletePlan = async function (
  this: Rollover,
  params: { slug: string },
): Promise<void> {
  const q = await this._adminQuery();
  q.hard = "true";
  await this._del(`/v1/plans/${encodeURIComponent(params.slug)}`, q);
};

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
Rollover.prototype.createFeature = async function (
  this: Rollover,
  params: CreateFeatureParams & { planSlug: string },
): Promise<Feature> {
  const q = await this._adminQuery();
  const { planSlug, ...body } = params;
  return this._post<Feature>(`/v1/plans/${encodeURIComponent(planSlug)}/features`, q, body);
};

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
Rollover.prototype.updateFeature = async function (
  this: Rollover,
  params: { planSlug: string; featureSlug: string } & UpdateFeatureParams,
): Promise<Feature> {
  const q = await this._adminQuery();
  const { planSlug, featureSlug, ...body } = params;
  return this._put<Feature>(
    `/v1/plans/${encodeURIComponent(planSlug)}/features/${encodeURIComponent(featureSlug)}`,
    q,
    body,
  );
};

/**
 * Delete a feature from a plan.
 */
Rollover.prototype.deleteFeature = async function (
  this: Rollover,
  params: { planSlug: string; featureSlug: string },
): Promise<void> {
  const q = await this._adminQuery();
  await this._del(
    `/v1/plans/${encodeURIComponent(params.planSlug)}/features/${encodeURIComponent(params.featureSlug)}`,
    q,
  );
};

/**
 * List public pricing for an organization (no auth required).
 *
 * @example
 * ```typescript
 * const plans = await ro.listPricing("acme");
 * ```
 */
Rollover.prototype.listPricing = async function (
  this: Rollover,
  orgSlug: string,
): Promise<Plan[]> {
  return this._get<Plan[]>(`/v1/pricing/${encodeURIComponent(orgSlug)}`);
};
