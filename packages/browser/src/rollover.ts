import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";
import { createWalletClient, custom } from "viem";
import { base, baseSepolia } from "viem/chains";
import type { Subscription, Plan } from "@rolloverdotdev/client";

export type RolloverConfig = {
  apiUrl: string;
  orgSlug: string;
  mode: "test" | "live";
};

export type RolloverEvent = {
  type: string;
  detail: string;
  timestamp: number;
};

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
  },
  live: {
    hex: "0x2105",
    id: "8453",
    viem: base,
    name: "Base",
    rpc: "https://mainnet.base.org",
  },
} as const;

class RolloverError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "RolloverError";
  }
}

export class Rollover {
  private config: RolloverConfig;
  private _wallet: string | null = null;
  private _token: string | null = null;
  private _payFetch: typeof fetch | null = null;
  private _events: RolloverEvent[] = [];
  private _listeners: ((e: RolloverEvent) => void)[] = [];

  constructor(config: RolloverConfig) {
    this.config = config;
  }

  get wallet() {
    return this._wallet;
  }
  get isConnected() {
    return this._wallet !== null;
  }
  get isAuthenticated() {
    return this._token !== null;
  }
  get activity() {
    return this._events;
  }

  on(_: "event", fn: (e: RolloverEvent) => void) {
    this._listeners.push(fn);
  }

  private emit(type: string, detail: string) {
    const e: RolloverEvent = { type, detail, timestamp: Date.now() };
    this._events.push(e);
    this._listeners.forEach((fn) => fn(e));
  }

  private chain() {
    return CHAINS[this.config.mode];
  }

  private async request<T>(
    method: string,
    path: string,
    opts?: { body?: Record<string, unknown>; payment?: boolean },
  ): Promise<T> {
    const f = opts?.payment ? (this._payFetch ?? fetch) : fetch;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Org-Slug": this.config.orgSlug,
      "X-Mode": this.config.mode,
    };
    if (this._token) headers["Authorization"] = `Bearer ${this._token}`;
    if (opts?.payment) headers["Idempotency-Key"] = crypto.randomUUID();

    const res = await f(`${this.config.apiUrl}${path}`, {
      method,
      headers,
      ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
    });

