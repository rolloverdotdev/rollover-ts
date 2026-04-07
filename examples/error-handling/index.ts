// Error Handling
//
// Handle Rollover API errors by inspecting the status code and error code,
// allowing your application to respond differently to authentication failures,
// rate limits, and other error conditions.
//
//   ROLLOVER_API_KEY=ro_test_... npx tsx examples/error-handling/index.ts

import { Rollover, RolloverError, ErrorCode, isErrorCode } from "@rolloverdotdev/server";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });

try {
  await ro.check({ wallet: "0xinvalid", feature: "api-calls" });
} catch (err) {
  if (err instanceof RolloverError) {
    console.log(`API error: ${err.message} (status ${err.statusCode})`);

    if (err.temporary()) {
      console.log("This is a transient error, safe to retry.");
    }
  } else {
    console.log(`Network or other error: ${err}`);
  }
}

// Use isErrorCode for clean checks without instanceof assertions.
try {
  await ro.getPlan({ slug: "nonexistent-plan" });
} catch (err) {
  if (isErrorCode(err, ErrorCode.NotFound)) {
    console.log("\nPlan not found (checked via isErrorCode).");
  }
}

// Error code constants work in switch statements too.
try {
  await ro.grantCredits({ wallet: "0xabc", amount: -1 });
} catch (err) {
  if (err instanceof RolloverError) {
    switch (err.code) {
      case ErrorCode.Validation:
        console.log(`\nValidation error: ${err.message}`);
        break;
      case ErrorCode.Unauthorized:
        console.log("\nCheck your API key.");
        break;
      default:
        console.log(`\nUnexpected: ${err.message}`);
    }
  }
}
