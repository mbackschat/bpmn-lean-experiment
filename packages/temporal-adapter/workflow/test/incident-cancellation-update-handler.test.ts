import assert from "node:assert/strict";
import test from "node:test";

import { StimulusKind } from "@bpmn-lean/semantic-core";
import {
  validateCancelIncidentProcessUpdate,
} from "../dist/incident-cancellation-update-handler.js";

const cancellation = {
  kind: StimulusKind.CancelIncidentProcess,
  commandId: "cancel-incident-process",
  processInstanceId: "Instance_1",
  incidentId: {
    effectId: {
      processInstanceId: "Instance_1",
      elementId: "ServiceTask_Record",
      activation: 1,
    },
    generation: 1,
  },
} as const;

test("strictly validates cancellation payload and all Process identities", () => {
  assert.doesNotThrow(() =>
    validateCancelIncidentProcessUpdate([], "Instance_1", cancellation)
  );
  for (const extra of [
    { scope: "caller-owned" },
    { owner: { scope: "caller-owned" } },
    { reason: "caller-owned" },
    { force: true },
  ]) {
    assert.throws(() =>
      validateCancelIncidentProcessUpdate(
        [],
        "Instance_1",
        { ...cancellation, ...extra } as never,
      )
    );
  }
  assert.throws(() =>
    validateCancelIncidentProcessUpdate(
      [],
      "Instance_1",
      { ...cancellation, processInstanceId: "Instance_2" },
    )
  );
  assert.throws(() =>
    validateCancelIncidentProcessUpdate(
      [],
      "Instance_1",
      {
        ...cancellation,
        incidentId: {
          ...cancellation.incidentId,
          effectId: {
            ...cancellation.incidentId.effectId,
            processInstanceId: "Instance_2",
          },
        },
      },
    )
  );
});
