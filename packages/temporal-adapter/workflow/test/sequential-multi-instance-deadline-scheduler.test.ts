import assert from "node:assert/strict";
import test from "node:test";

import {
  ActivityBodyKind,
  SemanticOperationKind,
  applyInternalOperation,
  completeSequentialMultiInstanceIteration,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticOperation,
} from "@bpmn-lean/semantic-core";

import {
  completeIteration,
  outerActivityId,
  outerTimerId,
  reviewProgram,
  start,
  startEmpty,
  startedState,
} from "../../../semantic-core/test/sequential-multi-instance-fixture.ts";
import {
  createBoundedDeadlineScheduler,
  sequentialMultiInstanceDeadlineFamily,
} from "../dist/index.js";

function operationOfKind(kind: SemanticOperationKind): SemanticOperation {
  const operation = reviewProgram.operations.find((candidate) =>
    candidate.kind === kind
  );
  assert.ok(operation !== undefined, `fixture must carry one ${kind}`);
  return operation;
}

function enter(initialVariables: typeof start.initialVariables): RuntimeState {
  const initiated = applyInternalOperation(
    reviewProgram,
    operationOfKind(SemanticOperationKind.Initiate),
    startedState({ initialVariables }),
  );
  assert.ok(initiated !== null);
  const entered = applyInternalOperation(
    reviewProgram,
    operationOfKind(
      SemanticOperationKind.AwaitSequentialMultiInstanceUserTask,
    ),
    initiated,
  );
  assert.ok(entered !== null);
  return entered;
}

function scheduler() {
  return createBoundedDeadlineScheduler(
    reviewProgram,
    async () => {},
    sequentialMultiInstanceDeadlineFamily,
  );
}

test("keeps one outer deadline through inner task turnover", () => {
  const first = enter(start.initialVariables);
  const managed = scheduler();
  assert.equal(managed.ownsCommittedDeadline(first), true);
  assert.doesNotThrow(() => managed.reconcileCommittedState(first));

  const second = completeSequentialMultiInstanceIteration(
    reviewProgram,
    first,
    completeIteration(0, "accepted-alpha"),
  );
  assert.ok(second !== null);
  assert.equal(managed.ownsCommittedDeadline(second), true);
  assert.doesNotThrow(() => managed.reconcileCommittedState(second));
  assert.deepEqual(second.timerWaits.map(({ id }) => id), [outerTimerId]);
  assert.deepEqual(second.activityOccurrences.map(({ id }) => id), [
    outerActivityId,
  ]);
});

test("owns no deadline on the zero-item completion arm", () => {
  const completed = enter(startEmpty.initialVariables);
  assert.deepEqual(completed.timerWaits, []);
  assert.equal(scheduler().ownsCommittedDeadline(completed), false);
});

test("refuses a lifetime deadline detached from its exact outer controller", () => {
  const entered = enter(start.initialVariables);
  const [controller] = entered.sequentialMultiInstanceControllers ?? [];
  assert.ok(controller !== undefined);
  for (
    const controllers of [
      [],
      [{
        ...controller,
        id: { ...controller.id, activation: controller.id.activation + 1 },
      }],
      [controller, { ...controller }],
    ]
  ) {
    assert.throws(
      () => scheduler().reconcileCommittedState({
        ...entered,
        sequentialMultiInstanceControllers: controllers,
      }),
      /Managed sequential Multi-Instance Activity is not one controller, one active task, and one exact PT5S outer-lifetime boundary deadline/u,
    );
  }
});

test("refuses a controller whose live body belongs to another Activity family", () => {
  const entered = enter(start.initialVariables);
  const [record] = entered.activityOccurrences;
  assert.ok(record !== undefined);
  const malformed: RuntimeState = {
    ...entered,
    activityOccurrences: [{
      ...record,
      body: { kind: ActivityBodyKind.ChildScope, scope: record.owner },
    }],
  };
  assert.throws(
    () => scheduler().reconcileCommittedState(malformed),
    /Managed sequential Multi-Instance Activity is not one controller, one active task, and one exact PT5S outer-lifetime boundary deadline/u,
  );
});

test("refuses a controller whose record names another program operation", () => {
  const entered = enter(start.initialVariables);
  const [record] = entered.activityOccurrences;
  assert.ok(record !== undefined);
  const malformed: RuntimeState = {
    ...entered,
    activityOccurrences: [{ ...record, operationId: "operation:another-family" }],
  };
  assert.throws(
    () => scheduler().reconcileCommittedState(malformed),
    /Managed sequential Multi-Instance Activity is not one controller, one active task, and one exact PT5S outer-lifetime boundary deadline/u,
  );
});
