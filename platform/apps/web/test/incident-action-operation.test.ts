import assert from "node:assert/strict";
import test from "node:test";

import type {
  IncidentActionRequest,
  IncidentActionResult,
} from "@bpmn-lean/platform-contracts";

import {
  IncidentActionOperation,
  IncidentActionView,
  incidentActionView,
  retainedIncidentActionLabel,
} from "../src/incident-action-operation.ts";

const incidentId = {
  effectId: {
    processInstanceId: "process-1",
    elementId: "ServiceTask_Fail",
    activation: 1,
  },
  generation: 1,
} as const;

const cancel = {
  kind: "cancelIncidentProcess",
  processInstanceId: "process-1",
  incidentId,
} as const satisfies IncidentActionRequest;

test("retains one exact confirmed Cancel action across transport failure and indeterminate retry", async () => {
  const requests: Array<Readonly<{ actionId: string; body: string }>> = [];
  let call = 0;
  const operation = new IncidentActionOperation({
    async submitAction(actionId, request) {
      requests.push({ actionId, body: JSON.stringify(request) });
      call += 1;
      if (call === 1) throw new TypeError("network unavailable");
      return {
        state: "indeterminate",
        actionId,
        interaction: structuredClone(request),
      };
    },
  });

  operation.begin("cancel-action-1", cancel);
  await assert.rejects(operation.submit(), /network unavailable/u);
  assert.equal(operation.hasRetainedAction, true);
  assert.deepEqual(await operation.submit(), {
    state: "indeterminate",
    actionId: "cancel-action-1",
    interaction: cancel,
  });
  assert.equal(operation.hasRetainedAction, true);
  assert.deepEqual(requests, [
    { actionId: "cancel-action-1", body: JSON.stringify(cancel) },
    { actionId: "cancel-action-1", body: JSON.stringify(cancel) },
  ]);
});

test("clears only terminal actions and never presents processClosed rejection as current or successful", async () => {
  const rejected = {
    state: "rejected",
    actionId: "cancel-action-1",
    interaction: cancel,
    engineResult: { kind: "processClosed", status: "cancelled" },
  } as const satisfies IncidentActionResult;
  const operation = new IncidentActionOperation({
    async submitAction() {
      return rejected;
    },
  });

  operation.begin(rejected.actionId, cancel);
  assert.deepEqual(await operation.submit(), rejected);
  assert.equal(operation.hasRetainedAction, false);
  assert.equal(incidentActionView(rejected, true), IncidentActionView.RejectedNoLongerCurrent);
});

test("names exact resubmission from the retained interaction rather than semantic Retry availability", () => {
  assert.equal(retainedIncidentActionLabel("retryIncident"), "Submit Retry again");
  assert.equal(
    retainedIncidentActionLabel("cancelIncidentProcess"),
    "Submit Cancel Process again",
  );
});
