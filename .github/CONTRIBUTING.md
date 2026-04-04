# Contributing

## Development Setup

### Prerequisites

- Node.js 20+
- npm

### Getting Started

```bash
git clone https://github.com/rolloverdotdev/rollover-ts.git
cd rollover-ts
npm install
```

### Generating the Client

Generates the typed client from `openapi.json` using [Hey API](https://heyapi.dev) into `packages/client/src/`.

```bash
npm run generate
```

### Building

```bash
npm run build
```

## Project Structure

npm workspace with two packages.

```
packages/
  client/   @rolloverdotdev/client, generated typed SDK (do not edit manually)
  browser/  @rolloverdotdev/browser, wallet connection, SIWE auth, x402 payments
```

## Pull Requests

Keep changes focused and atomic, test locally before opening a PR.

### Commit Messages

Lowercase, start with a verb, single line.

```
add interceptor support for auth headers
fix type export for subscription response
update openapi spec and regenerate client
```

## License

By contributing, you agree your contributions will be licensed under the [MIT License](../LICENSE).
