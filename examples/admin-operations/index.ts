// Admin Operations
//
// Manage plans, features, subscriptions, invoices, and credit transactions
// using the admin API, covering the full set of operations available to
// API key holders beyond the core check and track workflow.
//
//   ROLLOVER_API_KEY=ro_test_... npx tsx examples/admin-operations/index.ts

import { Rollover } from "@rolloverdotdev/server";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });
const slug = `admin-demo-${Date.now() % 100000}`;

// Create a plan.
const plan = await ro.createPlan({
  slug,
  name: "Admin Demo",
  price_usdc: "19.99",
  billing_period: "monthly",
});
console.log(`Created plan: ${plan.name}`);

// Update the plan.
const updated = await ro.updatePlan({
  slug,
  name: "Admin Demo (Updated)",
  description: "Updated via SDK",
});
console.log(`Updated plan: ${updated.name}`);

// Link a catalog feature to the plan. Unknown feature slugs auto-create a metered
// catalog feature on the server.
const link = await ro.linkFeature({
  planSlug: slug,
  feature_slug: "requests",
  limit_amount: 5000,
  reset_period: "monthly",
});
console.log(`Linked feature: ${link.feature?.slug} (limit: ${link.limit_amount}, policy: ${link.policy})`);

// Update the plan-feature link.
const updatedLink = await ro.updatePlanFeature({
  planSlug: slug,
  featureSlug: "requests",
  limit_amount: 10000,
});
console.log(`Updated link limit: ${updatedLink.limit_amount}`);

// Subscribe a wallet and inspect the subscription.
const wallet = `0x${Date.now().toString(16).padStart(40, "0")}`;
const sub = await ro.createSubscription({ wallet, planSlug: slug });
console.log(`Subscribed: ${wallet.slice(0, 12)}... (status: ${sub.status})`);

const fetched = await ro.getSubscription({ id: sub.id });
console.log(`Fetched subscription: plan=${fetched.plan_name}, period ends ${fetched.period_end}`);

// Grant credits and list transactions.
await ro.grantCredits({ wallet, amount: 100, description: "Demo grant" });
const txns = await ro.listCreditTransactions({ wallet });
console.log(`Credit transactions: ${txns.total}`);
for (const tx of txns.data) {
  console.log(`  ${tx.type}: ${tx.amount} credits (${tx.description})`);
}

// List invoices.
const invoices = await ro.listInvoices({ wallet });
console.log(`Invoices: ${invoices.total}`);

// Cleanup.
await ro.unlinkFeature({ planSlug: slug, featureSlug: "requests" });
await ro.archivePlan({ slug });
console.log("Cleaned up.");
