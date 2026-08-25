import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  HeadlineDemoLandmark,
  headlineDemoLandmarkLabel,
  headlineDemoTimeoutMs,
  readHeadlineDemoConfig,
} from "../src/headline-demo.ts";

test("publishes one headed real-world structured Human Work command", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as Readonly<{ scripts?: Readonly<Record<string, string>> }>;

  assert.equal(
    manifest.scripts?.["demo:mue-headline"],
    "pnpm build:release-product2 && env MUE_HEADLINE_DEMO=true MUE_HEADLINE_DEMO_PAUSE_MS=3500 PLAYWRIGHT_PREBUILT_WEB=true pnpm --filter @bpmn-lean/showcase-m3-human-work exec playwright test --headed --grep=1600px",
  );
});

test("keeps ordinary evidence unpaced and requires a bounded exact opt-in", () => {
  assert.deepEqual(readHeadlineDemoConfig({}), { enabled: false, pauseMs: 0 });
  assert.deepEqual(readHeadlineDemoConfig({
    MUE_HEADLINE_DEMO: "true",
    MUE_HEADLINE_DEMO_PAUSE_MS: "3500",
  }), { enabled: true, pauseMs: 3_500 });

  for (const environment of [
    { MUE_HEADLINE_DEMO: "false" },
    { MUE_HEADLINE_DEMO_PAUSE_MS: "100" },
    { MUE_HEADLINE_DEMO: "true", MUE_HEADLINE_DEMO_PAUSE_MS: "10001" },
  ]) {
    assert.throws(() => readHeadlineDemoConfig(environment), /MUE_HEADLINE_DEMO/u);
  }
});

test("names every presenter-visible real-world landmark", () => {
  assert.deepEqual(
    Object.values(HeadlineDemoLandmark).map(headlineDemoLandmarkLabel),
    [
      "Exact engine breadth and non-conformance boundary",
      "Expense exception BPMN process",
      "Approve form with six real field kinds",
      "Request changes with conditional rationale",
      "Abort with destructive intent and required rationale",
      "Committed semantic History and Work audit",
    ],
  );
});

test("adds every presenter pause to the ordinary journey deadline", () => {
  assert.equal(headlineDemoTimeoutMs({ enabled: false, pauseMs: 0 }), 30_000);
  assert.equal(headlineDemoTimeoutMs({ enabled: true, pauseMs: 3_500 }), 51_000);
});
