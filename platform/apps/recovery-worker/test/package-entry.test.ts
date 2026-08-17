import assert from "node:assert/strict";
import test from "node:test";

import {
  createRecoveryWorker,
  readRecoveryWorkerConfig,
  RecoveryWorkerRuntime,
  recoveryWorkerFamilies,
} from "@bpmn-lean/platform-recovery-worker";

test("publishes only the composition-facing recovery-worker entry point", () => {
  assert.equal(typeof createRecoveryWorker, "function");
  assert.equal(typeof readRecoveryWorkerConfig, "function");
  assert.equal(typeof RecoveryWorkerRuntime, "function");
  assert.equal(recoveryWorkerFamilies.length, 11);
});
