/**
 * Rollover Browser SDK.
 * Wallet connection, SIWX authentication (CAIP-122), and x402 payment flows.
 */

import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from "@x402/fetch";
import { createSIWxPayload, encodeSIWxHeader } from "@x402/extensions/sign-in-with-x";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import { createWalletClient, custom, getAddress } from "viem";
import { base, baseSepolia } from "viem/chains";
import { RolloverError } from "./errors.js";
import type {
  RolloverConfig,
  RolloverEvent,
  RolloverPlan,
  RolloverSubscription,
} from "./types.js";

declare global {
  interface Window {
    ethereum: any;
  }
}

const CHAINS = {
  test: {
    hex: "0x14a34",
    id: "84532",
    viem: baseSepolia,
    name: "Base Sepolia",
    rpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
  },
  live: {
    hex: "0x2105",
    id: "8453",
    viem: base,
    name: "Base",
    rpc: "https://mainnet.base.org",
    explorer: "https://basescan.org",
  },
} as const;

export class Rollover {
  private config: RolloverConfig;
  private _wallet: string | null = null;
  private _payFetch: typeof fetch | null = null;
  private _events: RolloverEvent[] = [];
  private _listeners: ((e: RolloverEvent) => void)[] = [];
  private _inflight = new Map<string, Promise<unknown>>();

  constructor(config: RolloverConfig) {
    this.config = config;
  }

  get wallet() {
    return this._wallet;
  }
  get isConnected() {
    return this._wallet !== null;
  }
  get activity() {
    return this._events;
  }

  on(_: "event", fn: (e: RolloverEvent) => void) {
    this._listeners.push(fn);
  }

  log(detail: string) {
    this.emit("info", detail);
  }

  private emit(type: string, detail: string) {
    const e: RolloverEvent = { type, detail, timestamp: Date.now() };
    this._events.push(e);
    this._listeners.forEach((fn) => fn(e));
  }

  private chain() {
    return CHAINS[this.config.mode];
  }

