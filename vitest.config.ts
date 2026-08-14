import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "src/lib/**/*.ts",
        "src/hooks/**/*.ts",
        "src/components/**/*.tsx",
        "src/contexts/**/*.tsx",
        "src/pages/**/*.tsx",
      ],
      exclude: [
        "src/components/ui/**",
        "src/integrations/**",
        "src/**/*.d.ts",
        "src/test/**",
      ],
      // Ratchet, not vanity: thresholds sit just below today's numbers so a
      // regression fails CI while new coverage can only push them upward.
      // Scope now includes src/pages/**, so the global baseline is lower than
      // the pre-pages numbers while page-level tests are being added.
      // Current: statements 25.2 / branches 20.3 / functions 22.8 / lines 26.1
      thresholds: {
        lines: 25,
        functions: 21,
        statements: 24,
        branches: 19,
        // Permission logic is the security boundary — held to a higher bar.
        "src/lib/permissions.ts": {
          lines: 90,
          functions: 55,
          statements: 78,
          branches: 70,
        },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
