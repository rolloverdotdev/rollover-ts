// Subscription Lifecycle
//
// Manage the full subscription lifecycle by listing active subscriptions,
// filtering by wallet, and inspecting subscription details.
//
//   ROLLOVER_API_KEY=ro_test_... npx tsx examples/subscriptions/index.ts

import { Rollover } from "@rolloverdotdev/server";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });

// List all active subscriptions.
const subs = await ro.listSubscriptions({ status: "active", limit: 5 });
console.log(`Active subscriptions: ${subs.total}`);

for (const s of subs.data) {
  console.log(`  ${s.wallet_address} -> ${s.plan_name} (status: ${s.status}, ends: ${s.period_end})`);
}

// Filter by wallet.
if (subs.data.length > 0) {
  const wallet = subs.data[0].wallet_address;
  const filtered = await ro.listSubscriptions({ wallet });
  console.log(`\nSubscriptions for ${wallet.slice(0, 12)}...: ${filtered.total}`);
}
