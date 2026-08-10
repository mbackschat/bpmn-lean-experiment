import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: process.env.CI === "true",
  retries: process.env.CI === "true" ? 1 : 0,
  workers: 1,
  timeout: 20_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "./scripts/pnpm.sh run showcase:m1:host",
      cwd: projectRoot,
      env: {
        PLATFORM_PARSER_DEADLINE_MS: "5000",
        PLATFORM_PORT: "3100",
        PLATFORM_TEMPORAL_TASK_QUEUE: "bpmn-m1-showcase",
      },
      reuseExistingServer: false,
      timeout: 60_000,
      url: "http://127.0.0.1:3100/api/v1/definitions",
    },
    {
      command: "./scripts/pnpm.sh --filter @bpmn-lean/platform-web exec vite --host 127.0.0.1 --port 4173 --strictPort",
      cwd: projectRoot,
      env: {
        PLATFORM_API_ORIGIN: "http://127.0.0.1:3100",
      },
      reuseExistingServer: false,
      timeout: 60_000,
      url: "http://127.0.0.1:4173",
    },
  ],
});
