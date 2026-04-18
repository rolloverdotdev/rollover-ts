import { Rollover } from "./rollover.js";
import type {
  Chain,
  CreateChainParams,
  Organization,
  UpdateChainParams,
} from "./types.js";

declare module "./rollover.js" {
  interface Rollover {
    getOrganization(): Promise<Organization>;
    listChains(): Promise<Chain[]>;
    createChain(params: CreateChainParams): Promise<Chain>;
    updateChain(params: { id: string } & UpdateChainParams): Promise<Chain>;
    deleteChain(params: { id: string }): Promise<void>;
  }
}

/**
 * Get the organization associated with the current API key.
 *
 * @example
 * ```typescript
 * const org = await ro.getOrganization();
 * ```
 */
Rollover.prototype.getOrganization = async function (
  this: Rollover,
): Promise<Organization> {
  return this._get<Organization>("/v1/organization");
};

/**
 * List every payment chain configured for the API key's org and mode, including disabled
 * ones, ordered by priority so the first enabled chain is the one subscribers settle to.
 *
 * @example
 * ```typescript
 * const chains = await ro.listChains();
 * ```
 */
Rollover.prototype.listChains = async function (
  this: Rollover,
): Promise<Chain[]> {
  const q = await this._adminQuery();
  return this._get<Chain[]>("/v1/organization/chains", q);
};

/**
 * Add a new payment destination chain. Use this when accepting payments on additional
 * networks or when configuring your live mode payout address before issuing live API keys;
 * the server returns 400 `unsupported_chain` for chains outside the catalog and 400
 * `mode_mismatch` if a testnet is added to live mode or vice versa.
 *
 * @example
 * ```typescript
 * await ro.createChain({
 *   chain_id: "eip155:8453",
 *   pay_to_address: "0x...",
 *   stablecoin_symbol: "USDC",
 * });
 * ```
 */
Rollover.prototype.createChain = async function (
  this: Rollover,
  params: CreateChainParams,
): Promise<Chain> {
  const q = await this._adminQuery();
  return this._post<Chain>("/v1/organization/chains", q, params);
};

/**
 * Edit a chain's address, stablecoin, enabled flag, or priority, sending only the fields
 * provided so the rest stay at their current values.
 */
Rollover.prototype.updateChain = async function (
  this: Rollover,
  params: { id: string } & UpdateChainParams,
): Promise<Chain> {
  const q = await this._adminQuery();
  const { id, ...body } = params;
  return this._put<Chain>(`/v1/organization/chains/${encodeURIComponent(id)}`, q, body);
};

/**
 * Remove a chain so subscribers can no longer pay on it; if this was the only enabled chain,
 * paid flows fail with `no_chain_configured` until another is added.
 */
Rollover.prototype.deleteChain = async function (
  this: Rollover,
  params: { id: string },
): Promise<void> {
  const q = await this._adminQuery();
  await this._del(`/v1/organization/chains/${encodeURIComponent(params.id)}`, q);
};
