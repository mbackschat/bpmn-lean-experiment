import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

import { allocatePlaywrightLoopbackPorts } from "../../scripts/playwright-loopback-ports.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const { apiOrigin, apiPort, webOrigin, webPort } = await allocatePlaywrightLoopbackPorts();
process.env.PLATFORM_API_ORIGIN = apiOrigin;
process.env.PLATFORM_PORT = String(apiPort);
const webBuild = process.env.PLAYWRIGHT_PREBUILT_WEB === "true"
  ? ""
  : "./scripts/pnpm.sh run build:platform-web && ";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: process.env.CI === "true",
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    baseURL: webOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  }],
  webServer: [{
    command: `${webBuild}./scripts/pnpm.sh --filter @bpmn-lean/platform-web exec vite preview --host 127.0.0.1 --port ${webPort} --strictPort`,
    cwd: projectRoot,
    env: { PLATFORM_API_ORIGIN: apiOrigin },
    reuseExistingServer: false,
    timeout: 60_000,
    url: webOrigin,
  }],
});
