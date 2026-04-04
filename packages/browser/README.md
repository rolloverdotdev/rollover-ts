# @rolloverdotdev/browser

Browser SDK for [Rollover](https://rollover.dev) with wallet connection, SIWE authentication, and automatic x402 payments.

Requires an EIP-1193 compatible wallet (MetaMask, Coinbase Wallet, Rainbow, etc).

## Install

```bash
npm install @rolloverdotdev/browser @x402/fetch @x402/evm viem
```

## Setup

```ts
import { Rollover } from "@rolloverdotdev/browser"

const rollover = new Rollover({
  apiUrl: "https://api.rollover.dev",
  orgSlug: "my-team",
  mode: "live", // "test" for Base Sepolia, "live" for Base
})
```

## Methods

### `connect()`

Prompts the wallet popup and switches to the correct chain (Base or Base Sepolia).

```ts
const walletAddress = await rollover.connect()
```

### `authenticate()`

Signs a SIWE message and returns a session JWT. Requires `connect()` first.

```ts
const token = await rollover.authenticate()
```

### `listPlans()`

Fetches available plans for the organization. No wallet connection required.

```ts
const plans = await rollover.listPlans()
```

### `subscribe(planSlug)`

Subscribes to a plan. If the plan has a price, the x402 payment popup is handled automatically.

```ts
const subscription = await rollover.subscribe("pro")
```

### `getSubscription()`

Returns the current active subscription, or `null` if none.

```ts
const subscription = await rollover.getSubscription()
```

### `switchPlan(planSlug)`

Switches to a different plan. Handles proration and payment automatically.

```ts
const subscription = await rollover.switchPlan("enterprise")
```

### `cancel()`

Cancels the subscription at the end of the current billing period.

```ts
const subscription = await rollover.cancel()
// subscription.cancel_at_end === true
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
| `isAuthenticated` | `boolean` | Whether a session JWT exists |
| `activity` | `RolloverEvent[]` | Log of all SDK events |

## Events

```ts
rollover.on("event", (e) => {
  console.log(e.type, e.detail)
})
```

Event types: `wallet.connecting`, `wallet.connected`, `auth.signing`, `auth.authenticated`, `subscription.subscribing`, `subscription.created`, `subscription.switching`, `subscription.switched`, `subscription.cancelling`, `subscription.cancelled`, `subscription.resuming`, `subscription.resumed`
