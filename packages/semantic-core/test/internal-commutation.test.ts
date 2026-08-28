import assert from "node:assert/strict";
import { test } from "node:test";

import {
  SemanticOperationKind,
  SemanticProfileId,
  SemanticTransitionKind,
  addActivityVariableScope,
  applyInternalOperationStep,
  applyStimulus,
  applyStimulusWithTrace,
  initialState,
  isWellFormedSemanticProcessProgram,
  projectFlowNodeOccurrenceLifecycleDelta,
} from "@bpmn-lean/semantic-core";
import type {
  AppliedInternalOperationStep,
  SemanticOperation,
} from "@bpmn-lean/semantic-core";

import {
  InternalOccurrenceKind,
  InternalTransitionPublicationAtomKind,
  InternalTransitionStateAtomKind,
  closeFrontier,
  closeSupportedInternalOperations,
  deriveInternalTransitionFootprint,
  effectFrontier,
  effectProgram,
  enabledOperations,
  frontier,
  internalOperationPairIsIndependent,
  internalTransitionFootprintsAreIndependent,
  program,
  requireFootprint,
  requireTwo,
  runExplicitOrder,
  unsupportedFrontier,
  unsupportedProgram,
} from "./internal-commutation-fixture.ts";
import type { InternalTransitionFootprint } from "./internal-commutation-fixture.ts";
import {
  parallelProgram,
  startStimulus,
} from "./parallel-fork-join-fixture.ts";

test("closes one independent User Task and Timer frontier", () => {
  const closed = closeFrontier(program, frontier, 2);

  assert.equal(closed.ambiguousInternalChoice, false);
  assert.equal(closed.hitBound, false);
  assert.deepEqual(
    closed.steps.map(({ operation }) => operation.id),
    ["operation:Task", "operation:Timer"],
  );
  assert.equal(closed.state.userTaskWaits.length, 1);
  assert.equal(closed.state.timerWaits.length, 1);
});

test("derives complete positive User Task and mixed Timer footprints", () => {
  const mixedCandidates = enabledOperations(program, frontier);
  assert.equal(mixedCandidates.length, 2);
  const mixedFootprints = mixedCandidates.map((candidate) =>
    deriveInternalTransitionFootprint(program, frontier, candidate)
  );

  assert.ok(mixedFootprints.every((footprint) => footprint !== null));
  assert.equal(
    internalOperationPairIsIndependent(program, frontier, mixedCandidates),
    true,
  );

  const beforeParallelTasks = applyStimulus(
    parallelProgram,
    initialState,
    startStimulus(),
    2,
  );
  assert.equal(beforeParallelTasks.internalStepBoundExceeded, true);
  const taskCandidates = enabledOperations(
    parallelProgram,
    beforeParallelTasks.state,
  );
  assert.deepEqual(
    taskCandidates.map(({ operation }) => operation.kind),
    [SemanticOperationKind.AwaitUserTask, SemanticOperationKind.AwaitUserTask],
  );
  assert.equal(
    internalOperationPairIsIndependent(
      parallelProgram,
      beforeParallelTasks.state,
      taskCandidates,
    ),
    true,
  );
});

