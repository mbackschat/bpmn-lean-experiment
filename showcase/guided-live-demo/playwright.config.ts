import { readFile } from "node:fs/promises";

import { defineConfig, devices } from "@playwright/test";

const baseURL = decodeOrigin(
  process.env.BPMN_EVALUATION_ORIGIN ?? await readRecordedOrigin(),
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: process.env.CI === "true",
  retries: 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    actionTimeout: 10_000,
    baseURL,
    navigationTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  }],
});

function decodeSession(value: unknown): Readonly<{ origin: string }> {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("Live-demo session must be an object");
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.kind !== "bpmnLeanLiveDemoSession" ||
    typeof candidate.origin !== "string"
  ) {
    throw new TypeError("Live-demo session has an invalid closed shape");
  }
  return Object.freeze({ origin: decodeOrigin(candidate.origin) });
}

async function readRecordedOrigin(): Promise<string> {
  const session = decodeSession(JSON.parse(await readFile(
    new URL("../../.cache/live-demo/session.json", import.meta.url),
    "utf8",
  )) as unknown);
  return session.origin;
}

function decodeOrigin(value: string): string {
  const origin = new URL(value);
  if (
    origin.protocol !== "http:" ||
    origin.hostname !== "127.0.0.1" ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== ""
  ) {
    throw new TypeError("The guided demo must name one exact HTTP loopback origin");
  }
  return origin.origin;
}
