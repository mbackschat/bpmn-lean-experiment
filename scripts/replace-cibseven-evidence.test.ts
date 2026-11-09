import assert from "node:assert/strict";
import { test } from "node:test";

import {
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
