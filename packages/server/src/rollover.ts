import { parseError } from "./errors.js";
import type { ListOptions, Organization } from "./types.js";

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

  private async resolveSlug(): Promise<string> {
    if (this.slugCache) return this.slugCache;
    if (!this.slugPromise) {
      this.slugPromise = this._get<Organization>("/v1/organization")
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

  async _adminQuery(opts?: ListOptions): Promise<Record<string, string>> {
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

  async _get<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this._request("GET", path, query) as Promise<T>;
  }

  async _post<T>(
    path: string,
    query?: Record<string, string>,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    return this._request("POST", path, query, body, extraHeaders) as Promise<T>;
  }

  async _patch<T>(
    path: string,
    query?: Record<string, string>,
    body?: unknown,
  ): Promise<T> {
    return this._request("PATCH", path, query, body) as Promise<T>;
  }

  async _del(
    path: string,
    query?: Record<string, string>,
  ): Promise<unknown> {
    return this._request("DELETE", path, query);
  }

  private async _request(
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
