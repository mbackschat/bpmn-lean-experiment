import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  CommandOutcome,
  SemanticOperationKind,
  SemanticOriginKind,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  InternalTransitionStateAtom,
  InternalTransitionStateFootprint,
} from "../src/internal-transition-footprint.ts";

import {
  boundedProgram,
  start as boundedStart,
} from "./bounded-task-fixture.ts";
import {
  callActivityProgram,
  callActivityStart,
  expectedCalledInstanceId,
} from "./call-activity-fixture.ts";
import {
  monitoredProgram,
  start as monitoredStart,
} from "./monitored-task-fixture.ts";

type ActivityArmingPreparationModule =
  typeof import("../src/internal-transition-activity-arming-preparation.ts");
type ActivityArmingRuntimeModule =
  typeof import("../src/semantic-process-activity-arming.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");

const preparationModule = await import(
  new URL(
    "../dist/internal-transition-activity-arming-preparation.js",
    import.meta.url,
  ).href
) as ActivityArmingPreparationModule;
const activityArmingRuntimeModule = await import(
  new URL("../dist/semantic-process-activity-arming.js", import.meta.url).href
) as ActivityArmingRuntimeModule;
const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;

const { deriveInternalActivityArmingPreparation } = preparationModule;
const { armActivityWithBoundaryTimer } = activityArmingRuntimeModule;
const {
  InternalOccurrenceKind,
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;

const boundedOperation = requireActivityArmingOperation(boundedProgram);
const monitoredOperation = requireActivityArmingOperation(monitoredProgram);
const beforeBounded = beforeArming(boundedProgram, boundedStart);
const beforeMonitored = beforeArming(monitoredProgram, monitoredStart);

test("prepares both boundary-task families through one complete Activity arming shape", () => {
  for (const [program, state, operation] of [
    [boundedProgram, beforeBounded, boundedOperation],
    [monitoredProgram, beforeMonitored, monitoredOperation],
  ] as const) {
    const prepared = requirePrepared(deriveInternalActivityArmingPreparation(
      program,
      state,
      operation,
    ));

    assert.equal(prepared.alternative.operationId, operation.id);
    assert.deepEqual(prepared.record, {
      id: {
        processInstanceId: prepared.owner.processInstanceId,
        activityElementId: operation.task.elementId,
        activation: 1,
      },
      owner: prepared.owner,
      operationId: operation.id,
      body: {
        kind: ActivityBodyKind.UserTask,
        task: prepared.taskWait.id,
      },
      attachedTimers: [prepared.timerWait.id],
    });
    assert.deepEqual(activationWrites(prepared.footprint), [
      { occurrenceKind: InternalOccurrenceKind.Activity, elementId: operation.task.elementId },
      { occurrenceKind: InternalOccurrenceKind.Timer, elementId: operation.boundaryTimer.elementId },
      { occurrenceKind: InternalOccurrenceKind.UserTask, elementId: operation.task.elementId },
    ]);
    assert.equal(writesOfKind(
      prepared.footprint,
      InternalTransitionStateAtomKind.ActivityAssociation,
    ).length, 1);
    assert.equal(writesOfKind(
      prepared.footprint,
      InternalTransitionStateAtomKind.Wait,
    ).length, 2);
    assert.equal(writesOfKind(
      prepared.footprint,
      InternalTransitionStateAtomKind.OpenWaitAnchor,
    ).length, 2);
    assert.equal(writesOfKind(
      prepared.footprint,
      InternalTransitionStateAtomKind.ControlToken,
    ).length, 1);
    assert.equal(prepared.footprint.reads.some(({ kind }) =>
      kind === InternalTransitionStateAtomKind.LogicalTime
    ), true);

    const armed = armActivityWithBoundaryTimer(operation, state, prepared.owner);
    assert.ok(armed !== null);
    assert.deepEqual(armed.activityOccurrences, [prepared.record]);
    assert.deepEqual(armed.userTaskWaits, [prepared.taskWait]);
    assert.deepEqual(armed.timerWaits, [prepared.timerWait]);
  }
});

test("conflicts on Activity identity, body ownership, and attached Timer ownership", () => {
  const prepared = requirePrepared(deriveInternalActivityArmingPreparation(
    boundedProgram,
    beforeBounded,
    boundedOperation,
  ));
  const record = prepared.record;

  const sameIdentity = {
    ...record,
    body: {
      kind: ActivityBodyKind.UserTask,
      task: { ...prepared.taskWait.id, elementId: "AnotherTask" },
    },
    attachedTimers: [{ ...prepared.timerWait.id, elementId: "AnotherTimer" }],
  } as const;
  const sameBody = {
    ...record,
    id: { ...record.id, activityElementId: "AnotherActivity" },
    attachedTimers: [{ ...prepared.timerWait.id, elementId: "AnotherTimer" }],
  } as const;
  const sameTimer = {
    ...record,
    id: { ...record.id, activityElementId: "AnotherActivity" },
    body: {
      kind: ActivityBodyKind.UserTask,
      task: { ...prepared.taskWait.id, elementId: "AnotherTask" },
    },
  } as const;
  const sameBodyThroughParallelClaim = {
    ...record,
    id: { ...record.id, activityElementId: "ParallelActivity" },
    body: {
      kind: ActivityBodyKind.ParallelUserTasks,
      tasks: [
        prepared.taskWait.id,
        { ...prepared.taskWait.id, elementId: "ParallelSibling" },
      ],
    },
    attachedTimers: [{ ...prepared.timerWait.id, elementId: "AnotherTimer" }],
  } as const;

  for (const candidate of [
    sameIdentity,
    sameBody,
    sameTimer,
    sameBodyThroughParallelClaim,
  ]) {
    assert.equal(independent(prepared.footprint, {
      reads: [],
      writes: [{
        kind: InternalTransitionStateAtomKind.ActivityAssociation,
        record: candidate,
      }],
    }), false);
  }
});

test("refuses hidden Activity identity and either occupied public wait anchor", () => {
  const prepared = requirePrepared(deriveInternalActivityArmingPreparation(
    boundedProgram,
    beforeBounded,
    boundedOperation,
  ));
  assert.equal(deriveInternalActivityArmingPreparation(
    boundedProgram,
    { ...beforeBounded, activityOccurrences: [prepared.record] },
    boundedOperation,
  ), null);

  for (const id of [prepared.taskWait.id, prepared.timerWait.id]) {
    const occupied: RuntimeState = {
      ...beforeBounded,
      userTaskWaits: [{
        id,
        owner: prepared.owner,
        name: "foreign anchor",
        output: "place:foreign",
      }],
    };
    assert.equal(deriveInternalActivityArmingPreparation(
      boundedProgram,
      occupied,
      boundedOperation,
    ), null);
  }
});

test("refuses every Activity arming counter at the safe-integer boundary", () => {
  const counterFamilies = [
    ["activityActivations", boundedOperation.task.elementId],
    ["taskActivations", boundedOperation.task.elementId],
    ["timerActivations", boundedOperation.boundaryTimer.elementId],
  ] as const;
  for (const [family, elementId] of counterFamilies) {
    const unsafe: RuntimeState = {
      ...beforeBounded,
      [family]: [{ elementId, count: Number.MAX_SAFE_INTEGER }],
    };
    assert.equal(deriveInternalActivityArmingPreparation(
      boundedProgram,
      unsafe,
      boundedOperation,
    ), null, family);
  }
});

test("binds a called-owner Activity, task, and Timer to the called semantic instance", () => {
  const calledEntered = applyStimulus(
    callActivityProgram,
    initialState,
    callActivityStart(),
    2,
  );
  assert.equal(calledEntered.outcome, CommandOutcome.Committed);
  assert.equal(calledEntered.internalStepBoundExceeded, true);
  const operation = calledActivityArmingOperation();
  const program: SemanticProcessProgram = {
    ...callActivityProgram,
    operations: callActivityProgram.operations.map((candidate) =>
      candidate.id === operation.id ? operation : candidate
    ),
  };
  const prepared = requirePrepared(deriveInternalActivityArmingPreparation(
    program,
    calledEntered.state,
    operation,
  ));

  assert.equal(prepared.owner.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.record.id.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.taskWait.id.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.timerWait.id.processInstanceId, expectedCalledInstanceId);
});

function beforeArming(
  program: SemanticProcessProgram,
  start: Parameters<typeof applyStimulus>[2],
): RuntimeState {
  const result = applyStimulus(program, initialState, start, 1);
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, true);
  return result.state;
}

