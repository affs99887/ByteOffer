// vitest.config.ts
// Minimal test-runner config layered ON TOP of the existing runnable self-check scripts (which CI
// still runs directly via `npx tsx`). Node environment (all tested logic is pure — no DOM, no DB).
// The `@/*` path alias mirrors tsconfig so tests can import server/client modules the same way the
// app does. `npm test` (already wired to `vitest run`) executes every `*.test.ts`.

import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // node_modules excluded by default; keep the Next build output out too.
    exclude: ["node_modules/**", ".next/**"],
  },
});
