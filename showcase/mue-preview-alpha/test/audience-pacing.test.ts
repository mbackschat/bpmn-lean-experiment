import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AlphaDemoLandmark,
  alphaDemoLandmarkLabel,
  readAlphaDemoPauseMs,
} from "../src/audience-pacing.ts";

test("publishes one headed audience-paced Alpha command", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as Readonly<{ scripts?: Readonly<Record<string, string>> }>;

  assert.equal(
    manifest.scripts?.["demo:mue-preview-alpha"],
    "pnpm build:release-product2 && env MUE_ALPHA_DEMO_PAUSE_MS=3500 PLAYWRIGHT_PREBUILT_WEB=true pnpm --filter @bpmn-lean/showcase-mue-preview-alpha exec playwright test --headed",
  );
});

test("defaults evidence runs to no presentation delay", () => {
  assert.equal(readAlphaDemoPauseMs({}), 0);
});

test("admits only a bounded canonical presentation delay", () => {
  assert.equal(readAlphaDemoPauseMs({ MUE_ALPHA_DEMO_PAUSE_MS: "3500" }), 3_500);
  for (const value of ["-1", "01", "1.5", "10001", "demo"]) {
    assert.throws(
      () => readAlphaDemoPauseMs({ MUE_ALPHA_DEMO_PAUSE_MS: value }),
      /MUE_ALPHA_DEMO_PAUSE_MS/u,
    );
  }
});

test("names every safe audience landmark", () => {
  assert.deepEqual(
    Object.values(AlphaDemoLandmark).map(alphaDemoLandmarkLabel),
    [
      "Natural completion and ordered aggregate",
      "Timer interruption and escalation task",
      "Interrupted completion without partial output",
    ],
  );
});
