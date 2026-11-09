import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bridgeOutcomes,
  cibEvidenceEffectSchedule,
  requireReplacementAuthorization,
} from "./replace-cibseven-evidence.ts";

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

test("reads each scenario's answer or harness failure from the bridge output, in request order", () => {
  const result = { kind: "scenarioResult", scenarioId: "a" };
  const failure = { kind: "scenarioHarnessFailure", scenarioId: "b", failure: "java.lang.IllegalStateException: no host" };
  assert.deepEqual(bridgeOutcomes(["a", "b"], [JSON.stringify(result), JSON.stringify(failure)]), {
    results: [result],
    failures: [{ scenarioId: "b", failure: "java.lang.IllegalStateException: no host" }],
  });
});

test("refuses bridge output that skips, reorders or invents a scenario", () => {
  const line = (kind: string, scenarioId: string) => JSON.stringify({ kind, scenarioId, failure: "x" });
  assert.throws(() => bridgeOutcomes(["a", "b"], [line("scenarioResult", "a")]), /answered 1 of 2 scenarios/);
  assert.throws(() => bridgeOutcomes(["a", "b"], [line("scenarioResult", "b"), line("scenarioResult", "a")]),
    /line 1 answers b, not a/);
  assert.throws(() => bridgeOutcomes(["a"], [line("other", "a")]), /line 1 has kind other/);
});
