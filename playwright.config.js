import {
  defineConfig,
  devices,
} from "@playwright/test";

const localBaseUrl =
  "http://127.0.0.1:4173";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  localBaseUrl;

const useExternalServer =
  Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",

  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ["line"],
    [
      "html",
      {
        open: "never",
        outputFolder: "playwright-report",
      },
    ],
  ],

  expect: {
    timeout: 5_000,
  },

  timeout: 30_000,

  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "desktop-chromium",

      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "compact-mobile-chromium",

      use: {
        browserName: "chromium",
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true,

        viewport: {
          width: 390,
          height: 844,
        },
      },
    },
    {
      name: "large-mobile-chromium",

      use: {
        browserName: "chromium",
        deviceScaleFactor: 2.625,
        hasTouch: true,
        isMobile: true,

        viewport: {
          width: 412,
          height: 915,
        },
      },
    },
  ],

  webServer: useExternalServer
    ? undefined
    : {
        command:
          "npm run preview -- --host 127.0.0.1 --port 4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        url: `${localBaseUrl}/visit`,
      },
});