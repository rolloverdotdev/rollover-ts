/**
 * Canonical kind of a feature in the org catalog.
 * - `boolean`: access flag
 * - `metered`: usage counter with limit and reset period
 * - `credit`: pooled balance fed by metered features at a configurable cost
 * - `static`: non-consumptive numeric cap the consumer app enforces itself
 */
export type FeatureType = "boolean" | "metered" | "credit" | "static";

/**
 * What happens when a subscriber hits the plan-feature limit.
 * - `hard_block`: reject the request (default)
 * - `soft_warn`: let it through for cycle-end reconciliation; requires metered or credit
 * - `hide`: treat the feature as not present at all
 */
export type Policy = "hard_block" | "soft_warn" | "hide";

export interface CheckResult {
  allowed: boolean;
  used: number;
  remaining: number;
  limit: number;
  plan: string;
  creditBalance: number;
  creditCost: number;
}

export interface TrackResult {
  allowed: boolean;
  used: number;
  remaining: number;
  creditBalance: number;
}

export interface BatchCheckItem {
  feature: string;
  amount?: number;
}

export interface BatchCheckEntry {
  feature: string;
  allowed: boolean;
  used?: number;
  remaining: number;
  limit: number;
  creditCost?: number;
  creditBalance?: number;
  overLimit?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface CreditSummary {
  required: number;
  available: number;
  allowed: boolean;
}

export interface BatchCheckResult {
  wallet: string;
  plan: string;
  results: BatchCheckEntry[];
  creditSummary?: CreditSummary;
}

export interface BatchTrackEvent {
  feature: string;
  amount: number;
}

export interface BatchTrackEntry {
  feature: string;
  allowed: boolean;
  used: number;
  remaining: number;
  creditBalance?: number;
  overLimit?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface BatchTrackResult {
  wallet: string;
  plan: string;
  batchId: string;
  results: BatchTrackEntry[];
}

export type Atomicity = "per_event" | "all_or_nothing";

export interface CreditBalance {
  wallet: string;
  balance: number;
}

export interface GrantResult {
  balance: number;
  granted: number;
}

export interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_usdc: string;
  setup_fee_usdc: string;
  billing_period: string;
  trial_days: number;
  auto_assign: boolean;
  is_archived: boolean;
  latest_revision_id: string;
  sort_order: number;
  subscribers: number;
  features: PlanFeature[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_subscribed_at: string;
}

/**
 * An org-scoped catalog feature. Plans reference features through {@link PlanFeature}
 * link rows; the catalog row owns the canonical slug, display name, and type.
 */
export interface Feature {
  id: string;
  slug: string;
  name: string;
  type: FeatureType;
}

/**
 * One feature linked to one plan, carrying the plan-specific limits and the policy that
 * controls what happens when a subscriber hits them. `feature` holds the catalog row this
 * link points to on responses.
 */
export interface PlanFeature {
  id: string;
  limit_amount: number;
  reset_period: string;
  overage_price: string;
  weight: string;
  credit_cost: number;
  policy: Policy;
  feature?: Feature;
}

export interface Subscription {
  id: string;
  wallet_address: string;
  plan_id: string;
  plan_revision_id: string;
  plan_name: string;
  status: string;
  billing_period: string;
  mode: string;
  period_start: string;
  period_end: string;
  trial_end: string;
  cancel_at_end: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UsageEvent {
  id: string;
  wallet_address: string;
  feature_slug: string;
  amount: string;
  subscription_id: string;
  recorded_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo: string;
  webhook_url: string;
  created_at: string;
  updated_at: string;
}

export interface Page<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  wallet?: string;
  status?: string;
  planId?: string;
  feature?: string;
  after?: string;
  before?: string;
}

export interface CreatePlanParams {
  slug: string;
  name: string;
  price_usdc: string;
  description?: string;
  billing_period?: string;
  setup_fee_usdc?: string;
  trial_days?: number;
  auto_assign?: boolean;
  sort_order?: number;
}

/**
 * Parameters for linking a catalog feature to a plan. Supply either `feature_id` or
 * `feature_slug`; if `feature_slug` names a feature that does not yet exist in the org
 * catalog, the server creates one as a metered feature. `policy` defaults to `hard_block`.
 */
export interface LinkFeatureParams {
  feature_id?: string;
  feature_slug?: string;
  limit_amount?: number;
  reset_period?: string;
  credit_cost?: number;
  overage_price?: string;
  weight?: string;
  policy?: Policy;
}

export interface UpdatePlanParams {
  name?: string;
  description?: string;
  price_usdc?: string;
  setup_fee_usdc?: string;
  billing_period?: string;
  trial_days?: number;
  auto_assign?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

/**
 * Parameters for editing one plan-feature link. Only fields set on the object are sent.
 */
export interface UpdatePlanFeatureParams {
  limit_amount?: number;
  reset_period?: string;
  credit_cost?: number;
  overage_price?: string;
  weight?: string;
  policy?: Policy;
}

export interface AnalyticsStats {
  mrr: string;
  active_subs: number;
  total_revenue: string;
  top_features: TopFeature[];
  recent_activity: RecentEvent[];
}

export interface TopFeature {
  feature_slug: string;
  total_used: number;
}

export interface RecentEvent {
  wallet_address: string;
  feature_slug: string;
  amount: string;
  recorded_at: string;
}

export interface CreditTransaction {
  id: string;
  wallet_address: string;
  amount: number;
  type: string;
  description: string;
  mode: string;
  subscription_id: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  wallet_address: string;
  subscription_id: string;
  mode: string;
  chain_id: string;
  status: string;
  base_amount: string;
  overage_amount: string;
  total_amount: string;
  tx_hash: string;
  period_start: string;
  period_end: string;
  settled_at: string;
  created_at: string;
}

export interface Chain {
  id: string;
  org_id: string;
  mode: string;
  chain_id: string;
  pay_to_address: string;
  stablecoin_symbol: string;
  enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface CreateChainParams {
  chain_id: string;
  pay_to_address: string;
  stablecoin_symbol?: string;
  priority?: number;
}

export interface UpdateChainParams {
  pay_to_address?: string;
  stablecoin_symbol?: string;
  enabled?: boolean;
  priority?: number;
}
