# @rolloverdotdev/browser

Browser SDK for [Rollover](https://rollover.dev) with wallet connection, DPoP-bound wallet sessions, and automatic x402 payments.

Requires an EIP-1193 compatible wallet (MetaMask, Coinbase Wallet, Rainbow, etc).

## Install

```bash
npm install @rolloverdotdev/browser @x402/core @x402/evm @x402/extensions @x402/fetch jose viem
```

## Setup

```ts
import { Rollover } from "@rolloverdotdev/browser"

const rollover = new Rollover({
  orgSlug: "my-team",
  mode: "live", // "test" for Base Sepolia, "live" for Base
})
```

`apiUrl` is optional and defaults to `https://api.rollover.dev`.

## Methods

### `connect()`

Connects the wallet, exchanges a SIWX signature for a DPoP-bound access token at `/v1/wallet/session`, and authenticates every subsequent request.

```ts
const walletAddress = await rollover.connect()
```

### `disconnect()`

Clears the session and the in-memory wallet reference.

```ts
rollover.disconnect()
```

### `listPlans()`

Fetches the public pricing for the org.

```ts
const plans = await rollover.listPlans()
```

### `subscribe(planSlug)`

Subscribes to a plan and handles the x402 payment in the wallet.

```ts
const subscription = await rollover.subscribe("pro")
```

### `getSubscription()`

Returns the current active subscription or null.

```ts
const subscription = await rollover.getSubscription()
```

### `switchPlan(planSlug)`

Switches the active subscription to a different plan.

```ts
const subscription = await rollover.switchPlan("enterprise")
```

### `cancel()`

Cancels the subscription at the end of the current billing period.

```ts
const subscription = await rollover.cancel()
```

### `resume()`

Resumes a cancelled subscription before the period ends.

```ts
const subscription = await rollover.resume()
```

## Properties

| Property | Type | Description |
|---|---|---|
| `wallet` | `string \| null` | Connected wallet address |
| `isConnected` | `boolean` | Whether a wallet is connected |
| `activity` | `RolloverEvent[]` | Log of all SDK events |

## Events

```ts
rollover.on("event", (e) => {
  console.log(e.level, e.type, e.detail)
})
```

Each event carries a `level` of `info`, `success`, `warning`, or `error`.

Event types: `wallet.connecting`, `wallet.connected`, `wallet.switching`, `wallet.adding`, `wallet.disconnected`, `auth.signing`, `plans.loaded`, `subscription.created`, `subscription.switched`, `subscription.loaded`, `subscription.none`, `subscription.cancelled`, `subscription.resumed`, `payment.required`, `payment.signed`, `payment.settlement`, `payment.failed`.
