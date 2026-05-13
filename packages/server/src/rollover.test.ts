import { describe, test, expect, mock } from "bun:test";
import { Rollover } from "./index.js";

function mockServer(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = mock(handler) as any;
}

function createClient() {
  return new Rollover({ apiKey: "ro_test_key", baseUrl: "http://localhost:9000" });
}

function orgResponse() {
  return new Response(JSON.stringify({ slug: "acme", id: "1", name: "Acme" }));
}

describe("Rollover constructor", () => {
  test("derives test mode from api key prefix", () => {
    const r = new Rollover({ apiKey: "ro_test_abc" });
    expect((r as any).mode).toBe("test");
  });

  test("derives live mode from api key prefix", () => {
    const r = new Rollover({ apiKey: "ro_live_abc" });
    expect((r as any).mode).toBe("live");
  });

  test("strips trailing slash from base url", () => {
    const r = new Rollover({ apiKey: "ro_test_abc", baseUrl: "http://localhost:9000/" });
    expect((r as any).baseUrl).toBe("http://localhost:9000");
  });
});

describe("API key header", () => {
  test("sends X-API-Key on every request", async () => {
    let capturedKey = "";
    mockServer((_url, init) => {
      capturedKey = (init.headers as Record<string, string>)["X-API-Key"] ?? "";
      return new Response(JSON.stringify({ allowed: true, used: 0, remaining: 100, limit: 100, plan: "pro", credit_balance: 0, credit_cost: 0 }));
    });

    const r = createClient();
    await r.check({ wallet: "0xabc", feature: "api-calls" });
    expect(capturedKey).toBe("ro_test_key");
  });
});

describe("resolveSlug", () => {
  test("caches slug after first call", async () => {
    let calls = 0;
    mockServer(() => {
      calls++;
      return new Response(JSON.stringify(calls === 1
        ? { slug: "acme", id: "1", name: "Acme" }
        : { data: [], total: 0 },
      ));
    });

    const r = createClient();
    await r.listPlans();
    await r.listPlans();
    expect(calls).toBe(3);
  });

  test("retries after failure", async () => {
    let calls = 0;
    mockServer(() => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ code: "internal", message: "down" }), { status: 500 });
      }
      if (calls === 2) return orgResponse();
      return new Response(JSON.stringify({ data: [], total: 0 }));
    });

    const r = createClient();
    await expect(r.listPlans()).rejects.toThrow();
    const plans = await r.listPlans();
    expect(plans).toBeDefined();
  });
});

describe("check", () => {
  test("returns check result", async () => {
    mockServer(() => new Response(JSON.stringify({
      allowed: true, used: 5, remaining: 95, limit: 100, plan: "pro", credit_balance: 500, credit_cost: 1,
    })));

    const r = createClient();
    const result = await r.check({ wallet: "0xabc", feature: "api-calls" });
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(5);
    expect(result.remaining).toBe(95);
    expect(result.limit).toBe(100);
    expect(result.plan).toBe("pro");
    expect(result.creditBalance).toBe(500);
    expect(result.creditCost).toBe(1);
  });

  test("defaults missing optional fields to zero", async () => {
    mockServer(() => new Response(JSON.stringify({ allowed: false })));

    const r = createClient();
    const result = await r.check({ wallet: "0xabc", feature: "api-calls" });
    expect(result.allowed).toBe(false);
    expect(result.used).toBe(0);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(0);
    expect(result.plan).toBe("");
  });
});

