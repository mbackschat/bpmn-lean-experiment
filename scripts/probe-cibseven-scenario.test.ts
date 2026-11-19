import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { cibBridgeInvocation, cibBridgeDeadlineMs } from "./replace-cibseven-evidence.ts";
import {
  parseProbeArguments,
  probeExitCode,
  ProbeUsageError,
  requireOutputOutsideRepository,
} from "./probe-cibseven-scenario.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("refuses a call without exactly one scenario and an output directory", () => {
  assert.throws(() => parseProbeArguments(["--out", "/x/out"]), ProbeUsageError);
  assert.throws(() => parseProbeArguments(["--out", "/x/out", "a.scenario.json", "b.scenario.json"]), /exactly one scenario/u);
  assert.throws(() => parseProbeArguments(["a.scenario.json"]), /--out/u);
  assert.throws(() => parseProbeArguments(["--out", "/x/out", "--effect-schedule", "bogus", "a.scenario.json"]), /effect schedule/u);
  assert.deepEqual(parseProbeArguments(["--out", "/x/out", "a.scenario.json"]), {
    scenarioPath: "a.scenario.json", outputDirectory: "/x/out", effectSchedule: undefined,
  });
  assert.equal(
    parseProbeArguments(["a.scenario.json", "--out", "/x/out", "--effect-schedule", "incidentReportCancel"]).effectSchedule,
    "incidentReportCancel",
  );
});

test("refuses an output directory inside the retained evidence or the scenarios", () => {
  for (const inside of ["scenarios", "scenarios/open-rows/x", "adoption/a12/current", "packages/differential/out", "."]) {
    assert.throws(() => requireOutputOutsideRepository(path.join(projectRoot, inside)), ProbeUsageError, inside);
  }
  assert.doesNotThrow(() => requireOutputOutsideRepository("/private/tmp/probe-out"));
});

test("builds the replacement's Maven invocation, with one scenario's deadline", () => {
  const environment = { PATH: "/bin", BPMN_CIB_MAVEN_TIMEOUT_MS: "999000" };
  const one = cibBridgeInvocation("2.2.0", "/o/in.jsonl", "/o/out.jsonl", "plainSuccess", 1, environment);
  assert.equal(one.options.timeoutMs, cibBridgeDeadlineMs(1, environment));
  assert.equal(one.options.timeoutMs, 30_000);
  assert.ok(one.args.includes("-Dbpmn.pipeline.input=/o/in.jsonl"));
  assert.ok(one.args.includes("-Dbpmn.pipeline.effectSchedule=plainSuccess"));
  assert.equal(cibBridgeInvocation("2.2.0", "/o/in", "/o/out", "plainSuccess", 0, environment).options.timeoutMs, 999_000);
});

test("separates a semantic answer, a harness failure and a usage refusal by exit status", () => {
  assert.equal(probeExitCode({ kind: "result", result: {} as never }), 0);
  assert.equal(probeExitCode({ kind: "population", result: {} as never }), 0);
  assert.equal(probeExitCode({ kind: "failure", failure: "CIB_SCENARIO_HEAP_EXHAUSTED" }), 3);
  assert.equal(probeExitCode(new ProbeUsageError("x")), 2);
});
