import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AlphaDemoLandmark,
  alphaDemoFallbackFrames,
  alphaDemoLandmarkLabel,
  readAlphaDemoCaptureEnabled,
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
  assert.equal(
    manifest.scripts?.["demo:mue-preview-alpha:capture"],
    "pnpm build:release-product2 && env MUE_ALPHA_DEMO_CAPTURE=true PLAYWRIGHT_PREBUILT_WEB=true pnpm --filter @bpmn-lean/showcase-mue-preview-alpha exec playwright test",
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

test("enables documentation capture only through the exact opt-in", () => {
  assert.equal(readAlphaDemoCaptureEnabled({}), false);
  assert.equal(readAlphaDemoCaptureEnabled({ MUE_ALPHA_DEMO_CAPTURE: "true" }), true);
  for (const value of ["false", "1", "TRUE"]) {
    assert.throws(
      () => readAlphaDemoCaptureEnabled({ MUE_ALPHA_DEMO_CAPTURE: value }),
      /MUE_ALPHA_DEMO_CAPTURE/u,
    );
  }
});

test("retains one 1600 by 900 fallback frame for every landmark", async () => {
  assert.deepEqual(
    alphaDemoFallbackFrames.map(({ landmark, filename }) => ({ landmark, filename })),
    [
      {
        landmark: AlphaDemoLandmark.NaturalCompleted,
        filename: "01-natural-completion.png",
      },
      {
        landmark: AlphaDemoLandmark.InterruptionReady,
        filename: "02-timer-interruption.png",
      },
      {
        landmark: AlphaDemoLandmark.InterruptedCompleted,
        filename: "03-interrupted-completion.png",
      },
    ],
  );
  for (const { filename, alt } of alphaDemoFallbackFrames) {
    assert.ok(alt.length > 0);
    const bytes = await readFile(new URL(
      `../../../docs/assets/mue-preview-alpha-demo/${filename}`,
      import.meta.url,
    ));
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16), 1_600);
    assert.equal(bytes.readUInt32BE(20), 900);
  }
});
