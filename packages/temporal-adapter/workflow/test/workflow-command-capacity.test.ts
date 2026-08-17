import assert from "node:assert/strict";
import test from "node:test";

import {
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowChainBudgetKind,
  workflowChainCanonicalUtf8ByteLength,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import {
  WorkflowCommandCapacityPreflightKind,
  WorkflowCommandCapacityState,
} from "../dist/index.js";

test("accepts exact stimulus, queue, Update-count, and in-flight boundaries", () => {
  const stimulus = completion("Command_1", "approved");
  const stimulusBytes = workflowChainCanonicalUtf8ByteLength(stimulus);
  const queueBytes = workflowChainCanonicalUtf8ByteLength([stimulus]);
  const capacity = new WorkflowCommandCapacityState({
    semanticStimulusBytes: stimulusBytes,
    semanticInputQueueEntries: 1,
    semanticInputQueueBytes: queueBytes,
    acceptedUpdatesPerRun: 1,
    concurrentInFlightUpdates: 1,
  });

  assert.deepEqual(capacity.preflightUpdate(stimulus), {
    kind: WorkflowCommandCapacityPreflightKind.Ready,
  });
  assert.deepEqual(capacity.beginUpdate(stimulus), {
    kind: WorkflowCommandCapacityPreflightKind.Ready,
  });
  assert.deepEqual(capacity.snapshot(), {
    acceptedUpdates: 1,
    inFlightUpdates: 1,
    queuedStimuli: 1,
    queuedCanonicalUtf8Bytes: queueBytes,
    rolloverRequested: true,
  });

  capacity.releaseStimulus(stimulus);
  capacity.finishUpdate();
  assert.deepEqual(capacity.snapshot(), {
    acceptedUpdates: 1,
    inFlightUpdates: 0,
    queuedStimuli: 0,
    queuedCanonicalUtf8Bytes: 2,
    rolloverRequested: true,
  });
});

test("refuses a multibyte oversized stimulus before reserving queue state", () => {
  const stimulus = completion("Command_€", "approved");
  const observedValue = workflowChainCanonicalUtf8ByteLength(stimulus);
  const capacity = capacityState({ semanticStimulusBytes: observedValue - 1 });

  assert.deepEqual(capacity.preflightUpdate(stimulus), {
    kind: WorkflowCommandCapacityPreflightKind.CapacityExceeded,
    failure: {
      budget: WorkflowChainBudgetKind.SemanticStimulusBytes,
      configuredBound: observedValue - 1,
      observedValue,
    },
  });
  assert.deepEqual(capacity.snapshot(), emptySnapshot());
});

test("treats Update concurrency and queue pressure as retryable rollover admission", () => {
  const first = completion("Command_1", "approved");
  const second = completion("Command_2", "approved");
  const capacity = capacityState({ concurrentInFlightUpdates: 1 });

  assert.equal(
    capacity.beginUpdate(first).kind,
    WorkflowCommandCapacityPreflightKind.Ready,
  );
  assert.deepEqual(capacity.preflightUpdate(second), {
    kind: WorkflowCommandCapacityPreflightKind.Rollover,
    bound: {
      budget: WorkflowChainBudgetKind.ConcurrentInFlightUpdates,
      configuredBound: 1,
      observedValue: 2,
    },
  });
  assert.equal(capacity.snapshot().queuedStimuli, 1);
});

test("requests rollover when the accepted-Update boundary is exactly filled", () => {
  const capacity = capacityState({ acceptedUpdatesPerRun: 3 });
  for (let index = 1; index <= 3; index += 1) {
    const stimulus = completion(`Command_${index}`, "approved");
    assert.equal(
      capacity.beginUpdate(stimulus).kind,
      WorkflowCommandCapacityPreflightKind.Ready,
    );
    capacity.releaseStimulus(stimulus);
    capacity.finishUpdate();
  }

  assert.deepEqual(capacity.preflightUpdate(completion("Command_4", "approved")), {
    kind: WorkflowCommandCapacityPreflightKind.Rollover,
    bound: {
      budget: WorkflowChainBudgetKind.AcceptedUpdatesPerRun,
      configuredBound: 3,
      observedValue: 3,
    },
  });
});

test("fails closed when an accepted Signal or derived stimulus would cross the queue", () => {
  const first = completion("Command_1", "approved");
  const second = completion("Command_2", "approved");
  const capacity = capacityState({ semanticInputQueueEntries: 1 });

  assert.equal(
    capacity.reserveStimulus(first).kind,
    WorkflowCommandCapacityPreflightKind.Ready,
  );
  assert.deepEqual(capacity.reserveStimulus(second), {
    kind: WorkflowCommandCapacityPreflightKind.CapacityExceeded,
    failure: {
      budget: WorkflowChainBudgetKind.SemanticInputQueueEntries,
      configuredBound: 1,
      observedValue: 2,
    },
  });
  assert.equal(capacity.snapshot().queuedStimuli, 1);
});

test("measures the canonical queue array at its exact byte boundary", () => {
  const first = completion("Command_1", "approved");
  const second = completion("Command_2", "approved");
  const exactBytes = workflowChainCanonicalUtf8ByteLength([first]);
  const capacity = capacityState({ semanticInputQueueBytes: exactBytes });

  assert.equal(
    capacity.reserveStimulus(first).kind,
    WorkflowCommandCapacityPreflightKind.Ready,
  );
  assert.deepEqual(capacity.reserveStimulus(second), {
    kind: WorkflowCommandCapacityPreflightKind.CapacityExceeded,
    failure: {
      budget: WorkflowChainBudgetKind.SemanticInputQueueBytes,
      configuredBound: exactBytes,
      observedValue: workflowChainCanonicalUtf8ByteLength([first, second]),
    },
  });
});

test("coalesces an exact queued command without consuming capacity twice", () => {
  const stimulus = completion("Command_1", "approved");
  const capacity = capacityState({ semanticInputQueueEntries: 1 });

  assert.equal(
    capacity.reserveStimulus(stimulus).kind,
    WorkflowCommandCapacityPreflightKind.Ready,
  );
  assert.equal(
    capacity.reserveStimulus(structuredClone(stimulus)).kind,
    WorkflowCommandCapacityPreflightKind.Ready,
  );
  assert.equal(capacity.snapshot().queuedStimuli, 1);
  assert.throws(
    () => capacity.reserveStimulus(completion("Command_1", "changed")),
    /queued command identity conflict/u,
  );
});

test("allows lowered test limits but never raises a production ceiling", () => {
  assert.throws(
    () => new WorkflowCommandCapacityState({
      ...productionLimits(),
      concurrentInFlightUpdates: workflowChainProductionLimit(
        WorkflowChainBudgetKind.ConcurrentInFlightUpdates,
      ) + 1,
    }),
    /concurrentInFlightUpdates limit exceeds production/u,
  );
});

function capacityState(
  overrides: Partial<ReturnType<typeof productionLimits>>,
): WorkflowCommandCapacityState {
  return new WorkflowCommandCapacityState({
    ...productionLimits(),
    ...overrides,
  });
}

function productionLimits() {
  return {
    semanticStimulusBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.SemanticStimulusBytes,
    ),
    semanticInputQueueEntries: workflowChainProductionLimit(
      WorkflowChainBudgetKind.SemanticInputQueueEntries,
    ),
    semanticInputQueueBytes: workflowChainProductionLimit(
      WorkflowChainBudgetKind.SemanticInputQueueBytes,
    ),
    acceptedUpdatesPerRun: workflowChainProductionLimit(
      WorkflowChainBudgetKind.AcceptedUpdatesPerRun,
    ),
    concurrentInFlightUpdates: workflowChainProductionLimit(
      WorkflowChainBudgetKind.ConcurrentInFlightUpdates,
    ),
  };
}

function emptySnapshot() {
  return {
    acceptedUpdates: 0,
    inFlightUpdates: 0,
    queuedStimuli: 0,
    queuedCanonicalUtf8Bytes: 2,
    rolloverRequested: false,
  };
}

function completion(
  commandId: string,
  value: string,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId,
    taskId: {
      processInstanceId: "Instance_1",
      elementId: "UserTask_1",
      activation: 1,
    },
    submittedValues: [{
      name: "decision",
      value: { kind: "string", value },
    }],
  };
}
