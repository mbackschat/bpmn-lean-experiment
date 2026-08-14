/** Live current-incident Query, lifecycle classification, history, and replay evidence. */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ProcessStatus,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import {
  TemporalProcessOperationsObservationStatus,
  runIncidentOperationsQueryLiveSuite,
} from "@bpmn-lean/temporal-testkit";

import {
  compileExecutionInput,
  loadJson,
  temporalCacheDirectory,
  withDeadline,
} from "./temporal-test-support.ts";

const retryScenarioUrl = new URL(
  "../../../../scenarios/service-task-incident/scenario.json",
  import.meta.url,
);
const cancellationScenarioUrl = new URL(
  "../../../../scenarios/service-task-incident-cancellation/scenario.json",
  import.meta.url,
);
const bpmnUrl = new URL(
  "../../../../scenarios/service-task-effect/process.bpmn",
  import.meta.url,
);

test("dedicated current-incident Query survives actions, closure, and exact history replay", async () => {
  const [retryScenario, cancellationScenario] = await Promise.all([
    loadJson<import("@bpmn-lean/semantic-core").Scenario>(retryScenarioUrl),
    loadJson<import("@bpmn-lean/semantic-core").Scenario>(
      cancellationScenarioUrl,
    ),
  ]);
  const [retryInput, cancellationInput] = await Promise.all([
    compileExecutionInput(retryScenario, bpmnUrl),
    compileExecutionInput(cancellationScenario, bpmnUrl),
  ]);
  const evidence = await withDeadline(
    runIncidentOperationsQueryLiveSuite(
      temporalCacheDirectory,
      retryInput,
      cancellationInput,
    ),
    45_000,
    "incident operations Query live and replay evidence",
  );

  assert.equal(evidence.retry.openSnapshot.status, ProcessStatus.Running);
  assert.deepEqual(
    evidence.retry.openSnapshot.incidents[0]?.interactions.map(
      ({ kind }) => kind,
    ),
    [StimulusKind.RetryIncident],
  );
  assert.equal(
    evidence.retry.openClassification.status,
    TemporalProcessOperationsObservationStatus.Observed,
  );
  assert.deepEqual(
    evidence.retry.queryHistoryEventCounts[0],
    evidence.retry.queryHistoryEventCounts[1],
  );
  assert.equal(evidence.retry.currentSnapshot.status, ProcessStatus.Running);
  assert.deepEqual(evidence.retry.currentSnapshot.incidents, []);
  assert.equal(
    evidence.retry.traceDerivedCurrentIncidentMutation.length > 0,
    true,
  );
  assert.equal(evidence.retry.terminalSnapshot.status, ProcessStatus.Completed);
  assert.equal(
    evidence.retry.terminalClassification.status,
    TemporalProcessOperationsObservationStatus.Closed,
  );

  assert.equal(
    evidence.cancellation.openSnapshot.status,
    ProcessStatus.Running,
  );
  assert.deepEqual(
    evidence.cancellation.openSnapshot.incidents[0]?.interactions.map(
      ({ kind }) => kind,
    ),
    [StimulusKind.RetryIncident, StimulusKind.CancelIncidentProcess],
  );
  assert.deepEqual(
    evidence.cancellation.queryHistoryEventCounts[0],
    evidence.cancellation.queryHistoryEventCounts[1],
  );
  assert.equal(
    evidence.cancellation.terminalSnapshot.status,
    ProcessStatus.Cancelled,
  );
  assert.equal(
    evidence.cancellation.terminalClassification.status,
    TemporalProcessOperationsObservationStatus.Closed,
  );
});
