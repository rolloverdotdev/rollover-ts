# @rolloverdotdev/server

The official server-side TypeScript client for the [Rollover](https://rollover.dev) API, a subscription billing platform built on [x402](https://github.com/coinbase/x402) that settles in USDC on-chain.

## Install

```bash
npm install @rolloverdotdev/server
```

## Quick start

```ts
import { Rollover } from "@rolloverdotdev/server"

const ro = new Rollover({ apiKey: "ro_test_..." })

const { allowed, remaining } = await ro.check({ wallet: "0xabc...", feature: "api-calls" })
if (allowed) {
  await ro.track({ wallet: "0xabc...", feature: "api-calls", amount: 1 })
}
```

## Configuration

```ts
// Explicit API key
const ro = new Rollover({ apiKey: "ro_test_..." })

// Custom base URL (for local dev)
const ro = new Rollover({ apiKey: "ro_test_...", baseUrl: "http://localhost:9000" })
```

The mode (`test` or `live`) is parsed from the API key prefix (`ro_test_` or `ro_live_`).

## API

### Core

```ts
// Check if a wallet can use a feature.
const result = await ro.check({ wallet, feature: "api-calls" })
// result.allowed, result.used, result.remaining, result.limit,
// result.plan, result.creditBalance, result.creditCost

// Track usage.
const result = await ro.track({ wallet, feature: "api-calls", amount: 1 })
// result.allowed, result.used, result.remaining, result.creditBalance

// Track with idempotency key to prevent double-counting.
const result = await ro.track({ wallet, feature: "api-calls", amount: 1, idempotencyKey: "order-12345" })
```

### Credits

```ts
// Get credit balance.
const { balance } = await ro.getCredits({ wallet })

// Grant credits.
const { balance, granted } = await ro.grantCredits({ wallet, amount: 500, description: "Welcome bonus" })

// List credit transaction history.
const { data: txns } = await ro.listCreditTransactions({ wallet })
```

### Plans

```ts
// List plans.
const { data: plans } = await ro.listPlans({ limit: 10 })

// Get a plan.
const plan = await ro.getPlan({ slug: "starter" })

// Create a plan.
const plan = await ro.createPlan({ slug: "starter", name: "Starter", price_usdc: "9.99", billing_period: "monthly" })

// Update a plan.
const plan = await ro.updatePlan({ slug: "starter", name: "Starter Plus", price_usdc: "14.99" })

// Archive a plan.
await ro.archivePlan({ slug: "starter" })

// Add a feature to a plan.
const feature = await ro.createFeature({
  planSlug: "starter", feature_slug: "api-calls", name: "API Calls", limit_amount: 10000, reset_period: "monthly",
})

// Update a feature.
const feature = await ro.updateFeature({ planSlug: "starter", featureSlug: "api-calls", limit_amount: 20000 })

// Delete a feature.
await ro.deleteFeature({ planSlug: "starter", featureSlug: "api-calls" })

// List public pricing for a pricing page (no auth required).
const plans = await ro.listPricing("your-org-slug")
```

### Subscriptions

```ts
// List subscriptions.
const { data: subs } = await ro.listSubscriptions({ wallet: "0xabc...", status: "active" })

// Get a single subscription.
const sub = await ro.getSubscription({ id: subscriptionId })

// Create a subscription (admin).
const sub = await ro.createSubscription({ wallet: "0xabc...", planSlug: "starter" })

// Cancel a subscription.
const sub = await ro.cancelSubscription({ id: subscriptionId })
```

### Usage and Analytics

```ts
// List usage events.
const { data: events } = await ro.listUsage({ wallet: "0xabc...", feature: "api-calls", after: "2025-01-01T00:00:00Z" })

// Get analytics stats.
const stats = await ro.getAnalytics()
// stats.mrr, stats.active_subs, stats.total_revenue, stats.top_features

// List invoices.
const { data: invoices } = await ro.listInvoices({ wallet: "0xabc..." })

// Get organization info.
const org = await ro.getOrganization()
```

## Pagination

All list methods accept `limit` and `offset` options. The SDK provides two helpers that handle pagination automatically.

```ts
import { Rollover, paginate, collect } from "@rolloverdotdev/server"

const ro = new Rollover({ apiKey: "ro_test_..." })

// Collect loads all items into a single array.
const allPlans = await collect((opts) => ro.listPlans(opts))

// Paginate iterates one page at a time without loading everything into memory.
for await (const page of paginate((opts) => ro.listPlans(opts))) {
  for (const plan of page.data) {
    console.log(plan.name)
  }
}
```

## Error handling

Non-2xx responses throw a `RolloverError` with a status code, error code, and message.

```ts
import { RolloverError, AuthenticationError, RateLimitError, isErrorCode, ErrorCode } from "@rolloverdotdev/server"

try {
  await ro.check({ wallet, feature: "api-calls" })
} catch (err) {
  if (err instanceof RateLimitError) {
    console.log(`Retry in ${err.retryAfter}s`)
  } else if (err instanceof AuthenticationError) {
    console.log("Bad API key")
  } else if (err instanceof RolloverError) {
    if (err.temporary()) {
      console.log("Transient error, safe to retry")
    }
    if (isErrorCode(err, ErrorCode.NotFound)) {
      console.log("Not found")
    }
  }
}
```

## Examples

See the [examples](../../examples) directory:

- [check-and-track](../../examples/check-and-track) - Verify feature access before doing work, then record usage after the operation succeeds
- [middleware](../../examples/middleware) - An HTTP middleware that gates endpoints by verifying usage and recording consumption
- [credits](../../examples/credits) - Protect expensive operations by requiring an available credit balance
- [metered-api](../../examples/metered-api) - Track usage for multiple features across different routes
- [idempotency](../../examples/idempotency) - Avoid double-counting in distributed systems by using idempotency keys
- [provisioning](../../examples/provisioning) - A complete server-side onboarding flow that creates a plan, subscribes a wallet, and grants credits
- [pricing-page](../../examples/pricing-page) - Return plans as JSON for a pricing page, with a single API call fetching each plan and its included features
- [usage-dashboard](../../examples/usage-dashboard) - Pull analytics stats and paginated usage events to display in an admin dashboard
- [graceful-degradation](../../examples/graceful-degradation) - Return a helpful 429 response with usage details and an upgrade path when a wallet hits its limit
- [multi-feature-gate](../../examples/multi-feature-gate) - Check multiple features concurrently before starting an operation that requires all of them
- [credit-topup](../../examples/credit-topup) - Monitor a wallet's credit balance and automatically grant more credits when it drops below a threshold
- [subscriptions](../../examples/subscriptions) - Manage the full subscription lifecycle with listing, filtering, and inspection
- [batch-usage-report](../../examples/batch-usage-report) - Query usage events for a time range with pagination and aggregate totals by feature and wallet
- [error-handling](../../examples/error-handling) - Handle API errors by inspecting status codes, error codes, and retryability
- [admin-operations](../../examples/admin-operations) - Manage plans, features, subscriptions, invoices, and credit transactions using the admin API
- [webhooks](../../examples/webhooks) - Process real-time events from Rollover via webhook

## Docs

Visit [docs.rollover.dev](https://docs.rollover.dev) for guides and API reference.

## License

[MIT](LICENSE)