test("the mixed frontier carries every reviewed atom and publication fact", () => {
  const [task, timer] = requireTwo(enabledOperations(program, frontier));

  assert.deepEqual(
    requireFootprint(program, frontier, task),
    expectedArmingFootprint(task, InternalOccurrenceKind.UserTask, "Task", "Flow_TaskInput", false),
  );
  assert.deepEqual(
    requireFootprint(program, frontier, timer),
    expectedArmingFootprint(timer, InternalOccurrenceKind.Timer, "Timer", "Flow_TimerInput", true),
  );

  const singleEffectProgram = {
    ...effectProgram,
    operations: effectProgram.operations.filter(({ id }) =>
      id === "operation:EffectLeft"
    ),
    operationScopes: effectProgram.operationScopes.filter(({ operationId }) =>
      operationId === "operation:EffectLeft"
    ),
  };
  const [effect] = enabledOperations(singleEffectProgram, effectFrontier);
  assert.ok(effect !== undefined && effect.owner !== null);
  if (effectFrontier.control.kind !== "running") {
    throw new TypeError("The effect footprint oracle requires a running state");
  }
  const effectFootprint = requireFootprint(
    singleEffectProgram,
    effectFrontier,
    effect,
  );
  assert.deepEqual(
    effectFootprint.writes.map(({ kind }) => kind),
    [
      InternalTransitionStateAtomKind.Activation,
      InternalTransitionStateAtomKind.ActivityVariable,
      InternalTransitionStateAtomKind.ActivityVariableScope,
      InternalTransitionStateAtomKind.ControlToken,
      InternalTransitionStateAtomKind.OpenWaitAnchor,
      InternalTransitionStateAtomKind.Wait,
    ],
  );
  assert.deepEqual(
    effectFootprint.writes.filter(({ kind }) =>
      kind === InternalTransitionStateAtomKind.ActivityVariable
    ),
    [{
      kind: InternalTransitionStateAtomKind.ActivityVariable,
      occurrence: {
        kind: InternalOccurrenceKind.Effect,
        id: {
          processInstanceId: effectFrontier.control.instanceId,
          elementId: "SharedEffect",
          activation: 1,
        },
      },
      owner: effect.owner,
      name: "request",
    }],
  );
});

test("footprints derive from the exact pre-state and never from a candidate successor", () => {
  const [candidate] = enabledOperations(program, frontier);
  assert.ok(candidate !== undefined);
  const expected = deriveInternalTransitionFootprint(program, frontier, candidate);
  const poisonedCandidate = {
    ...candidate,
    successor: {
      ...candidate.successor,
      logicalTimeMs: 9007199254740991,
      taskActivations: [{ elementId: "poison", count: 9007199254740991 }],
      userTaskWaits: [],
      timerWaits: [],
    },
  };

  assert.deepEqual(
    deriveInternalTransitionFootprint(program, frontier, poisonedCandidate),
    expected,
  );
});

test("Program admission and the local footprint defense reject duplicate wait declarers", () => {
  const duplicateOperations = parallelProgram.operations.map((operation) =>
    operation.kind === SemanticOperationKind.AwaitUserTask &&
      operation.task.elementId === "UserTask_B"
      ? {
        ...operation,
        origin: { ...operation.origin, elementId: "UserTask_A" },
        task: { ...operation.task, elementId: "UserTask_A" },
      }
      : operation
  );
  const duplicateProgram = {
    ...parallelProgram,
    operations: duplicateOperations,
  };

  assert.equal(isWellFormedSemanticProcessProgram(duplicateProgram), false);
  const beforeParallelTasks = applyStimulus(
    parallelProgram,
    initialState,
    startStimulus(),
    2,
  ).state;
  const selected = enabledOperations(duplicateProgram, beforeParallelTasks);
  assert.equal(selected.length, 2);
  assert.ok(selected.every((candidate) =>
    deriveInternalTransitionFootprint(
      duplicateProgram,
      beforeParallelTasks,
      candidate,
    ) === null
  ));
});

test("cross-family lifecycle-anchor collision is refused before successor selection", () => {
  const crossFamilyProgram = {
    ...parallelProgram,
    identity: {
      ...parallelProgram.identity,
      semanticProfile: SemanticProfileId.TimerUserTaskComposition,
    },
    operations: parallelProgram.operations.map(crossFamilyTimerArm),
  };
  const beforeParallelTasks = applyStimulus(
    parallelProgram,
    initialState,
    startStimulus(),
    2,
  ).state;
  const selected = requireTwo(
    enabledOperations(crossFamilyProgram, beforeParallelTasks),
  );

  assert.equal(isWellFormedSemanticProcessProgram(crossFamilyProgram), true);
  assert.deepEqual(
    selected.map(({ operation }) => operation.kind),
    [SemanticOperationKind.AwaitUserTask, SemanticOperationKind.AwaitTimer],
  );
  const first = applyInternalOperationStep(
    crossFamilyProgram,
    selected[0].operation,
    beforeParallelTasks,
  );
  assert.ok(first !== null && first.owner !== null);
  const second = applyInternalOperationStep(
    crossFamilyProgram,
    selected[1].operation,
    first.successor,
  );
  assert.ok(second !== null && second.owner !== null);
  assert.equal(
    projectFlowNodeOccurrenceLifecycleDelta(
      crossFamilyProgram,
      first.successor,
      second.successor,
      {
        kind: "internal",
        operation: second.operation,
        owner: second.owner,
      },
      "cross-family-collision",
      1,
    ),
    null,
  );
  assert.equal(
    internalOperationPairIsIndependent(
      crossFamilyProgram,
      beforeParallelTasks,
      selected,
    ),
    false,
  );
});

