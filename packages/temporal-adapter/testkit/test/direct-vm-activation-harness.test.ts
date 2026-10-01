/**
 * Locks the direct-VM harness to the production Worker's VM lifecycle.
 *
 * Each case runs a hand-written bundle rather than the BPMN Workflow, so the VM call it observes is
 * the only work performed and its duration is set by the bundle, not by host speed.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { runDirectVmActivations } from "./direct-vm-activation-harness.ts";
import type { ParsedWorkflowCode } from "./direct-vm-activation-harness.ts";

test("direct-VM harness admits Workflow work that the production Worker's execution limit admits", async () => {
  // 1.5 s exceeds a one-second limit and stays inside the five-second default that
  // `@temporalio/worker` 1.21.0 compiles for `isolateExecutionTimeout` (TD-004).
  const bundle = probeBundle("slow-init", `
    globalThis.__TEMPORAL__ = { api: { initRuntime() {
      const end = Date.now() + 1500;
      while (Date.now() < end) {}
      throw new Error("initRuntime finished");
    } } };
  `);
  await assert.rejects(runDirectVmActivations(probeRun(bundle)), /initRuntime finished/);
});

function probeBundle(name: string, code: string): ParsedWorkflowCode {
  const filename = `/direct-vm-harness-probe/${name}.js`;
  return {
    code,
    filename,
    sourceMap: { version: 3, file: filename, sources: [], names: [], mappings: "" },
  };
}

function probeRun(bundle: ParsedWorkflowCode) {
  return {
    bundle,
    workflowType: "probe",
    replaying: false,
    taskQueue: "direct-vm-harness-probe",
    args: [],
    readyJobs: [],
    assertInitialization: () => assert.fail("probe bundles never initialize"),
  };
}
