import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

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
    baseURL: "http://127.0.0.1:4278",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    chromiumProject("chromium-1600", 1600),
    chromiumProject("chromium-1280", 1280),
  ],
  webServer: {
    command: "./scripts/pnpm.sh --filter @bpmn-lean/platform-web run build && ./scripts/pnpm.sh --filter @bpmn-lean/platform-web exec vite preview --host 127.0.0.1 --port 4278 --strictPort",
    cwd: projectRoot,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "true",
    timeout: 120_000,
    url: "http://127.0.0.1:4278",
  },
});

function chromiumProject(name: string, width: number) {
  return {
    name,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width, height: 900 },
    },
  };
}
