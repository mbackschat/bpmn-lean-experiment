/**
 * Locks the process-local ownership contract for the ordinary BPMN Workflow bundle.
 *
 * Worker replacement and history replay must consume the same completed build rather than invoking the Temporal bundler again.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  createWorkflowBundleLoader,
} from "@bpmn-lean/temporal-adapter";

test("concurrent and later bundle requests share one build", async () => {
  let finishBuild: (() => void) | undefined;
  const buildMayFinish = new Promise<void>((resolve) => {
    finishBuild = resolve;
  });
  const expectedBundle = {
    code: "workflow bundle",
    sourceMap: "source map",
  };
  let builds = 0;
  const load = createWorkflowBundleLoader(async () => {
    builds += 1;
    await buildMayFinish;
    return expectedBundle;
  });

  const first = load();
  const concurrent = load();
  assert.strictEqual(concurrent, first);
  assert.equal(builds, 1);

  finishBuild?.();
  assert.strictEqual(await first, expectedBundle);
  assert.strictEqual(await load(), expectedBundle);
  assert.equal(builds, 1);
});

test("a failed build remains the owned result for the process", async () => {
  const expectedError = new Error("bundle compilation failed");
  let builds = 0;
  const load = createWorkflowBundleLoader(async () => {
    builds += 1;
    throw expectedError;
  });

  await assert.rejects(load(), expectedError);
  await assert.rejects(load(), expectedError);
  assert.equal(builds, 1);
});
