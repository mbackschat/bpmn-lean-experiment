import { defineConfig } from "@playwright/test";

const baseURL = evaluationOrigin();
requireScreenshotRefreshOptIn();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  outputDir: "test-results",
  use: {
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    baseURL,
    browserName: "chromium",
    colorScheme: "light",
    locale: "en-US",
    screenshot: "off",
    timezoneId: "UTC",
    trace: "off",
    video: "off",
    viewport: { width: 1440, height: 900 },
  },
});

function evaluationOrigin(): string {
  const configured = process.env.BPMN_EVALUATION_ORIGIN;
  if (configured === undefined || configured.trim().length === 0) {
    throw new Error("Set BPMN_EVALUATION_ORIGIN to the already-running evaluation distribution.");
  }
  const origin = new URL(configured);
  if (
    (origin.protocol !== "http:" && origin.protocol !== "https:") ||
    origin.username.length > 0 ||
    origin.password.length > 0 ||
    origin.search.length > 0 ||
    origin.hash.length > 0 ||
    origin.pathname !== "/"
  ) {
    throw new Error("BPMN_EVALUATION_ORIGIN must be a credential-free HTTP(S) origin without a path, query, or fragment.");
  }
  return origin.origin;
}

function requireScreenshotRefreshOptIn(): void {
  if (process.env.BPMN_REFRESH_WALKTHROUGH_SCREENSHOTS !== "true") {
    throw new Error("Set BPMN_REFRESH_WALKTHROUGH_SCREENSHOTS=true to replace walkthrough screenshots.");
  }
}
