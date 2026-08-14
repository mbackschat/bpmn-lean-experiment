import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

import { allocatePlaywrightLoopbackPorts } from "../../scripts/playwright-loopback-ports.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const { webOrigin, webPort } = await allocatePlaywrightLoopbackPorts();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: process.env.CI === "true",
  retries: process.env.CI === "true" ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI === "true"
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : "list",
  outputDir: "test-results",
  snapshotPathTemplate: "{testDir}/snapshots/{testFilePath}/{projectName}/{arg}{ext}",
  use: {
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    baseURL: webOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    chromiumProject("chromium-1600", 1600),
    chromiumProject("chromium-1280", 1280, /@responsive/u),
  ],
  webServer: {
    command: `./scripts/pnpm.sh --filter @bpmn-lean/platform-web run build && ./scripts/pnpm.sh --filter @bpmn-lean/platform-web exec vite preview --host 127.0.0.1 --port ${webPort} --strictPort`,
    cwd: projectRoot,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "true",
    timeout: 120_000,
    url: webOrigin,
  },
});

function chromiumProject(name: string, width: number, grep?: RegExp) {
  return {
    name,
    ...(grep === undefined ? {} : { grep }),
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width, height: 900 },
    },
  };
}
