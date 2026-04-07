// Usage Middleware
//
// An Express middleware that gates endpoints by verifying usage before
// handling the request and recording consumption after a successful response.
//
//   ROLLOVER_API_KEY=ro_test_... npx tsx examples/middleware/index.ts

import { Rollover } from "@rolloverdotdev/server";
import { createServer } from "node:http";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });

function usageGate(feature: string, handler: (req: any, res: any) => void) {
  return async (req: any, res: any) => {
    const wallet = req.headers["x-wallet"] as string;
    if (!wallet) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "missing X-Wallet header" }));
      return;
    }

    const result = await ro.check({ wallet, feature });
    if (!result.allowed) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "limit reached", used: result.used, limit: result.limit }));
      return;
    }

    handler(req, res);

    ro.track({ wallet, feature, amount: 1 });
  };
}

const server = createServer(usageGate("translations", (_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ result: "translated" }));
}));

server.listen(8080, () => console.log("Listening on :8080"));
