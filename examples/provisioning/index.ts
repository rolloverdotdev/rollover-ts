// Provision a Customer
//
// A complete server-side onboarding flow that creates a plan with features,
// subscribes a wallet, and grants welcome credits for a new customer.
//
//   ROLLOVER_API_KEY=ro_test_... npx tsx examples/provisioning/index.ts

import { Rollover } from "@rolloverdotdev/server";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });
const slug = `starter-${Date.now() % 100000}`;

// 1. Create a plan.
const plan = await ro.createPlan({
  slug,
  name: "Starter",
  price_usdc: "9.99",
  billing_period: "monthly",
});
console.log(`Created plan: ${plan.name} (${plan.slug})`);

// 2. Add features.
const feature = await ro.createFeature({
  planSlug: slug,
  feature_slug: "api-calls",
  name: "API Calls",
  limit_amount: 10000,
  reset_period: "monthly",
});
console.log(`  Added feature: ${feature.feature_slug} (limit: ${feature.limit_amount})`);

// 3. Subscribe a wallet.
const wallet = `0x${Date.now().toString(16).padStart(40, "0")}`;
const sub = await ro.createSubscription({ wallet, planSlug: slug });
console.log(`Subscribed ${wallet.slice(0, 12)}... to ${sub.plan_name} (status: ${sub.status})`);

// 4. Grant welcome credits.
const grant = await ro.grantCredits({ wallet, amount: 500, description: "Welcome bonus" });
console.log(`Granted 500 credits (balance: ${grant.balance})`);

// Cleanup.
await ro.archivePlan({ slug });
