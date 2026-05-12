import { describe, test, expect, mock } from "bun:test";

// Mock heavy external dependencies before importing Rollover.
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
  SIGN_IN_WITH_X: "SIGN-IN-WITH-X",
  createSIWxPayload: async () => ({ signature: "0xmock" }),
  encodeSIWxHeader: () => "mock-siwx-header",
}));

mock.module("@x402/core/http", () => ({
  decodePaymentRequiredHeader: () => ({
    extensions: {
      "SIGN-IN-WITH-X": {
        info: {
          domain: "localhost",
          uri: "http://localhost",
          nonce: "abc",
          version: "1",
          issuedAt: new Date().toISOString(),
          expirationTime: new Date(Date.now() + 300_000).toISOString(),
        },
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

mock.module("jose", () => ({
  base64url: { encode: () => "mock-b64" },
  SignJWT: class {
    setProtectedHeader() { return this; }
    async sign() { return "mock-jwt"; }
  },
}));

import { Rollover } from "./rollover.js";
import type { RolloverEvent } from "./types.js";

function mockFetch(status: number, body: unknown, headers?: Record<string, string>) {
  return mock(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...headers },
      }),
    ),
  );
}

function createClient(apiUrl = "http://localhost:9000") {
  return new Rollover({ apiUrl, orgSlug: "test-org", mode: "test" });
}

describe("Rollover", () => {
  describe("constructor", () => {
    test("starts disconnected", () => {
      const r = createClient();
      expect(r.wallet).toBeNull();
      expect(r.isConnected).toBe(false);
      expect(r.activity).toEqual([]);
    });

    test("defaults to api.rollover.dev when apiUrl is omitted", async () => {
      const r = new Rollover({ orgSlug: "test-org", mode: "live" });
      const calls: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock((input: RequestInfo | URL) => {
        calls.push(typeof input === "string" ? input : input.toString());
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }) as typeof fetch;

      try {
        await r.listPlans();
        expect(calls[0]).toStartWith("https://api.rollover.dev/v1/pricing/test-org");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("trims trailing slashes from apiUrl", async () => {
      const r = createClient("http://localhost:9000///");
      const calls: string[] = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock((input: RequestInfo | URL) => {
        calls.push(typeof input === "string" ? input : input.toString());
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }) as typeof fetch;

      try {
        await r.listPlans();
        expect(calls[0]).toStartWith("http://localhost:9000/v1/pricing/test-org");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("events", () => {
    test("on() receives emitted events", () => {
      const r = createClient();
      const events: RolloverEvent[] = [];
      r.on("event", (e) => events.push(e));
      r.log("test message");
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("info");
      expect(events[0].detail).toBe("test message");
      expect(events[0].level).toBe("info");
      expect(events[0].timestamp).toBeGreaterThan(0);
    });

    test("log() accepts a level", () => {
      const r = createClient();
      r.log("warned", "warning");
      expect(r.activity[0].level).toBe("warning");
    });

    test("on() returns an unsubscribe function", () => {
      const r = createClient();
      let count = 0;
      const off = r.on("event", () => count++);
      r.log("first");
      off();
      r.log("second");
      expect(count).toBe(1);
    });

    test("activity accumulates events", () => {
      const r = createClient();
      r.log("first");
      r.log("second");
      expect(r.activity).toHaveLength(2);
      expect(r.activity[0].detail).toBe("first");
      expect(r.activity[1].detail).toBe("second");
    });
  });

  describe("listPlans", () => {
    test("fetches and returns plans", async () => {
      const plans = [
        { id: "1", slug: "free", name: "Free", price_usdc: "0", setup_fee_usdc: "0", billing_period: "monthly", trial_days: 0 },
        { id: "2", slug: "pro", name: "Pro", price_usdc: "10", setup_fee_usdc: "0", billing_period: "monthly", trial_days: 0 },
      ];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch(200, plans) as typeof fetch;

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
  });

  describe("disconnect", () => {
    test("clears state and emits an event", () => {
      const r = createClient();
      // Force internal state as if we were connected.
      (r as unknown as { walletAddress: string }).walletAddress = "0xabc";
      expect(r.isConnected).toBe(true);
      r.disconnect();
      expect(r.isConnected).toBe(false);
      expect(r.wallet).toBeNull();
      expect(r.activity.some((e) => e.type === "wallet.disconnected")).toBe(true);
    });
  });
});
