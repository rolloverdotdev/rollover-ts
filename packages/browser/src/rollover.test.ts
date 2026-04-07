import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock heavy external dependencies before importing Rollover
mock.module("@x402/fetch", () => ({
  wrapFetchWithPayment: (_fetch: typeof fetch) => _fetch,
  x402Client: class {
    register() { return this; }
    onBeforePaymentCreation() { return this; }
    onAfterPaymentCreation() { return this; }
    onPaymentCreationFailure() { return this; }
  },
  decodePaymentResponseHeader: () => ({}),
}));

mock.module("@x402/extensions/sign-in-with-x", () => ({
  createSIWxPayload: async () => ({ signature: "0xmock" }),
  encodeSIWxHeader: () => "mock-siwx-header",
}));

mock.module("@x402/core/http", () => ({
  decodePaymentRequiredHeader: () => ({
    extensions: {
      "sign-in-with-x": {
        info: { domain: "localhost", uri: "http://localhost", nonce: "abc", version: "1", issuedAt: new Date().toISOString(), expirationTime: new Date(Date.now() + 300_000).toISOString() },
        supportedChains: [{ chainId: "eip155:84532", type: "eip191" }],
      },
    },
  }),
}));

mock.module("@x402/evm", () => ({
  ExactEvmScheme: class {},
  toClientEvmSigner: () => ({}),
}));

mock.module("viem", () => ({
  createWalletClient: () => ({
    signMessage: async () => "0xsig",
    signTypedData: async () => "0xsig",
  }),
  custom: () => ({}),
  getAddress: (addr: string) => addr,
}));

mock.module("viem/chains", () => ({
  base: { id: 8453 },
  baseSepolia: { id: 84532 },
}));

import { Rollover } from "./rollover.js";
import { RolloverError } from "./errors.js";
import type { RolloverEvent } from "./types.js";

function mockFetch(status: number, body: unknown, headers?: Record<string, string>) {
  return mock(() =>
    Promise.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    })),
  );
}

function createClient() {
  return new Rollover({ apiUrl: "http://localhost:9000", orgSlug: "test-org", mode: "test" });
}

describe("Rollover", () => {
  describe("constructor and getters", () => {
    test("starts disconnected with no wallet", () => {
      const r = createClient();
      expect(r.wallet).toBeNull();
      expect(r.isConnected).toBe(false);
      expect(r.activity).toEqual([]);
    });
  });

  describe("event system", () => {
    test("on() receives emitted events", () => {
      const r = createClient();
      const events: RolloverEvent[] = [];
      r.on("event", (e) => events.push(e));
      r.log("test message");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("info");
      expect(events[0].detail).toBe("test message");
      expect(events[0].timestamp).toBeGreaterThan(0);
    });

    test("activity accumulates events", () => {
      const r = createClient();
      r.log("first");
      r.log("second");
      expect(r.activity).toHaveLength(2);
      expect(r.activity[0].detail).toBe("first");
      expect(r.activity[1].detail).toBe("second");
    });

    test("multiple listeners all receive events", () => {
      const r = createClient();
      let count = 0;
      r.on("event", () => count++);
      r.on("event", () => count++);
      r.log("hello");
      expect(count).toBe(2);
    });
  });

  describe("listPlans", () => {
    test("fetches and returns plans", async () => {
      const plans = [
        { id: "1", slug: "free", name: "Free", price_usdc: "0", billing_period: "monthly", trial_days: 0, setup_fee_usdc: "0" },
        { id: "2", slug: "pro", name: "Pro", price_usdc: "10", billing_period: "monthly", trial_days: 0, setup_fee_usdc: "0" },
      ];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch(200, plans) as any;

      try {
        const r = createClient();
        const result = await r.listPlans();
        expect(result).toHaveLength(2);
        expect(result[0].slug).toBe("free");
        expect(result[1].slug).toBe("pro");
        expect(r.activity.some((e) => e.type === "plans.loaded")).toBe(true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("throws on failed fetch", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch(500, {}) as any;

      try {
        const r = createClient();
        await expect(r.listPlans()).rejects.toThrow("Failed to fetch plans");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("getSubscription", () => {
    test("returns null on 404", async () => {
      const r = createClient();
      (r as any)._payFetch = mockFetch(404, { code: "not_found", message: "not found" });
      const sub = await r.getSubscription();
      expect(sub).toBeNull();
      expect(r.activity.some((e) => e.type === "subscription.none")).toBe(true);
    });

    test("throws on other errors", async () => {
      const r = createClient();
      (r as any)._payFetch = mockFetch(500, { code: "internal", message: "server error" });
      await expect(r.getSubscription()).rejects.toThrow("server error");
    });
  });

  describe("dedupe", () => {
    test("deduplicates concurrent calls", async () => {
      const r = createClient();
      let callCount = 0;
      const sub = { id: "1", plan_id: "p1", plan_name: "Pro", wallet_address: "0x1", status: "active", period_start: "2026-01-01", period_end: "2026-02-01", cancel_at_end: false };
      (r as any)._payFetch = mock(() => {
        callCount++;
        return Promise.resolve(new Response(JSON.stringify({ subscription: sub }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }));
      });

      const [a, b] = await Promise.all([r.subscribe("pro"), r.subscribe("pro")]);
      expect(callCount).toBe(1);
      expect(a.id).toBe(b.id);
    });

    test("allows new call after previous completes", async () => {
      const r = createClient();
      let callCount = 0;
      const sub = { id: "1", plan_id: "p1", plan_name: "Pro", wallet_address: "0x1", status: "active", period_start: "2026-01-01", period_end: "2026-02-01", cancel_at_end: false };
      (r as any)._payFetch = mock(() => {
        callCount++;
        return Promise.resolve(new Response(JSON.stringify({ subscription: sub }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }));
      });

      await r.subscribe("pro");
      await r.subscribe("pro");
      expect(callCount).toBe(2);
    });
  });
});