function calledActivityArmingOperation(): Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.AwaitBoundedUserTask }
> {
  return {
    id: "operation:Task_Called",
    kind: SemanticOperationKind.AwaitBoundedUserTask,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: "CalledBoundedTask",
    },
    input: "place:Called_Start",
    task: {
      elementId: "CalledBoundedTask",
      name: "Called bounded task",
      output: "place:Called_End",
    },
    boundaryTimer: {
      elementId: "CalledDeadline",
      durationMs: 1000,
      output: "place:Called_End",
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "CalledDeadlineFlow",
      },
    },
  };
}

function requireActivityArmingOperation(
  program: SemanticProcessProgram,
): Extract<
  SemanticOperation,
  {
    kind:
      | SemanticOperationKind.AwaitBoundedUserTask
      | SemanticOperationKind.AwaitMonitoredUserTask;
  }
> {
  const operation = program.operations.find((candidate) =>
    candidate.kind === SemanticOperationKind.AwaitBoundedUserTask ||
    candidate.kind === SemanticOperationKind.AwaitMonitoredUserTask
  );
  if (
    operation?.kind !== SemanticOperationKind.AwaitBoundedUserTask &&
    operation?.kind !== SemanticOperationKind.AwaitMonitoredUserTask
  ) {
    throw new Error("expected a boundary-task arming operation");
  }
  return operation;
}

function requirePrepared<Prepared>(prepared: Prepared | null): Prepared {
  if (prepared === null) {
    throw new Error("expected a prepared Activity arming transition");
  }
  return prepared;
}

function activationWrites(footprint: InternalTransitionStateFootprint) {
  return footprint.writes.flatMap((atom) =>
    atom.kind === InternalTransitionStateAtomKind.Activation
      ? [{ occurrenceKind: atom.occurrenceKind, elementId: atom.elementId }]
      : []
  );
}

function writesOfKind<Kind extends InternalTransitionStateAtom["kind"]>(
  footprint: InternalTransitionStateFootprint,
  kind: Kind,
) {
  return footprint.writes.filter((atom) => atom.kind === kind);
}

function independent(
  left: InternalTransitionStateFootprint,
  right: InternalTransitionStateFootprint,
): boolean {
  return internalTransitionStateFootprintsAreIndependent(left, right);
}
