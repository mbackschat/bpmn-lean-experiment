import assert from "node:assert/strict";
import test from "node:test";

import {
  ProcessStatus,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import {
  bpmnCancelIncidentProcessUpdateName,
  canonicalStimulusEncoding,
  contentBoundUpdateId,
  isCancelledProcessReceipt,
  isCompletedProcessReceipt,
  requireTerminalProcessReceipt,
} from "../dist/index.js";

const effectId = {
  processInstanceId: "Instance_1",
  elementId: "ServiceTask_Record",
  activation: 1,
} as const;
const cancellation = {
  kind: StimulusKind.CancelIncidentProcess,
  commandId: "cancel-incident-process",
  processInstanceId: "Instance_1",
  incidentId: { effectId, generation: 1 },
} as const;

test("publishes one content-bound incident cancellation Update contract", () => {
  assert.equal(
    bpmnCancelIncidentProcessUpdateName,
    "bpmn-cancel-incident-process",
  );
  assert.equal(
    canonicalStimulusEncoding(cancellation),
    '["cancelIncidentProcess","cancel-incident-process","Instance_1",["Instance_1","ServiceTask_Record",1],1]',
  );
  for (const changed of [
    { ...cancellation, commandId: "cancel-other" },
    { ...cancellation, processInstanceId: "Instance_2" },
    {
      ...cancellation,
      incidentId: {
        ...cancellation.incidentId,
        effectId: { ...effectId, processInstanceId: "Instance_2" },
      },
    },
    {
      ...cancellation,
      incidentId: {
        ...cancellation.incidentId,
        effectId: { ...effectId, elementId: "ServiceTask_Other" },
      },
    },
    {
      ...cancellation,
      incidentId: {
        ...cancellation.incidentId,
        effectId: { ...effectId, activation: 2 },
      },
    },
  ]) {
    assert.notEqual(
      contentBoundUpdateId(cancellation),
      contentBoundUpdateId(changed),
    );
  }
});

test("distinguishes a strict cancelled terminal receipt from completed", () => {
  const cancelled = receipt(ProcessStatus.Cancelled);
  assert.equal(isCancelledProcessReceipt(cancelled), true);
  assert.equal(isCompletedProcessReceipt(cancelled), false);
  assert.deepEqual(requireTerminalProcessReceipt(cancelled), cancelled);
  assert.equal(
    isCancelledProcessReceipt({
      ...cancelled,
      finalState: { ...cancelled.finalState, owner: "caller-owned" },
    }),
    false,
  );
});

function receipt(status: ProcessStatus) {
  return {
    definition: {
      compiler: "bpmn-source-semantic-process",
      semanticProfile: "profile",
      sourceId: "source",
      sourceSha256: "a".repeat(64),
      sourceOverlay: null,
    },
    processId: "Process_1",
    processInstanceId: "Instance_1",
    finalState: {
      kind: "state",
      instanceId: "Instance_1",
      status,
      activeWaits: [],
      openUserTasks: [],
      openMessageSubscriptions: [],
      openTimers: [],
      openEffects: [],
      openIncidents: [],
      variables: [],
      enabledInteractions: [],
      logicalTimeMs: 0,
    },
    messageDeliveryRecords: [],
  };
}
