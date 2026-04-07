export type RolloverConfig = {
  apiUrl: string;
  orgSlug: string;
  mode: "test" | "live";
};

export type RolloverPlan = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  price_usdc: string;
  billing_period: string;
  trial_days: number;
  setup_fee_usdc: string;
};

export type RolloverSubscription = {
  id: string;
  plan_id: string;
  plan_name?: string;
  wallet_address: string;
  status: string;
  period_start: string;
  period_end: string;
  cancel_at_end: boolean;
  trial_end?: string | null;
  transaction?: string;
};

export type RolloverEvent = {
  type: string;
  detail: string;
  timestamp: number;
};