test("both explicit mixed execution orders reach exact raw state and publication equality", () => {
  const [task, timer] = requireTwo(enabledOperations(program, frontier));
  const taskThenTimer = runExplicitOrder(program, frontier, task, timer);
  const timerThenTask = runExplicitOrder(program, frontier, timer, task);

  assert.deepEqual(timerThenTask.state, taskThenTimer.state);
  assert.deepEqual(timerThenTask.transitions, taskThenTimer.transitions);
  assert.deepEqual(timerThenTask.lifecycles, taskThenTimer.lifecycles);
});

test("canonical selection is invariant under Program collection permutation", () => {
  const permuted = {
    ...program,
    operations: [...program.operations].reverse(),
  };
  const canonical = closeFrontier(program, frontier, 2);
  const reversed = closeFrontier(permuted, frontier, 2);

  assert.deepEqual(reversed, canonical);
});

test("rejects a pure write/read conflict independently of writes and publications", () => {
  const [leftCandidate, rightCandidate] = requireTwo(
    enabledOperations(program, frontier),
  );
  const left = requireFootprint(program, frontier, leftCandidate);
  const right = requireFootprint(program, frontier, rightCandidate);
  const shared = {
    kind: InternalTransitionStateAtomKind.Activation,
    occurrenceKind: InternalOccurrenceKind.UserTask,
    elementId: "SharedRead",
  } as const;
  const leftAbstract: InternalTransitionFootprint = {
    ...left,
    reads: [],
    writes: [shared],
  };
  const rightWithoutRead: InternalTransitionFootprint = {
    ...right,
    reads: [],
  };
  const rightWithRead: InternalTransitionFootprint = {
    ...rightWithoutRead,
    reads: [shared],
  };

  assert.equal(
    internalTransitionFootprintsAreIndependent(
      leftAbstract,
      rightWithoutRead,
    ),
    true,
  );
  assert.equal(
    internalTransitionFootprintsAreIndependent(leftAbstract, rightWithRead),
    false,
  );
});

test("rejects publication-key collision even when all state sets are empty", () => {
  const [leftCandidate, rightCandidate] = requireTwo(
    enabledOperations(program, frontier),
  );
  const left = requireFootprint(program, frontier, leftCandidate);
  const right = requireFootprint(program, frontier, rightCandidate);
  const publication = left.publications.find(({ kind }) =>
    kind === InternalTransitionPublicationAtomKind.PublicationPair
  );
  assert.ok(publication !== undefined);

  assert.equal(
    internalTransitionFootprintsAreIndependent(
      { ...left, reads: [], writes: [], publications: [publication] },
      { ...right, reads: [], writes: [], publications: [publication] },
    ),
    false,
  );
});

test("same-effect declarers are refused beyond distinct operation and control identifiers", () => {
  const candidates = enabledOperations(effectProgram, effectFrontier);
  assert.deepEqual(
    candidates.map(({ operation }) => operation.id),
    ["operation:EffectLeft", "operation:EffectRight"],
  );
  assert.ok(candidates.every((candidate) =>
    deriveInternalTransitionFootprint(
      effectProgram,
      effectFrontier,
      candidate,
    ) === null
  ));
  assert.equal(
    internalOperationPairIsIndependent(
      effectProgram,
      effectFrontier,
      candidates,
    ),
    false,
  );

  const closed = closeFrontier(effectProgram, effectFrontier, 2);
  assert.equal(closed.ambiguousInternalChoice, true);
  assert.deepEqual(closed.state, effectFrontier);
  assert.deepEqual(closed.steps, []);
});

