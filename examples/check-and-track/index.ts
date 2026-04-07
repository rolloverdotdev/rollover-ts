// Check and Track
//
// The core Rollover pattern is to verify a wallet has feature access before
// doing any work, then record usage after the operation succeeds.
//
//   ROLLOVER_API_KEY=ro_test_... npx tsx examples/check-and-track/index.ts

import { Rollover } from "@rolloverdotdev/server";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });
const wallet = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const result = await ro.check({ wallet, feature: "api-calls" });

if (!result.allowed) {
  console.log(`Limit reached. ${result.used}/${result.limit} used.`);
  process.exit(0);
}

console.log(`Access granted. ${result.remaining}/${result.limit} remaining.`);

// Do your work here...

const track = await ro.track({ wallet, feature: "api-calls", amount: 1 });
console.log(`Tracked. ${track.used} used, ${track.remaining} remaining.`);
