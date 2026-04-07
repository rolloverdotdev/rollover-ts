import { Rollover } from "./rollover.js";
import type { Organization } from "./types.js";

declare module "./rollover.js" {
  interface Rollover {
    getOrganization(): Promise<Organization>;
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