  private dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this._inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p = fn().finally(() => this._inflight.delete(key));
    this._inflight.set(key, p);
    return p;
  }

  private txLink(hash: string) {
    return `${this.chain().explorer}/tx/${hash}`;
  }

  private async request<T>(
    method: string,
    path: string,
    opts?: { body?: Record<string, unknown>; payment?: boolean; idempotencyKey?: string },
  ): Promise<T> {
    const f = this._payFetch ?? fetch;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Org-Slug": this.config.orgSlug,
      "X-Mode": this.config.mode,
    };
    if (opts?.payment) headers["Idempotency-Key"] = opts.idempotencyKey ?? crypto.randomUUID();

    const res = await f(`${this.config.apiUrl}${path}`, {
      method,
      headers,
      ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
    });

    if (!res.ok && res.status !== 201) {
      const err = await res.json().catch(() => ({ code: "unknown", message: "Request failed" }));
      throw new RolloverError(res.status, err.code ?? "unknown", err.message ?? "Request failed");
    }

    const settlement = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
    if (settlement) {
      try {
        const decoded = decodePaymentResponseHeader(settlement);
        this.emit("payment.settlement", `Settlement success=${decoded.success} | payer ${decoded.payer} | network ${decoded.network}`);
        if (decoded.transaction) {
          this.emit("payment.tx", `Tx ${decoded.transaction}`);
          this.emit("payment.explorer", `Explorer: ${this.txLink(decoded.transaction)}`);
        }
      } catch { /* ignore */ }
    }

    return res.json();
  }

  async connect(): Promise<string> {
    if (!window.ethereum) throw new Error("No wallet found");
    this.emit("wallet.connecting", "Requesting wallet connection...");

    const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
    const addr = accounts[0] ?? "";
    if (!addr) throw new Error("No account returned");

    const c = this.chain();
    this.emit("wallet.switching", `Switching to ${c.name} (chainId ${c.id})...`);

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: c.hex }],
      });
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: number }).code === 4902) {
        this.emit("wallet.adding", `Adding ${c.name} to wallet...`);
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: c.hex,
            chainName: c.name,
            rpcUrls: [c.rpc],
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            blockExplorerUrls: [c.explorer],
          }],
        });
      }
    }

    this._wallet = addr;
    this._payFetch = await this.buildPayFetch(addr);
    this.emit("wallet.connected", `${addr.slice(0, 6)}...${addr.slice(-4)} on ${c.name}`);
    return addr;
  }

  async listPlans(): Promise<RolloverPlan[]> {
    this.emit("plans.fetching", `GET /v1/pricing/${this.config.orgSlug}`);
    const res = await fetch(`${this.config.apiUrl}/v1/pricing/${this.config.orgSlug}?mode=${this.config.mode}`);
    if (!res.ok) throw new Error("Failed to fetch plans");
    const data: unknown = await res.json();
    const plans = Array.isArray(data) ? (data as RolloverPlan[]) : [];
    this.emit("plans.loaded", `${plans.length} plan${plans.length === 1 ? "" : "s"}`);
    return plans;
  }

  async subscribe(planSlug: string): Promise<RolloverSubscription> {
    return this.dedupe(`subscribe:${planSlug}`, () => this._subscribe(planSlug));
  }

  private async _subscribe(planSlug: string): Promise<RolloverSubscription> {
    this.emit("subscription.subscribing", `Subscribing to "${planSlug}"`);
    const data = await this.request<RolloverSubscription & { subscription?: RolloverSubscription }>(
      "POST", "/v1/subscription", {
        body: { plan_slug: planSlug, org_slug: this.config.orgSlug },
        payment: true,
        idempotencyKey: crypto.randomUUID(),
      },
    );
    const sub = data.subscription ?? data;
    this.emit("subscription.created", `${sub.plan_name ?? planSlug} (${sub.status})`);
    return sub;
  }

  async getSubscription(): Promise<RolloverSubscription | null> {
    try {
      const sub = await this.request<RolloverSubscription>("GET", "/v1/subscription");
      this.emit("subscription.loaded", `${sub.plan_name ?? sub.plan_id} (${sub.status}${sub.cancel_at_end ? ", cancelling" : ""})`);
      return sub;
    } catch (e) {
      if (e instanceof RolloverError && e.status === 404) {
        this.emit("subscription.none", "No active subscription");
        return null;
      }
      throw e;
    }
  }

  async switchPlan(planSlug: string): Promise<RolloverSubscription> {
    return this.dedupe(`switchPlan:${planSlug}`, () => this._switchPlan(planSlug));
  }

  private async _switchPlan(planSlug: string): Promise<RolloverSubscription> {
    this.emit("subscription.switching", `Switching to "${planSlug}"`);
    const data = await this.request<RolloverSubscription & { subscription?: RolloverSubscription }>(
      "PUT", "/v1/subscription", {
        body: { plan_slug: planSlug },
        payment: true,
        idempotencyKey: crypto.randomUUID(),
      },
    );
    const sub = data.subscription ?? data;
    this.emit("subscription.switched", `${sub.plan_name ?? planSlug} (${sub.status})`);
    return sub;
  }

  async cancel(): Promise<RolloverSubscription> {
    return this.dedupe("cancel", () => this._cancel());
  }

  private async _cancel(): Promise<RolloverSubscription> {
    this.emit("subscription.cancelling", "Cancelling...");
    const sub = await this.request<RolloverSubscription>("DELETE", "/v1/subscription");
    this.emit("subscription.cancelled", `Cancels at ${new Date(sub.period_end).toLocaleString()}`);
    return sub;
  }

  async resume(): Promise<RolloverSubscription> {
    return this.dedupe("resume", () => this._resume());
  }

  private async _resume(): Promise<RolloverSubscription> {
    this.emit("subscription.resuming", "Resuming...");
    const sub = await this.request<RolloverSubscription>("POST", "/v1/subscription/resume");
    this.emit("subscription.resumed", `Renews ${new Date(sub.period_end).toLocaleString()}`);
    return sub;
  }

  private async buildPayFetch(wallet: string): Promise<typeof fetch> {
    const wc = createWalletClient({
      chain: this.chain().viem,
      transport: custom(window.ethereum),
      account: getAddress(wallet as `0x${string}`),
    });

    // Sign SIWX once at connect time by requesting a challenge from the server
    this.emit("auth.challenging", "Requesting SIWX challenge...");
    const challengeRes = await fetch(`${this.config.apiUrl}/v1/subscription`, {
      headers: {
        "X-Org-Slug": this.config.orgSlug,
        "X-Mode": this.config.mode,
      },
    });

    const prHeader = challengeRes.headers.get("PAYMENT-REQUIRED");
    if (!prHeader) throw new Error("Server did not return SIWX challenge");

    const pr = decodePaymentRequiredHeader(prHeader);
    const siwx = pr.extensions?.["sign-in-with-x"] as
      | { info: Record<string, unknown>; supportedChains: { chainId: string; type: string }[] }
      | undefined;
    if (!siwx?.supportedChains?.length) throw new Error("Server did not include SIWX extension");

    const chain = siwx.supportedChains[0];
    const info = { ...siwx.info, chainId: chain.chainId, type: chain.type } as Parameters<typeof createSIWxPayload>[0];

    this.emit("auth.signing", `Signing SIWX for ${chain.chainId}...`);
    const payload = await createSIWxPayload(info, wc);
    const siwxHeader = encodeSIWxHeader(payload);
    this.emit("auth.authenticated", "Wallet verified via SIWX");

    // TODO: x402 v2.9.0 wrapFetchWithPayment drops onPaymentRequired hook headers
    // on payment retries (uses original clonedRequest instead of hookRequest). Once
    // fixed upstream, replace this with x402HTTPClient + createSIWxClientHook.
    const authFetch: typeof fetch = (input, init) => {
      const headers = input instanceof Request
        ? new Headers(input.headers)
        : new Headers(init?.headers);
      if (!headers.has("SIGN-IN-WITH-X")) {
        headers.set("SIGN-IN-WITH-X", siwxHeader);
      }
      return fetch(input, { ...init, headers });
    };

    const signer = toClientEvmSigner({
      address: wallet as `0x${string}`,
      signTypedData: (p) => wc.signTypedData(p),
    });

    const client = new x402Client()
      .register("eip155:*", new ExactEvmScheme(signer))
      .onBeforePaymentCreation(async (ctx) => {
        const req = ctx.selectedRequirements;
        const usd = parseFloat((Number(req.amount) / 1e6).toFixed(6));
        this.emit("payment.402", `$${usd} USDC | ${req.scheme} | ${req.network}`);
        this.emit("payment.signing", "Signing EIP-712 authorization...");
      })
      .onAfterPaymentCreation(async () => {
        this.emit("payment.signed", "Payment signed, retrying with PAYMENT-SIGNATURE...");
      })
      .onPaymentCreationFailure(async (ctx) => {
        this.emit("payment.error", `Payment failed: ${ctx.error.message}`);
      });

    return wrapFetchWithPayment(authFetch, client);
  }
}
