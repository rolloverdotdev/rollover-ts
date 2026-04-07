import { Rollover } from "./rollover.js";
import type { CreditBalance, CreditTransaction, GrantResult, ListOptions, Page } from "./types.js";

declare module "./rollover.js" {
  interface Rollover {
    getCredits(params: { wallet: string }): Promise<CreditBalance>;
    grantCredits(params: {
      wallet: string;
      amount: number;
      description?: string;
      expiresAt?: string;
    }): Promise<GrantResult>;
    listCreditTransactions(opts?: ListOptions): Promise<Page<CreditTransaction>>;
  }
}

/**
 * Get the credit balance for a wallet.
 *
 * @example
 * ```typescript
 * const { balance } = await ro.getCredits({ wallet: "0xabc..." });
 * ```
 */
Rollover.prototype.getCredits = async function (
  this: Rollover,
  params: { wallet: string },
): Promise<CreditBalance> {
  return this._get<CreditBalance>("/v1/credits", { wallet: params.wallet });
};

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
Rollover.prototype.grantCredits = async function (
  this: Rollover,
  params: {
    wallet: string;
    amount: number;
    description?: string;
    expiresAt?: string;
  },
): Promise<GrantResult> {
  return this._post<GrantResult>("/v1/credits", undefined, {
    wallet: params.wallet,
    amount: params.amount,
    ...(params.description && { description: params.description }),
    ...(params.expiresAt && { expires_at: params.expiresAt }),
  });
};

/**
 * List credit transactions with optional filters.
 *
 * @example
 * ```typescript
 * const { data: txns } = await ro.listCreditTransactions({ wallet: "0xabc..." });
 * ```
 */
Rollover.prototype.listCreditTransactions = async function (
  this: Rollover,
  opts?: ListOptions,
): Promise<Page<CreditTransaction>> {
  const q = await this._adminQuery(opts);
  return this._get<Page<CreditTransaction>>("/v1/credits/transactions", q);
};
