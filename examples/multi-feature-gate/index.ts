// Multi-Feature Gate
//
// Check multiple features concurrently before starting an operation that
// requires all of them, such as an AI pipeline consuming both API calls
// and image generation credits.
//
//   ROLLOVER_API_KEY=ro_live_... npx tsx examples/multi-feature-gate/index.ts

import { Rollover } from "@rolloverdotdev/server";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });
const wallet = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

async function checkAll(wallet: string, features: string[]): Promise<string[]> {
  const results = await Promise.all(
    features.map(async (feature) => {
      try {
        const result = await ro.check({ wallet, feature });
        return result.allowed ? null : feature;
      } catch {
        return feature;
      }
    }),
  );
  return results.filter((f): f is string => f !== null);
}

async function trackAll(wallet: string, features: Record<string, number>) {
  await Promise.all(
    Object.entries(features).map(([feature, amount]) =>
      ro.track({ wallet, feature, amount }).catch((err) =>
        console.log(`rollover: track ${feature} failed: ${err}`),
      ),
    ),
  );
}

// This operation requires both api-calls and image-gen.
const required = ["api-calls", "image-gen"];

const blocked = await checkAll(wallet, required);
if (blocked.length > 0) {
  console.log(`Blocked on: ${blocked.join(", ")}`);
  console.log("Please upgrade your plan to continue.");
  process.exit(0);
}

console.log("All features available. Running pipeline...");
console.log("Pipeline completed.");

await trackAll(wallet, { "api-calls": 1, "image-gen": 1 });
console.log("Usage tracked for all features.");
