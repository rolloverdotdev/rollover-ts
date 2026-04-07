// Batch Usage Report
//
// Query usage events for a time range with pagination and aggregate totals
// by feature and wallet, useful for generating daily or weekly usage digests.
//
//   ROLLOVER_API_KEY=ro_live_... npx tsx examples/batch-usage-report/index.ts

import { Rollover, collect, paginate } from "@rolloverdotdev/server";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });

const now = new Date();
const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
const to = now.toISOString();

console.log(`Usage report: ${from.slice(0, 10)} to ${to.slice(0, 10)}\n`);

// Collect loads all events into memory at once, handling pagination
// automatically behind the scenes.
const all = await collect((opts) => ro.listUsage({ ...opts, after: from, before: to }));

const byFeature = new Map<string, number>();
const byWallet = new Map<string, number>();
for (const e of all) {
  const amt = parseFloat(e.amount);
  byFeature.set(e.feature_slug, (byFeature.get(e.feature_slug) ?? 0) + amt);
  byWallet.set(e.wallet_address, (byWallet.get(e.wallet_address) ?? 0) + amt);
}

console.log(`Total events: ${all.length}\n`);

console.log("By feature:");
for (const [f, total] of byFeature) {
  console.log(`  ${f.padEnd(25)} ${total} units`);
}

console.log("\nBy wallet:");
for (const [w, total] of byWallet) {
  const addr = w.length > 12 ? w.slice(0, 10) + "..." : w;
  console.log(`  ${addr.padEnd(15)} ${total} units`);
}

// Paginate fetches one page at a time, letting you process events as they
// arrive without holding the full dataset in memory.
console.log("\nPage by page:");
let pageNum = 0;
for await (const page of paginate((opts) => ro.listUsage({ ...opts, after: from, before: to }))) {
  pageNum++;
  console.log(`Page ${pageNum}: ${page.data.length} events`);
}
