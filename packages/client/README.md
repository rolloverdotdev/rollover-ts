# @rolloverdotdev/client

Type-safe TypeScript SDK for the [Rollover](https://rollover.dev) subscription billing API.

## Install

```bash
npm install @rolloverdotdev/client
```

## Setup

```ts
import { client } from "@rolloverdotdev/client"

client.setConfig({
  baseUrl: "https://api.rollover.dev",
  auth: "ro_live_...",
})
```

## Usage

```ts
import { checkUsage, trackUsage } from "@rolloverdotdev/client"

const { data } = await checkUsage({
  query: { wallet: "0xABC...", feature: "api_calls" },
})

if (data.allowed) {
  await trackUsage({
    body: { wallet: "0xABC...", feature: "api_calls", amount: 1 },
  })
}
```

## Docs

Visit [docs.rollover.dev](https://docs.rollover.dev) for guides and API reference.
