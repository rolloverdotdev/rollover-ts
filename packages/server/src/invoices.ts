import { Rollover } from "./rollover.js";
import type { Invoice, ListOptions, Page } from "./types.js";

declare module "./rollover.js" {
  interface Rollover {
    listInvoices(opts?: ListOptions): Promise<Page<Invoice>>;
  }
}

/**
 * List invoices with optional filters.
 *
 * @example
 * ```typescript
 * const { data: invoices } = await ro.listInvoices({ wallet: "0xabc..." });
 * ```
 */
Rollover.prototype.listInvoices = async function (
  this: Rollover,
  opts?: ListOptions,
): Promise<Page<Invoice>> {
  const q = await this._adminQuery(opts);
  return this._get<Page<Invoice>>("/v1/invoices", q);
};
