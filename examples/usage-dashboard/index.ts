// Usage Dashboard
//
// Pull analytics stats and paginated usage events to display in an admin
// dashboard, combining MRR, active subscriptions, and event history.
//
//   ROLLOVER_API_KEY=ro_live_... npx tsx examples/usage-dashboard/index.ts

import { Rollover } from "@rolloverdotdev/server";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });

// 1. Fetch high-level analytics.
const stats = await ro.getAnalytics();

console.log("Dashboard");
console.log(`MRR:           $${stats.mrr}`);
console.log(`Active subs:   ${stats.active_subs}`);
console.log(`Total revenue: $${stats.total_revenue}`);

if (stats.top_features.length > 0) {
  console.log("\nTop features:");
  for (const f of stats.top_features) {
    console.log(`  ${f.feature_slug.padEnd(20)} ${f.total_used} events`);
  }
}

// 2. Fetch recent usage events.
const events = await ro.listUsage({ limit: 10 });

console.log(`\nRecent events (showing ${events.data.length} of ${events.total}):`);
for (const e of events.data) {
  const addr = e.wallet_address.length > 12
    ? e.wallet_address.slice(0, 10) + "..."
    : e.wallet_address;
  console.log(`  ${addr}  ${e.feature_slug.padEnd(15)}  ${e.amount} units  ${e.recorded_at}`);
}
