// Idempotent Tracking
//
// Avoid double-counting in distributed systems by using idempotency keys,
// where the same key always produces the same result.
//
//   ROLLOVER_API_KEY=ro_test_... npx tsx examples/idempotency/index.ts

import { Rollover } from "@rolloverdotdev/server";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });
const wallet = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

// Use a deterministic key tied to the operation being tracked.
const key = "order-12345-image-gen";

// First call records the usage.
const r1 = await ro.track({ wallet, feature: "api-calls", amount: 1, idempotencyKey: key });
console.log(`First:  used=${r1.used} remaining=${r1.remaining}`);

// Second call with same key returns the cached result.
const r2 = await ro.track({ wallet, feature: "api-calls", amount: 1, idempotencyKey: key });
console.log(`Second: used=${r2.used} remaining=${r2.remaining} (same as first, not double-counted)`);
