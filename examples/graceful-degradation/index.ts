// Graceful Degradation
//
// Return a helpful 429 response with usage details and an upgrade path when
// a wallet hits its limit, rather than a generic rate limit error.
//
//   ROLLOVER_API_KEY=ro_live_... npx tsx examples/graceful-degradation/index.ts

import { Rollover, RolloverError } from "@rolloverdotdev/server";
import { createServer } from "node:http";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });

const server = createServer(async (req, res) => {
  const wallet = req.headers["x-wallet"] as string;
  if (!wallet) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "wallet required" }));
    return;
  }

  let result;
  try {
    result = await ro.check({ wallet, feature: "generations" });
  } catch (err) {
    console.log(`billing check failed: ${err} (failing open)`);
    doGenerate(res);
    return;
  }

  if (result.allowed) {
    doGenerate(res);
    ro.track({ wallet, feature: "generations", amount: 1 });
    return;
  }

  // Limit reached: return a helpful response with upgrade info.
  res.writeHead(429, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    error: "generation limit reached",
    used: result.used,
    limit: result.limit,
    plan: result.plan,
    upgrade: "https://app.example.com/billing/upgrade",
    message: "You've used all your generations for this period. Upgrade your plan for more.",
  }));
});

function doGenerate(res: any) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ result: "generated content here" }));
}

server.listen(8080, () => console.log("Listening on :8080"));
