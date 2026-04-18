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
  features: Feature[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_subscribed_at: string;
}

export interface Feature {
  id: string;
  feature_slug: string;
  name: string;
  limit_amount: number;
  reset_period: string;
  credit_cost: number;
  overage_price: string;
  weight: string;
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

export interface CreateFeatureParams {
  feature_slug: string;
  name: string;
  limit_amount?: number;
  reset_period?: string;
  credit_cost?: number;
  overage_price?: string;
  weight?: string;
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

export interface UpdateFeatureParams {
  name?: string;
  limit_amount?: number;
  reset_period?: string;
  credit_cost?: number;
  overage_price?: string;
  weight?: string;
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
