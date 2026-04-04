import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "./openapi.json",
  output: {
    path: "packages/client/src",
    entryFile: true,
  },
  plugins: [
    {
      name: "@hey-api/typescript",
      comments: true,
    },
    {
      name: "@hey-api/sdk",
    },
    "@hey-api/client-fetch",
  ],
});
