import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    environment: "jsdom",

    include: [
      "tests/**/*.{test,spec}.{js,jsx}",
    ],

    exclude: [
      "tests/e2e/**",
      "node_modules/**",
      "dist/**",
    ],

    setupFiles: [
      "./tests/setup.js",
    ],

    restoreMocks: true,

    coverage: {
      provider: "v8",

      include: [
        "src/**/*.{js,jsx}",
        "api/**/*.js",
      ],

      exclude: [
        "src/main.jsx",
        "tests/**",
      ],

      reporter: [
        "text",
        "html",
        "json-summary",
      ],
    },
  },
});