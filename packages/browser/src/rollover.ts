/**
 * Rollover Browser SDK.
 *
 * Handles wallet connection, SIWX → DPoP wallet-session exchange, dynamic chain selection
 * from `/v1/networks`, and x402 payments for subscribe and switch-plan flows.
 */

import { decodePaymentRequiredHeader } from "@x402/core/http";
import { ExactEvmScheme, toClientEvmSigner } from "@x402/evm";
import {
  createSIWxPayload,
  encodeSIWxHeader,
  SIGN_IN_WITH_X,
} from "@x402/extensions/sign-in-with-x";
import type {
  CompleteSIWxInfo,
  EVMSigner,
  SIWxExtension,
} from "@x402/extensions/sign-in-with-x";
import {
  decodePaymentResponseHeader,
  wrapFetchWithPayment,
  x402Client,
} from "@x402/fetch";
import { base64url, SignJWT } from "jose";
import type { JWK } from "jose";
import { createWalletClient, custom, getAddress } from "viem";
import type { Chain } from "viem";
import { RolloverError } from "./errors.js";
import type {
  RolloverConfig,
  RolloverEvent,
  RolloverEventLevel,
  RolloverNetwork,
  RolloverPlan,
  RolloverSubscription,
} from "./types.js";

declare global {
  interface Window {
    ethereum?: {
      request<T = unknown>(args: { method: string; params?: unknown }): Promise<T>;
    };
  }
}

const DEFAULT_API_URL = "https://api.rollover.dev";
const SESSION_REFRESH_SKEW_MS = 30_000;

type WalletAdd = NonNullable<RolloverNetwork["walletAdd"]>;

type EVMNetwork = RolloverNetwork & {
  type: "evm";
  chainId: number;
  chainHex: `0x${string}`;
  chain: Chain;
  walletAdd: WalletAdd;
};

type BrowserEthereumProvider = NonNullable<Window["ethereum"]>;

type SubscriptionResponse = {
  subscription: RolloverSubscription;
  transaction?: string;
};

type WalletSessionResponse = {
  access_token: string;
  token_type: "DPoP";
  expires_in: number;
  wallet: string;
};

type RequestOptions = {
  auth?: boolean;
  body?: Record<string, unknown>;
  paid?: boolean;
  idempotencyKey?: string;
};

export class Rollover {
  private readonly apiUrl: string;
  private readonly orgSlug: string;
  private readonly mode: "test" | "live";
  private walletAddress: `0x${string}` | null = null;
  private provider: BrowserEthereumProvider | null = null;
  private session: { token: string; expiresAt: number } | null = null;
  private dpopKey: CryptoKeyPair | null = null;
  private dpopJwk: JWK | null = null;
  private cachedNetworks: EVMNetwork[] | null = null;
  private cachedPayFetch: typeof fetch | null = null;
  private connectPromise: Promise<`0x${string}`> | null = null;
  private sessionPromise: Promise<void> | null = null;
  private events: RolloverEvent[] = [];
  private listeners: ((e: RolloverEvent) => void)[] = [];

  constructor(config: RolloverConfig) {
    this.apiUrl = (config.apiUrl ?? DEFAULT_API_URL).replace(/\/+$/, "");
    this.orgSlug = config.orgSlug;
    this.mode = config.mode;
  }

  get wallet() {
    return this.walletAddress;
  }

  get isConnected() {
    return this.walletAddress !== null;
  }

  get activity() {
    return this.events;
  }

