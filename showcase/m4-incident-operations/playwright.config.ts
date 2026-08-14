import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

import { allocatePlaywrightLoopbackPorts } from "../../scripts/playwright-loopback-ports.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const { apiOrigin, apiPort, webOrigin, webPort } = await allocatePlaywrightLoopbackPorts();
process.env.PLATFORM_API_ORIGIN = apiOrigin;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: process.env.CI === "true",
  retries: process.env.CI === "true" ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  use: {
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    baseURL: webOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  }],
  webServer: [
    {
      command: "./scripts/pnpm.sh --filter @bpmn-lean/showcase-m4-incident-operations exec node src/host.ts",
      cwd: projectRoot,
      env: {
        PLATFORM_PARSER_DEADLINE_MS: "5000",
        PLATFORM_PORT: String(apiPort),
        PLATFORM_TEMPORAL_TASK_QUEUE: "bpmn-m4-incident-operations",
      },
      reuseExistingServer: false,
      timeout: 60_000,
      url: `${apiOrigin}/api/v1/incidents`,
    },
    {
      command: `./scripts/pnpm.sh --filter @bpmn-lean/platform-web exec vite --host 127.0.0.1 --port ${webPort} --strictPort`,
      cwd: projectRoot,
      env: { PLATFORM_API_ORIGIN: apiOrigin },
      reuseExistingServer: false,
      timeout: 60_000,
      url: webOrigin,
    },
  ],
});
