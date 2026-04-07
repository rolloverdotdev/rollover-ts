// Pricing Page
//
// Return your plans as JSON for a pricing page, with a single API call
// fetching each plan and its included features.
//
//   ROLLOVER_API_KEY=ro_live_... npx tsx examples/pricing-page/index.ts

import { Rollover } from "@rolloverdotdev/server";
import { createServer } from "node:http";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });

const org = await ro.getOrganization();

const server = createServer(async (_req, res) => {
  const plans = await ro.listPricing(org.slug);

  const out = plans.map((p) => ({
    name: p.name,
    slug: p.slug,
    price_usdc: p.price_usdc,
    billing_period: p.billing_period,
    trial_days: p.trial_days,
    features: p.features.map((f) => ({
      name: f.name,
      limit: f.limit_amount,
    })),
  }));

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(out));
});

server.listen(8080, () => console.log("Pricing server on :8080"));