  on(_: "event", fn: (e: RolloverEvent) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((listener) => listener !== fn);
    };
  }

  log(detail: string, level: RolloverEventLevel = "info") {
    this.emit("info", detail, level);
  }

  async connect(): Promise<`0x${string}`> {
    if (this.walletAddress) return this.walletAddress;
    this.connectPromise ??= this.connectWallet().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  disconnect() {
    this.walletAddress = null;
    this.provider = null;
    this.session = null;
    this.cachedPayFetch = null;
    this.connectPromise = null;
    this.sessionPromise = null;
    this.emit("wallet.disconnected", "Wallet disconnected");
  }

  async listPlans(): Promise<RolloverPlan[]> {
    const plans = await this.request<RolloverPlan[]>(
      "GET",
      `/v1/pricing/${encodeURIComponent(this.orgSlug)}?mode=${this.mode}`,
      { auth: false },
    );
    this.emit(
      "plans.loaded",
      `Loaded ${plans.length} plan${plans.length === 1 ? "" : "s"}`,
      "success",
    );
    return plans;
  }

  async subscribe(planSlug: string): Promise<RolloverSubscription> {
    const sub = await this.changePlan("POST", { plan_slug: planSlug, org_slug: this.orgSlug });
    this.emit("subscription.created", `Subscribed to ${sub.plan_name ?? planSlug}`, "success");
    return sub;
  }

  async switchPlan(planSlug: string): Promise<RolloverSubscription> {
    const sub = await this.changePlan("PUT", { plan_slug: planSlug });
    this.emit("subscription.switched", `Switched to ${sub.plan_name ?? planSlug}`, "success");
    return sub;
  }

  async getSubscription(): Promise<RolloverSubscription | null> {
    try {
      const sub = await this.request<RolloverSubscription>("GET", "/v1/subscription");
      this.emit(
        "subscription.loaded",
        sub.plan_name ? `Current subscription: ${sub.plan_name}` : "Current subscription loaded",
        sub.cancel_at_end ? "warning" : "success",
      );
      return sub;
    } catch (error) {
      if (error instanceof RolloverError && error.status === 404) {
        this.emit("subscription.none", "No active subscription");
        return null;
      }
      throw error;
    }
  }

  async cancel(): Promise<RolloverSubscription> {
    const sub = await this.request<RolloverSubscription>("DELETE", "/v1/subscription");
    this.emit(
      "subscription.cancelled",
      `Cancels at ${new Date(sub.period_end).toLocaleString()}`,
      "warning",
    );
    return sub;
  }

  async resume(): Promise<RolloverSubscription> {
    const sub = await this.request<RolloverSubscription>("POST", "/v1/subscription/resume");
    this.emit(
      "subscription.resumed",
      `Renews ${new Date(sub.period_end).toLocaleString()}`,
      "success",
    );
    return sub;
  }

  private async changePlan(method: "POST" | "PUT", body: Record<string, unknown>) {
    const data = await this.request<SubscriptionResponse>(method, "/v1/subscription", {
      body,
      paid: true,
    });
    return data.subscription;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    if (opts.auth !== false) await this.ensureSession();

    const url = this.url(path);
    const headers = await this.headers(method, url, opts);
    const fetcher = opts.paid ? await this.paymentFetch() : fetch;
    const res = await fetcher(url, {
      method,
      headers,
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    });

    if (!res.ok) {
      const err = await RolloverError.from(res);
      if (opts.paid) this.emit("payment.failed", paymentFailureMessage(err), "error");
      throw err;
    }

    const settlement = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
    if (settlement) {
      try {
        const decoded = decodePaymentResponseHeader(settlement);
        const tx = decoded.transaction ? shortTx(decoded.transaction) : null;
        this.emit(
          "payment.settlement",
          tx ? `Settled onchain, tx ${tx}` : "Settled onchain",
          "success",
        );
      } catch {
        this.emit("payment.settlement", "Settled onchain", "success");
      }
    }

    return res.json() as Promise<T>;
  }

  private async headers(method: string, url: string, opts: RequestOptions) {
    const headers = new Headers({
      accept: "application/json",
      "x-org-slug": this.orgSlug,
      "x-mode": this.mode,
    });

    if (opts.body) headers.set("content-type", "application/json");
    if (opts.paid) headers.set("idempotency-key", opts.idempotencyKey ?? crypto.randomUUID());
    if (opts.auth === false) return headers;

    const session = this.session;
    if (!session) throw new Error("Wallet session was not established");
    headers.set("authorization", `DPoP ${session.token}`);
    headers.set("dpop", await this.dpop(method, url, session.token));
    return headers;
  }

  private async connectWallet(): Promise<`0x${string}`> {
    const provider = window.ethereum;
    if (!provider) throw new Error("No wallet found");

    this.emit("wallet.connecting", "Requesting wallet connection...");
    const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
    const address = getAddress((accounts[0] ?? "") as `0x${string}`);

    this.provider = provider;
    this.walletAddress = address;
    await this.ensureSession();
    this.emit("wallet.connected", "Wallet connected and authenticated", "success");
    return address;
  }

  private async ensureSession() {
    if (!this.walletAddress || !this.provider) await this.connect();
    if (this.session && Date.now() < this.session.expiresAt - SESSION_REFRESH_SKEW_MS) return;

    this.sessionPromise ??= this.refreshSession().finally(() => {
      this.sessionPromise = null;
    });
    await this.sessionPromise;
  }

  private async refreshSession() {
    if (!this.walletAddress || !this.provider) throw new Error("Wallet not connected");
    await this.ensureDPoPKey();

    const sessionURL = this.url("/v1/wallet/session");
    const challenge = await fetch(sessionURL, {
      headers: await this.headers("GET", sessionURL, { auth: false }),
    });
    const paymentRequired = challenge.headers.get("PAYMENT-REQUIRED");
    if (!paymentRequired) throw new Error("Server did not return SIWX challenge");

    const pr = decodePaymentRequiredHeader(paymentRequired);
    const siwx = pr.extensions?.[SIGN_IN_WITH_X] as SIWxExtension | undefined;
    const networks = await this.evmNetworks();
    const selected = siwx?.supportedChains
      ?.map((chain) => ({
        chain,
        network: networks.find((network) => network.chain_id === chain.chainId),
      }))
      .find(
        (candidate): candidate is { chain: CompleteSIWxInfo; network: EVMNetwork } =>
          candidate.chain.type === "eip191" && !!candidate.network,
      );

    if (!siwx || !selected) {
      throw new Error("Server did not include an EVM SIWX chain this browser SDK can use");
    }

    await this.switchNetwork(selected.network);
    const walletClient = createWalletClient({
      account: this.walletAddress,
      chain: selected.network.chain,
      transport: custom(this.provider),
    });
    const signer: EVMSigner = {
      address: this.walletAddress,
      signMessage: ({ message }) =>
        walletClient.signMessage({ account: this.walletAddress!, message }),
    };

    this.emit("auth.signing", `Signing SIWX for ${selected.network.name}...`);
    const info: CompleteSIWxInfo = {
      ...siwx.info,
      chainId: selected.chain.chainId,
      type: selected.chain.type,
    };
    const payload = await createSIWxPayload(info, signer);
    const res = await fetch(sessionURL, {
      method: "POST",
      headers: {
        "x-org-slug": this.orgSlug,
        "x-mode": this.mode,
        [SIGN_IN_WITH_X]: encodeSIWxHeader(payload),
        dpop: await this.dpop("POST", sessionURL),
      },
    });

    if (!res.ok) throw await RolloverError.from(res);

    const session = (await res.json()) as WalletSessionResponse;
    if (session.token_type !== "DPoP" || !session.access_token) {
      throw new Error("Server did not issue a DPoP wallet session");
    }
    this.session = {
      token: session.access_token,
      expiresAt: Date.now() + session.expires_in * 1000,
    };
  }

  private async paymentFetch() {
    if (this.cachedPayFetch) return this.cachedPayFetch;
    if (!this.walletAddress || !this.provider) throw new Error("Wallet not connected");

    const networks = await this.evmNetworks();
    const firstNetwork = networks[0];
    if (!firstNetwork) throw new Error("No EVM payment networks are available");
    let paymentNetwork = firstNetwork;
    const signer = toClientEvmSigner({
      address: this.walletAddress,
      signTypedData: (payload) =>
        createWalletClient({
          account: this.walletAddress!,
          chain: paymentNetwork.chain,
          transport: custom(this.provider!),
        }).signTypedData({ ...payload, account: this.walletAddress! }),
    });

    const rpcConfig = Object.fromEntries(
      networks
        .filter((network) => network.rpc_url)
        .map((network) => [network.chainId, { rpcUrl: network.rpc_url! }]),
    );
    const authedFetch: typeof fetch = async (input, init) => {
      await this.ensureSession();
      const url = input instanceof Request ? input.url : String(input);
      const method = init?.method ?? (input instanceof Request ? input.method : "GET");
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
      const session = this.session;
      if (!session) throw new Error("Wallet session was not established");
      headers.set("authorization", `DPoP ${session.token}`);
      headers.set("dpop", await this.dpop(method, url, session.token));
      return fetch(input, { ...init, headers });
    };

    const client = new x402Client()
      .register("eip155:*", new ExactEvmScheme(signer, rpcConfig))
      .onBeforePaymentCreation(async (ctx) => {
        const network = networks.find(
          (item) => item.chain_id === ctx.selectedRequirements.network,
        );
        if (!network) {
          throw new Error(
            `Unsupported EVM payment network: ${ctx.selectedRequirements.network}`,
          );
        }
        await this.switchNetwork(network);
        paymentNetwork = network;
        const amount = formatAtomicAmount(
          ctx.selectedRequirements.amount,
          ctx.selectedRequirements.extra,
        );
        this.emit(
          "payment.required",
          `Pay ${amount} on ${network.name}, please approve in your wallet`,
        );
      })
      .onAfterPaymentCreation(async (ctx) => {
        const amount = formatAtomicAmount(
          ctx.selectedRequirements.amount,
          ctx.selectedRequirements.extra,
        );
        this.emit("payment.signed", `Signed ${amount}, settling onchain`, "success");
      });

    this.cachedPayFetch = wrapFetchWithPayment(authedFetch, client);
    return this.cachedPayFetch;
  }

  private async evmNetworks() {
    if (this.cachedNetworks) return this.cachedNetworks;
    const res = await fetch(this.url(`/v1/networks?mode=${this.mode}`));
    if (!res.ok) throw await RolloverError.from(res);
    const networks = (await res.json()) as RolloverNetwork[];
    this.cachedNetworks = networks.filter(
      (network): network is EVMNetwork =>
        network.type === "evm" &&
        !!network.chainId &&
        !!network.chainHex &&
        !!network.chain &&
        !!network.walletAdd,
    );
    return this.cachedNetworks;
  }

  private async switchNetwork(network: EVMNetwork) {
    if (!this.provider) throw new Error("Wallet not connected");
    const current = await this.provider.request<string>({ method: "eth_chainId" });
    if (current?.toLowerCase() === network.chainHex.toLowerCase()) return;

    this.emit("wallet.switching", `Switching to ${network.name}...`);
    try {
      await this.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: network.chainHex }],
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 4902) throw error;
      this.emit("wallet.adding", `Adding ${network.name} to wallet...`);
      await this.provider.request({
        method: "wallet_addEthereumChain",
        params: [network.walletAdd],
      });
    }

    const next = await this.provider.request<string>({ method: "eth_chainId" });
    if (next?.toLowerCase() !== network.chainHex.toLowerCase()) {
      throw new Error(`Wallet did not switch to ${network.name}`);
    }
  }

  private async ensureDPoPKey() {
    if (this.dpopKey && this.dpopJwk) return;
    this.dpopKey = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    );
    const publicKey = await crypto.subtle.exportKey("jwk", this.dpopKey.publicKey);
    if (publicKey.kty !== "EC" || publicKey.crv !== "P-256" || !publicKey.x || !publicKey.y) {
      throw new Error("Failed to create DPoP public key");
    }
    this.dpopJwk = { kty: "EC", crv: "P-256", x: publicKey.x, y: publicKey.y };
  }

  private async dpop(method: string, rawURL: string, token?: string) {
    await this.ensureDPoPKey();
    if (!this.dpopKey || !this.dpopJwk) throw new Error("DPoP key was not created");

    const url = new URL(rawURL);
    url.search = "";
    url.hash = "";
    const claims: Record<string, string | number> = {
      htm: method.toUpperCase(),
      htu: url.toString(),
      jti: crypto.randomUUID(),
      iat: Math.floor(Date.now() / 1000),
    };
    if (token) {
      claims.ath = base64url.encode(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
        ),
      );
    }

    return new SignJWT(claims)
      .setProtectedHeader({ typ: "dpop+jwt", alg: "ES256", jwk: this.dpopJwk })
      .sign(this.dpopKey.privateKey);
  }

  private url(path: string) {
    return path.startsWith("http") ? path : `${this.apiUrl}${path}`;
  }

  private emit(type: string, detail: string, level: RolloverEventLevel = "info") {
    const event = { type, detail, level, timestamp: Date.now() } satisfies RolloverEvent;
    this.events.push(event);
    this.listeners.forEach((listener) => listener(event));
  }
}

function formatAtomicAmount(atomic: string, extra: unknown): string {
  const name = (extra as { name?: string } | null | undefined)?.name ?? "USDC";
  const decimals = 6;
  if (!atomic) return name;
  const n = Number(atomic);
  if (!Number.isFinite(n)) return name;
  return `${(n / 10 ** decimals).toFixed(2)} ${name}`;
}

function shortTx(hash: string) {
  if (hash.length < 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function paymentFailureMessage(err: RolloverError): string {
  const code = err.code || "unknown";
  if (code === "settlement_failed") return "Settlement failed onchain, please retry";
  if (code === "invalid_payment") return "Payment payload was rejected by the facilitator";
  if (code === "invalid_exact_evm_payload_authorization_value") {
    return "Signed payment amount did not match the invoice, please retry";
  }
  if (err.message) return `${err.message} (${code})`;
  return `Payment failed (${code})`;
}
