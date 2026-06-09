import { defineConfig } from "vitest/config";

export default defineConfig({
  // JSX automatique pour les tests du widget (composants React .tsx).
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}", "packages/*/src/**/*.test.{ts,tsx}"],
    testTimeout: 15000,
  },
});
