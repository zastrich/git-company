import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
    exclude: ["node_modules", ".next", "prisma"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/**/index.ts", "**/*.test.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
