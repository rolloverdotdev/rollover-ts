// Metered API Server
//
// Track usage for multiple features across different routes, with each
// route mapped to a Rollover feature.
//
//   ROLLOVER_API_KEY=ro_test_... npx tsx examples/metered-api/index.ts

import { Rollover } from "@rolloverdotdev/server";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const ro = new Rollover({ apiKey: process.env.ROLLOVER_API_KEY! });

function metered(
  feature: string,
  handler: (req: IncomingMessage, res: ServerResponse) => void,
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const wallet = req.headers["x-wallet"] as string;

    const result = await ro.check({ wallet, feature });
    if (!result.allowed) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "rate limited" }));
      return;
    }

    handler(req, res);

    ro.track({ wallet, feature, amount: 1 });
  };
}

const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => void> = {
  "/v1/translate": metered("translations", (_req, res) => {
    res.end(JSON.stringify({ text: "translated" }));
  }),
  "/v1/summarize": metered("summaries", (_req, res) => {
    res.end(JSON.stringify({ text: "summarized" }));
  }),
  "/v1/embeddings": metered("embeddings", (_req, res) => {
    res.end(JSON.stringify({ embeddings: [0.1, 0.2] }));
  }),
};

const server = createServer((req, res) => {
  const handler = routes[req.url ?? ""];
  if (handler) {
    handler(req, res);
  } else {
    res.writeHead(404).end();
  }
});

server.listen(8080, () => console.log("Listening on :8080"));
