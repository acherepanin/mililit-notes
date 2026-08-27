import { defineConfig, devices } from "@playwright/test";

import { authStatePath } from "./e2e/global-setup";

const baseURL = process.env.WEB_BASE_URL ?? "http://localhost:3210";
const executablePath =
  process.env.PLAYWRIGHT_CHROME_PATH ??
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : undefined);

export default defineConfig({
  expect: { timeout: 8_000 },
  fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  outputDir: "../../test-results/playwright",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../../playwright-report" }],
  ],
  testDir: "./e2e",
  timeout: 60_000,
  // The viewport projects share one authenticated acceptance account.
  workers: 1,
  use: {
    baseURL,
    launchOptions: executablePath ? { executablePath } : undefined,
    screenshot: "only-on-failure",
    storageState: authStatePath,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter @notes/web dev --port 3210",
    reuseExistingServer: true,
    timeout: 120_000,
    url: baseURL,
  },
  projects: [
    {
      name: "desktop-1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { height: 900, width: 1440 },
      },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["Desktop Chrome"],
        hasTouch: true,
        viewport: { height: 844, width: 390 },
      },
    },
    {
      name: "mobile-320",
      use: {
        ...devices["Desktop Chrome"],
        hasTouch: true,
        viewport: { height: 720, width: 320 },
      },
    },
  ],
});
