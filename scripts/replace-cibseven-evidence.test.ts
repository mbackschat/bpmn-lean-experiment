import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cibEvidenceEffectSchedule,
  requireReplacementAuthorization,
  runIsolatedBatches,
  scenarioFailureOf,
} from "./replace-cibseven-evidence.ts";
import { CommandTimeoutError } from "./run-command.ts";

test("routes a scenario to its CIB schedule by its incident options and its cancel command", () => {
  const retry = { kind: "command", commandId: "retry", action: { kind: "retryIncident", generation: 1 } };
  const cancel = { kind: "command", commandId: "cancel", action: { kind: "cancelIncidentProcess", generation: 1 } };
  const incidents = { incidents: { cancellable: true } };
  assert.equal(cibEvidenceEffectSchedule({ options: incidents, stimuli: [retry] }), "incidentReportRetrySuccess");
  assert.equal(cibEvidenceEffectSchedule({ options: incidents, stimuli: [retry, cancel] }), "incidentReportCancel");
  assert.equal(cibEvidenceEffectSchedule({ stimuli: [retry, cancel] }), "plainSuccess");
});

test("requires explicit authorization before replacing CIB evidence", () => {
  assert.throws(
    () => requireReplacementAuthorization([]),
    /exact --replace flag/,
  );
  assert.throws(
    () => requireReplacementAuthorization(["--replace", "--extra"]),
    /exact --replace flag/,
  );
  assert.doesNotThrow(
    () => requireReplacementAuthorization(["--replace"]),
  );
});

test("isolates each scenario a CIB batch cannot run and runs the rest of its chunk", async () => {
  const calls: Array<ReadonlyArray<number>> = [];
  const outcome = await runIsolatedBatches([1, 2, 3, 4, 5], 3, async (items) => {
    calls.push(items);
    const failing = items.indexOf(2);
    return failing === -1
      ? { results: items.map((item) => item * 10), failure: null }
      : { results: items.slice(0, failing).map((item) => item * 10), failure: "unsupported" };
  });
  assert.deepEqual(outcome, { results: [10, 30, 40, 50], failures: [{ item: 2, failure: "unsupported" }] });
  assert.deepEqual(calls, [[1, 2, 3], [3], [4, 5]]);
});

test("refuses a CIB batch that returns fewer results without naming a failure", async () => {
  await assert.rejects(
    runIsolatedBatches([1, 2], 2, async () => ({ results: [1], failure: null })),
    /returned 1 results for 2 scenarios/,
  );
});

test("attributes only a scenario error of the export bridge to a scenario, never a build or environment failure", () => {
  const scenarioError =
    "mvnw exited with 1\n[ERROR] Tests run: 1, Failures: 0, Errors: 1, Skipped: 0\n" +
    "[ERROR] exportsCanonicalScenarioBatch  Time elapsed: 2 s  <<< ERROR!\njava.lang.IllegalArgumentException: no boundary\n";
  assert.equal(scenarioFailureOf(new Error(scenarioError)), "java.lang.IllegalArgumentException: no boundary");
  assert.equal(scenarioFailureOf(new Error("mvnw exited with 1\n[ERROR] COMPILATION ERROR\n")), null);
  assert.equal(scenarioFailureOf(new CommandTimeoutError("mvnw", 30_000, "", "")), null);
});
