// Webhook Receiver
//
// Process real-time events from Rollover by registering a webhook URL
// in the dashboard and handling events as they arrive.
//
//   npx tsx examples/webhooks/index.ts

import { createServer } from "node:http";

interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
}

interface SubscriptionData {
  wallet_address: string;
  plan_name: string;
  status: string;
}

const server = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/webhooks/rollover") {
    res.writeHead(404).end();
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString();

  let event: WebhookEvent;
  try {
    event = JSON.parse(body);
  } catch {
    res.writeHead(400).end("invalid json");
    return;
  }

  switch (event.type) {
    case "subscription.created": {
      const data = event.data as unknown as SubscriptionData;
      console.log(`New subscription: ${data.wallet_address} -> ${data.plan_name}`);
      break;
    }
    case "subscription.canceled": {
      const data = event.data as unknown as SubscriptionData;
      console.log(`Canceled: ${data.wallet_address} from ${data.plan_name}`);
      break;
    }
    default:
      console.log(`Received event: ${event.type}`);
  }

  res.writeHead(200).end();
});

server.listen(8080, () => console.log("Webhook receiver on :8080"));
