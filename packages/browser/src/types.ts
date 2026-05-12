/**
 * Configuration for the Rollover browser client.
 *
 * `apiUrl` defaults to `https://api.rollover.dev`. Override for staging, local dev,
 * or a proxy. `orgSlug` identifies which organization's plans the SDK acts against;
 * `mode` selects the test environment (Base Sepolia) or live environment (Base).
 */
export type RolloverConfig = {
  apiUrl?: string;
  orgSlug: string;
  mode: "test" | "live";
};

export type FeatureType = "boolean" | "metered" | "credit" | "static";

export type Policy = "hard_block" | "soft_warn" | "hide";

export type RolloverFeature = {
  id: string;
  slug: string;
  name: string;
  type: FeatureType;
};

export type RolloverPlanFeature = {
  id: string;
  limit_amount: number;
  reset_period: string;
  overage_price?: string;
  weight: string;
  credit_cost?: number;
  policy: Policy;
  feature?: RolloverFeature;
};

export type RolloverPlan = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  price_usdc: string;
  setup_fee_usdc: string;
  billing_period: string;
  trial_days: number;
  auto_assign?: boolean;
  is_archived?: boolean;
  latest_revision_id?: string;
  sort_order?: number;
  features?: RolloverPlanFeature[];
};

export type RolloverSubscription = {
  id: string;
  plan_id: string;
  plan_revision_id?: string;
  plan_name?: string;
  wallet_address: string;
  status: string;
  billing_period?: string;
  mode?: string;
  period_start: string;
  period_end: string;
  trial_end?: string | null;
  cancel_at_end: boolean;
  transaction?: string;
};

/**
 * One entry on the public `/v1/networks` catalog. Used by the SDK to pick a chain for
 * SIWX signing and x402 payments; consumers rarely interact with it directly.
 */
export type RolloverNetwork = {
  name: string;
  chain_id: string;
  type: "evm" | "svm";
  facilitator_url: string;
  is_testnet: boolean;
  rpc_url?: string;
  explorer_url?: string;
  native_currency?: string;
  chainId?: number;
  chainHex?: `0x${string}`;
  chain?: unknown;
  walletAdd?: {
    chainId: `0x${string}`;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls?: string[];
  };
};

export type RolloverEventLevel = "info" | "success" | "warning" | "error";

export type RolloverEvent = {
  type: string;
  detail: string;
  level: RolloverEventLevel;
  timestamp: number;
};