    if (!res.ok && res.status !== 201) {
      const err = await res
        .json()
        .catch(() => ({ code: "unknown", message: "Request failed" }));
      throw new RolloverError(
        res.status,
        err.code ?? "unknown",
        err.message ?? "Request failed",
      );
    }
    return res.json();
  }

  async connect(): Promise<string> {
    if (!window.ethereum) throw new Error("No wallet found");
    this.emit("wallet.connecting", "Requesting wallet connection...");

    const accounts: string[] = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    const addr = accounts[0] ?? "";
    if (!addr) throw new Error("No account returned");

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: this.chain().hex }],
      });
    } catch (e: unknown) {
      if (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code: number }).code === 4902
      ) {
        const c = this.chain();
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: c.hex,
              chainName: c.name,
              rpcUrls: [c.rpc],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            },
          ],
        });
      }
    }

    this._wallet = addr;
    this._payFetch = this.buildPayFetch(addr);
    this.emit(
      "wallet.connected",
      `Connected: ${addr.slice(0, 6)}...${addr.slice(-4)}`,
    );
    return addr;
  }

  async authenticate(): Promise<string> {
    if (!this._wallet) throw new Error("Connect wallet first");
    this.emit("auth.signing", "Requesting SIWE signature...");

    const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const now = new Date();
    const exp = new Date(now.getTime() + 5 * 60 * 1000);

    const siwe = {
      domain: window.location.host,
      address: this._wallet,
      uri: window.location.origin,
      version: "1",
      chainId: `eip155:${this.chain().id}`,
      nonce,
      issuedAt: now.toISOString(),
      expirationTime: exp.toISOString(),
      statement: "Sign in to Rollover",
      signatureScheme: "eip191",
      signature: "",
    };

    siwe.signature = await window.ethereum.request({
      method: "personal_sign",
      params: [buildSIWEMessage(siwe), this._wallet],
    });

    const res = await fetch(`${this.config.apiUrl}/v1/auth/siwe`, {
      method: "POST",
      headers: {
        "SIGN-IN-WITH-X": btoa(JSON.stringify(siwe)),
        "X-Org-Slug": this.config.orgSlug,
        "X-Mode": this.config.mode,
      },
    });
    if (!res.ok)
      throw new Error(
        (await res.json().catch(() => ({}))).message ?? "Auth failed",
      );

    const data: { token: string; expires_at: string } = await res.json();
    this._token = data.token;
    this.emit(
      "auth.authenticated",
      `Session expires ${new Date(data.expires_at).toLocaleTimeString()}`,
    );
    return data.token;
  }

  async listPlans(): Promise<Plan[]> {
    const res = await fetch(
      `${this.config.apiUrl}/v1/pricing/${this.config.orgSlug}?mode=${this.config.mode}`,
    );
    if (!res.ok) throw new Error("Failed to fetch plans");
    const data: unknown = await res.json();
    return Array.isArray(data) ? data : [];
  }

  async subscribe(planSlug: string): Promise<Subscription> {
    this.emit("subscription.subscribing", `Subscribing to ${planSlug}...`);
    const data = await this.request<
      Subscription & { subscription?: Subscription }
    >("POST", "/v1/subscription", {
      body: { plan_slug: planSlug, org_slug: this.config.orgSlug },
      payment: true,
    });
    const sub = data.subscription ?? data;
    this.emit(
      "subscription.created",
      `Subscribed to ${sub.plan_name ?? planSlug}`,
    );
    return sub;
  }

  async getSubscription(): Promise<Subscription | null> {
    try {
      return await this.request<Subscription>("GET", "/v1/subscription");
    } catch (e) {
      if (e instanceof RolloverError && e.status === 404) return null;
      throw e;
    }
  }

  async switchPlan(planSlug: string): Promise<Subscription> {
    this.emit("subscription.switching", `Switching to ${planSlug}...`);
    const data = await this.request<
      Subscription & { subscription?: Subscription }
    >("PUT", "/v1/subscription", {
      body: { plan_slug: planSlug },
      payment: true,
    });
    const sub = data.subscription ?? data;
    this.emit(
      "subscription.switched",
      `Switched to ${sub.plan_name ?? planSlug}`,
    );
    return sub;
  }

  async cancel(): Promise<Subscription> {
    this.emit("subscription.cancelling", "Cancelling...");
    const sub = await this.request<Subscription>(
      "DELETE",
      "/v1/subscription",
    );
    this.emit("subscription.cancelled", "Set to cancel at end of period");
    return sub;
  }

  async resume(): Promise<Subscription> {
    this.emit("subscription.resuming", "Resuming...");
    const sub = await this.request<Subscription>(
      "POST",
      "/v1/subscription/resume",
    );
    this.emit("subscription.resumed", "Subscription resumed");
    return sub;
  }

  private buildPayFetch(wallet: string): typeof fetch {
    const wc = createWalletClient({
      chain: this.chain().viem,
      transport: custom(window.ethereum),
      account: wallet as `0x${string}`,
    });
    const signer: ClientEvmSigner = {
      address: wallet as `0x${string}`,
      signTypedData: (p) => wc.signTypedData(p),
    };
    return wrapFetchWithPayment(
      fetch,
      new x402Client().register("eip155:*", new ExactEvmScheme(signer)),
    );
  }
}

function buildSIWEMessage(s: {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}): string {
  return [
    `${s.domain} wants you to sign in with your Ethereum account:`,
    s.address,
    "",
    s.statement,
    "",
    `URI: ${s.uri}`,
    `Version: 1`,
    `Chain ID: ${s.chainId.split(":")[1]}`,
    `Nonce: ${s.nonce}`,
    `Issued At: ${s.issuedAt}`,
    `Expiration Time: ${s.expirationTime}`,
  ].join("\n");
}
