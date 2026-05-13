// Multi-Feature Gate
//
// Check multiple features in one call before starting an operation that
// requires all of them, such as an AI pipeline consuming both API calls
// and image generation credits.
//
//   ROLLOVER_API_KEY=ro_live_... npx tsx examples/multi-feature-gate/index.ts

import { Rollover } from "@rolloverdotdev/server";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });
const wallet = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

// This operation requires both api-calls and image-gen. checkBatch resolves
// the subscription once and answers for every feature in a single request.
// Supplying amount per feature makes allowed reflect whether N units would
// succeed, not just whether any quota remains.
const gate = await ro.checkBatch({
  wallet,
  features: [
    { feature: "api-calls", amount: 1 },
    { feature: "image-gen", amount: 1 },
  ],
});

const blocked = gate.results.filter((r) => !r.allowed).map((r) => r.feature);
if (blocked.length > 0) {
  console.log(`Blocked on: ${blocked.join(", ")}`);
  console.log("Please upgrade your plan to continue.");
  process.exit(0);
}

console.log("All features available. Running pipeline...");
console.log("Pipeline completed.");

// trackBatch records every event in one call and groups the resulting
// usage_events rows under a shared batch_id. atomicity: "all_or_nothing"
// rolls the whole batch back if any event would block, which keeps the
// customer from being half-charged on a partial result.
const result = await ro.trackBatch({
  wallet,
  events: [
    { feature: "api-calls", amount: 1 },
    { feature: "image-gen", amount: 1 },
  ],
  atomicity: "all_or_nothing",
});
console.log(`Usage tracked (batch ${result.batchId}).`);