describe("track", () => {
  test("returns track result", async () => {
    mockServer(() => new Response(JSON.stringify({
      allowed: true, used: 6, remaining: 94, credit_balance: 499,
    })));

    const r = createClient();
    const result = await r.track({ wallet: "0xabc", feature: "api-calls", amount: 1 });
    expect(result.allowed).toBe(true);
    expect(result.used).toBe(6);
    expect(result.remaining).toBe(94);
  });

  test("sends idempotency key when provided", async () => {
    let capturedKey = "";
    mockServer((_url, init) => {
      capturedKey = (init.headers as Record<string, string>)["Idempotency-Key"] ?? "";
      return new Response(JSON.stringify({ allowed: true, used: 1, remaining: 99, credit_balance: 0 }));
    });

    const r = createClient();
    await r.track({ wallet: "0xabc", feature: "api-calls", amount: 1, idempotencyKey: "key-123" });
    expect(capturedKey).toBe("key-123");
  });

  test("auto-generates idempotency key when omitted", async () => {
    let capturedKey = "";
    mockServer((_url, init) => {
      capturedKey = (init.headers as Record<string, string>)["Idempotency-Key"] ?? "";
      return new Response(JSON.stringify({ allowed: true, used: 1, remaining: 99, credit_balance: 0 }));
    });

    const r = createClient();
    await r.track({ wallet: "0xabc", feature: "api-calls", amount: 1 });
    expect(capturedKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe("credits", () => {
  test("getCredits returns balance", async () => {
    mockServer(() => new Response(JSON.stringify({ balance: 1000 })));
    const r = createClient();
    const result = await r.getCredits({ wallet: "0xabc" });
    expect(result.balance).toBe(1000);
  });

  test("grantCredits returns result", async () => {
    mockServer(() => new Response(JSON.stringify({ balance: 1500, granted: 500 })));
    const r = createClient();
    const result = await r.grantCredits({ wallet: "0xabc", amount: 500, description: "bonus" });
    expect(result.balance).toBe(1500);
    expect(result.granted).toBe(500);
  });
});

describe("plans", () => {
  test("listPlans returns paginated plans", async () => {
    mockServer((url) => {
      if (new URL(url).pathname === "/v1/organization") return orgResponse();
      return new Response(JSON.stringify({ data: [{ id: "1", slug: "starter", name: "Starter" }], total: 1 }));
    });

    const r = createClient();
    const result = await r.listPlans();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].slug).toBe("starter");
  });

  test("getPlan returns single plan", async () => {
    mockServer((url) => {
      if (new URL(url).pathname === "/v1/organization") return orgResponse();
      return new Response(JSON.stringify({ id: "1", slug: "starter", name: "Starter" }));
    });

    const r = createClient();
    const plan = await r.getPlan({ slug: "starter" });
    expect(plan.slug).toBe("starter");
  });

  test("listPricing does not require auth slug", async () => {
    let capturedPath = "";
    mockServer((url) => {
      capturedPath = new URL(url).pathname;
      return new Response(JSON.stringify([{ id: "1", slug: "free", name: "Free" }]));
    });

    const r = createClient();
    const plans = await r.listPricing("acme");
    expect(capturedPath).toBe("/v1/pricing/acme");
    expect(plans).toHaveLength(1);
  });

  test("encodes special characters in plan slug", async () => {
    let capturedPath = "";
    mockServer((url) => {
      capturedPath = new URL(url).pathname;
      if (capturedPath === "/v1/organization") return orgResponse();
      return new Response(JSON.stringify({ id: "1", slug: "plan/special", name: "Special" }));
    });

    const r = createClient();
    await r.getPlan({ slug: "plan/special" });
    expect(capturedPath).toContain("plan%2Fspecial");
  });
});

describe("subscriptions", () => {
  test("listSubscriptions returns paginated results", async () => {
    mockServer((url) => {
      if (new URL(url).pathname === "/v1/organization") return orgResponse();
      return new Response(JSON.stringify({ data: [{ id: "sub-1", status: "active" }], total: 1 }));
    });

    const r = createClient();
    const result = await r.listSubscriptions();
    expect(result.data).toHaveLength(1);
  });

  test("getSubscription returns single subscription", async () => {
    mockServer((url) => {
      if (new URL(url).pathname === "/v1/organization") return orgResponse();
      return new Response(JSON.stringify({ id: "sub-1", status: "active" }));
    });

    const r = createClient();
    const sub = await r.getSubscription({ id: "sub-1" });
    expect(sub.id).toBe("sub-1");
  });

  test("createSubscription sends correct body", async () => {
    let capturedBody: any = null;
    mockServer(async (url, init) => {
      if (new URL(url).pathname === "/v1/organization") return orgResponse();
      capturedBody = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ id: "sub-1", status: "active" }), { status: 201 });
    });

    const r = createClient();
    await r.createSubscription({ wallet: "0xabc", planSlug: "starter" });
    expect(capturedBody.wallet_address).toBe("0xabc");
    expect(capturedBody.plan_slug).toBe("starter");
  });

  test("cancelSubscription calls DELETE", async () => {
    let capturedMethod = "";
    mockServer((url, init) => {
      if (new URL(url).pathname === "/v1/organization") return orgResponse();
      capturedMethod = init.method ?? "";
      return new Response(JSON.stringify({ id: "sub-1", status: "active", cancel_at_end: true }));
    });

    const r = createClient();
    await r.cancelSubscription({ id: "sub-1" });
    expect(capturedMethod).toBe("DELETE");
  });
});

describe("usage", () => {
  test("listUsage returns paginated events", async () => {
    mockServer((url) => {
      if (new URL(url).pathname === "/v1/organization") return orgResponse();
      return new Response(JSON.stringify({ data: [{ id: "evt-1", feature: "api-calls", amount: 1 }], total: 1 }));
    });

    const r = createClient();
    const result = await r.listUsage();
    expect(result.data).toHaveLength(1);
  });
});

describe("analytics", () => {
  test("getAnalytics returns stats", async () => {
    mockServer((url) => {
      if (new URL(url).pathname === "/v1/organization") return orgResponse();
      return new Response(JSON.stringify({ mrr: "100.00", active_subs: 5 }));
    });

    const r = createClient();
    const stats = await r.getAnalytics();
    expect(stats.mrr).toBe("100.00");
  });
});

describe("invoices", () => {
  test("listInvoices returns paginated results", async () => {
    mockServer((url) => {
      if (new URL(url).pathname === "/v1/organization") return orgResponse();
      return new Response(JSON.stringify({ data: [{ id: "inv-1" }], total: 1 }));
    });

    const r = createClient();
    const result = await r.listInvoices();
    expect(result.data).toHaveLength(1);
  });
});

describe("organization", () => {
  test("getOrganization returns org", async () => {
    mockServer(() => new Response(JSON.stringify({ slug: "acme", id: "1", name: "Acme" })));
    const r = createClient();
    const org = await r.getOrganization();
    expect(org.slug).toBe("acme");
  });
});
