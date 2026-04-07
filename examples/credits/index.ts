// Credit-Gated Access
//
// Protect expensive operations by requiring an available credit balance,
// with credits automatically deducted according to the feature's credit_cost.
//
//   ROLLOVER_API_KEY=ro_test_... npx tsx examples/credits/index.ts

import { Rollover } from "@rolloverdotdev/server";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });
const wallet = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

// Check credit balance.
const balance = await ro.getCredits({ wallet });
console.log(`Credit balance: ${balance.balance}`);

// Grant credits.
const grant = await ro.grantCredits({
  wallet,
  amount: 500,
  description: "Welcome bonus",
});
console.log(`Granted ${grant.granted} credits. New balance: ${grant.balance}`);

// Check if the wallet can use a credit-gated feature.
const result = await ro.check({ wallet, feature: "image-gen" });

if (!result.allowed) {
  console.log(`Not enough credits. Balance: ${result.creditBalance}, cost: ${result.creditCost}`);
  process.exit(0);
}

// Do the expensive work, then track usage.
const track = await ro.track({ wallet, feature: "image-gen", amount: 1 });
console.log(`Tracked. Credits remaining: ${track.creditBalance}`);