test("unsupported and colliding larger frontiers fail closed", () => {
  const unsupported = closeFrontier(
    unsupportedProgram,
    unsupportedFrontier,
    2,
  );
  assert.equal(unsupported.ambiguousInternalChoice, true);
  assert.deepEqual(unsupported.state, unsupportedFrontier);
  assert.deepEqual(unsupported.steps, []);

  const candidates = enabledOperations(program, frontier);
  const larger = closeSupportedInternalOperations(
    frontier,
    3,
    () => [...candidates, candidates[0]!],
    (state, enabled) =>
      internalOperationPairIsIndependent(program, state, enabled),
  );
  assert.equal(larger.ambiguousInternalChoice, true);
  assert.deepEqual(larger.state, frontier);
  assert.deepEqual(larger.steps, []);
});

test("zero and one remaining step preserve bound precedence", () => {
  const zero = closeFrontier(program, frontier, 0);
  assert.equal(zero.hitBound, true);
  assert.equal(zero.ambiguousInternalChoice, false);
  assert.deepEqual(zero.state, frontier);
  assert.deepEqual(zero.steps, []);

  const overlappingZero = closeFrontier(effectProgram, effectFrontier, 0);
  assert.equal(overlappingZero.hitBound, true);
  assert.equal(overlappingZero.ambiguousInternalChoice, false);
  assert.deepEqual(overlappingZero.state, effectFrontier);

  const one = closeFrontier(program, frontier, 1);
  assert.equal(one.hitBound, true);
  assert.equal(one.ambiguousInternalChoice, false);
  assert.deepEqual(one.state, frontier);
  assert.deepEqual(one.steps, []);
});

test("a footprint-approved pair rolls back when its second step disappears", () => {
  const candidates = enabledOperations(program, frontier);
  let invocation = 0;
  const closed = closeSupportedInternalOperations(
    frontier,
    2,
    () => invocation++ === 0 ? candidates : [],
    (state, enabled) =>
      internalOperationPairIsIndependent(program, state, enabled),
  );

  assert.equal(closed.ambiguousInternalChoice, true);
  assert.deepEqual(closed.state, frontier);
  assert.deepEqual(closed.steps, []);
});

test("Activity-variable scopes insert by complete effect occurrence", () => {
  const highScalar = {
    processInstanceId: "Instance",
    elementId: "ä-effect",
    activation: 1,
  };
  const highActivation = {
    processInstanceId: "Instance",
    elementId: "z-effect",
    activation: 10,
  };
  const lowActivation = { ...highActivation, activation: 2 };
  const variables = addActivityVariableScope(
    addActivityVariableScope(
      addActivityVariableScope(initialState.variables, highScalar, []),
      highActivation,
      [],
    ),
    lowActivation,
    [],
  );

  assert.deepEqual(
    variables.activities.map(({ owner: activityOwner }) => activityOwner),
    [lowActivation, highActivation, highScalar],
  );
});

test("paired transition and lifecycle publication stays canonical under Program permutation", () => {
  const canonical = applyStimulusWithTrace(
    parallelProgram,
    initialState,
    startStimulus(),
  );
  const reversed = applyStimulusWithTrace(
    {
      ...parallelProgram,
      operations: [...parallelProgram.operations].reverse(),
    },
    initialState,
    startStimulus(),
  );

  assert.deepEqual(reversed.committedTransitions, canonical.committedTransitions);
  assert.deepEqual(
    reversed.flowNodeOccurrenceLifecycles,
    canonical.flowNodeOccurrenceLifecycles,
  );
  canonical.committedTransitions.forEach((record, index) => {
    if (
      record.transition.kind === SemanticTransitionKind.InternalOperation &&
      record.transition.operationKind === SemanticOperationKind.AwaitUserTask
    ) {
      assert.equal(
        canonical.flowNodeOccurrenceLifecycles[index]?.started[0]?.elementId,
        record.transition.origin.elementId,
      );
    }
  });
});

function expectedArmingFootprint(
  candidate: AppliedInternalOperationStep,
  occurrenceKind: InternalOccurrenceKind,
  elementId: string,
  sequenceFlowId: string,
  readsLogicalTime: boolean,
): InternalTransitionFootprint {
  const selectedOwner = candidate.owner;
  if (selectedOwner === null || frontier.control.kind !== "running") {
    throw new TypeError("The exact arming oracle requires its running root owner");
  }
  const occurrence = {
    kind: occurrenceKind,
    id: {
      processInstanceId: selectedOwner.processInstanceId,
      elementId,
      activation: 1,
    },
  } as const;
  const activation = {
    kind: InternalTransitionStateAtomKind.Activation,
    occurrenceKind,
    elementId,
  } as const;
  let input: string;
  switch (candidate.operation.kind) {
    case SemanticOperationKind.AwaitUserTask:
    case SemanticOperationKind.AwaitMessage:
    case SemanticOperationKind.AwaitTimer:
    case SemanticOperationKind.AwaitEffect:
      input = candidate.operation.input;
      break;
    default:
      throw new TypeError("The exact arming oracle requires an ordinary wait operation");
  }
  const controlToken = {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner: selectedOwner,
    placeId: input,
  } as const;
  const wait = {
    kind: InternalTransitionStateAtomKind.Wait,
    occurrence,
    owner: selectedOwner,
  } as const;
  const openWaitAnchor = {
    kind: InternalTransitionStateAtomKind.OpenWaitAnchor,
    occurrence: occurrence.id,
    owner: selectedOwner,
  } as const;
  const reads = [
    activation,
    controlToken,
    ...(readsLogicalTime
      ? [{ kind: InternalTransitionStateAtomKind.LogicalTime } as const]
      : []),
    openWaitAnchor,
    {
      kind: InternalTransitionStateAtomKind.RuntimeControl,
      instanceId: frontier.control.instanceId,
    } as const,
    {
      kind: InternalTransitionStateAtomKind.ScopeOccurrence,
      owner: selectedOwner,
    } as const,
    wait,
  ];
  const positionDelta = {
    consumedTokens: [{
      sequenceFlowId,
      owner: selectedOwner,
      multiplicity: 1,
    }],
    producedTokens: [],
    enteredScopes: [],
    exitedScopes: [],
  } as const;
  return {
    reads,
    writes: [activation, controlToken, openWaitAnchor, wait],
    publications: [
      {
        kind: InternalTransitionPublicationAtomKind.CommittedTransition,
        operationId: candidate.operation.id,
        operationKind: candidate.operation.kind,
        origin: candidate.operation.origin,
        owner: selectedOwner,
        logicalTimeMs: 0,
        positionDelta,
      },
      {
        kind: InternalTransitionPublicationAtomKind.FlowNodeLifecycle,
        occurrence: occurrence.id,
      },
      {
        kind: InternalTransitionPublicationAtomKind.PublicationPair,
        operationId: candidate.operation.id,
        occurrence,
      },
    ],
    publicationSortKey: {
      operationId: candidate.operation.id,
      occurrenceKind,
      processInstanceId: selectedOwner.processInstanceId,
      elementId,
      activation: 1,
    },
  };
}

function crossFamilyTimerArm(operation: SemanticOperation): SemanticOperation {
  if (
    operation.kind !== SemanticOperationKind.AwaitUserTask ||
    operation.task.elementId !== "UserTask_B"
  ) {
    return operation;
  }
  const { task: _task, ...arm } = operation;
  return {
    ...arm,
    kind: SemanticOperationKind.AwaitTimer,
    origin: { ...operation.origin, elementId: "UserTask_A" },
    timer: { elementId: "UserTask_A", durationMs: 1000 },
  };
}
