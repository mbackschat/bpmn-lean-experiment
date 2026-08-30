import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  SemanticOperationKind,
  SemanticOriginKind,
  VariableValueKind,
  applyStimulus,
  attachedTimerOccurrences,
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
  callActivityProgram,
  callActivityStart,
  expectedCalledInstanceId,
} from "./call-activity-fixture.ts";
import {
  parallelProgram,
  parallelStart,
  startWithParallelItems,
} from "./parallel-multi-instance-fixture.ts";
import { controlPlace } from "./semantic-program-parts.ts";

type PreparationModule =
  typeof import("../src/internal-transition-parallel-multi-instance-preparation.ts");
type RuntimeModule =
  typeof import("../src/semantic-process-parallel-multi-instance-runtime.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");

const preparationModule = await import(
  new URL(
    "../dist/internal-transition-parallel-multi-instance-preparation.js",
    import.meta.url,
  ).href
) as PreparationModule;
const runtimeModule = await import(
  new URL(
    "../dist/semantic-process-parallel-multi-instance-runtime.js",
    import.meta.url,
  ).href
) as RuntimeModule;
const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;

const {
  ParallelMultiInstanceEntryKind,
  deriveInternalParallelMultiInstancePreparation,
} = preparationModule;
const { enterParallelMultiInstanceUserTask } = runtimeModule;
const {
  InternalOccurrenceKind,
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;

const operation = requireParallelOperation(parallelProgram);
const beforeEntry = beforeParallelEntry(parallelProgram, parallelStart);
const beforeEmptyEntry = beforeParallelEntry(
  parallelProgram,
  startWithParallelItems("start-empty-preparation", [], "all"),
);

test("prepares the complete parallel controller, children, deadline, and snapshot", () => {
  const prepared = requirePrepared(
    deriveInternalParallelMultiInstancePreparation(
      parallelProgram,
      beforeEntry,
      operation,
    ),
  );
  assert.equal(prepared.kind, ParallelMultiInstanceEntryKind.Armed);
  if (prepared.kind !== ParallelMultiInstanceEntryKind.Armed) {
    throw new Error("expected an armed Parallel Multi-Instance entry");
  }

  assert.deepEqual(prepared.controller.id, prepared.record.id);
  assert.deepEqual(prepared.controller.snapshot, ["alpha", "beta", "gamma"]);
  assert.equal(prepared.controller.slots.length, 3);
  assert.deepEqual(prepared.record.body, {
    kind: "parallelUserTasks",
    tasks: prepared.taskWaits.map(({ id }) => id),
  });
  assert.deepEqual(attachedTimerOccurrences(prepared.record), [prepared.timerWait.id]);
  assert.deepEqual(activationWrites(prepared.footprint), [
    { occurrenceKind: InternalOccurrenceKind.Activity, elementId: operation.task.elementId },
    { occurrenceKind: InternalOccurrenceKind.Timer, elementId: operation.boundaryTimer.elementId },
    { occurrenceKind: InternalOccurrenceKind.UserTask, elementId: operation.task.elementId },
  ]);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ParallelController,
  ), 1);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ParallelControllerSnapshot,
  ), 3);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ParallelControllerSlot,
  ), 3);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ActivityAssociation,
  ), 1);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.Wait,
  ), 4);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.OpenWaitAnchor,
  ), 4);
  assert.equal(readCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ParallelControllersPresence,
  ), 1);

  const entered = enterParallelMultiInstanceUserTask(
    operation,
    beforeEntry,
    prepared.owner,
  );
  assert.ok(entered !== null);
  assert.deepEqual(entered.activityOccurrences, [prepared.record]);
  assert.deepEqual(entered.userTaskWaits, prepared.taskWaits);
  assert.deepEqual(entered.timerWaits, [prepared.timerWait]);
  assert.deepEqual(entered.parallelMultiInstanceControllers, [prepared.controller]);
});

test("prepares zero items without a controller, deadline, or logical-time dependency", () => {
  const prepared = requirePrepared(
    deriveInternalParallelMultiInstancePreparation(
      parallelProgram,
      { ...beforeEmptyEntry, logicalTimeMs: Number.MAX_SAFE_INTEGER },
      operation,
    ),
  );
  assert.equal(prepared.kind, ParallelMultiInstanceEntryKind.Empty);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ControlToken,
  ), 2);
  assert.equal(readCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ProcessVariable,
  ), 2);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ProcessVariable,
  ), 1);
  assert.equal(readCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.LogicalTime,
  ), 0);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ParallelController,
  ), 0);
});

test("composes disjoint entries and conflicts on one empty-arm Process output", () => {
  const sibling = siblingOperation();
  const program = withSibling(parallelProgram, sibling);
  const state = withSiblingToken(beforeEntry, sibling);
  const first = requirePrepared(
    deriveInternalParallelMultiInstancePreparation(program, state, operation),
  );
  const second = requirePrepared(
    deriveInternalParallelMultiInstancePreparation(program, state, sibling),
  );
  assert.equal(independent(first.footprint, second.footprint), true);

  const emptyState = withSiblingToken(beforeEmptyEntry, sibling);
  const colliding = {
    ...sibling,
    data: {
      ...sibling.data,
      output: {
        ...sibling.data.output,
        dataObjectReferenceId: operation.data.output.dataObjectReferenceId,
      },
    },
  };
  const collidingProgram = withSibling(parallelProgram, colliding);
  const emptyFirst = requirePrepared(
    deriveInternalParallelMultiInstancePreparation(
      collidingProgram,
      emptyState,
      operation,
    ),
  );
  const emptySecond = requirePrepared(
    deriveInternalParallelMultiInstancePreparation(
      collidingProgram,
      emptyState,
      colliding,
    ),
  );
  assert.equal(independent(emptyFirst.footprint, emptySecond.footprint), false);
});

test("refuses hidden ownership, occupied anchors, and every exhausted counter", () => {
  const prepared = requirePrepared(
    deriveInternalParallelMultiInstancePreparation(
      parallelProgram,
      beforeEntry,
      operation,
    ),
  );
  if (prepared.kind !== ParallelMultiInstanceEntryKind.Armed) {
    throw new Error("expected an armed Parallel Multi-Instance entry");
  }
  const malformedStates: ReadonlyArray<RuntimeState> = [
    { ...beforeEntry, activityOccurrences: [prepared.record] },
    { ...beforeEntry, parallelMultiInstanceControllers: [prepared.controller] },
    {
      ...beforeEntry,
      messageWaits: [{
        id: prepared.taskWaits[0]!.id,
        owner: prepared.owner,
        channel: { kind: "directMessage", messageId: "occupied" },
        output: "place:occupied",
      }],
    },
    { ...beforeEntry, logicalTimeMs: Number.MAX_SAFE_INTEGER },
  ];
  for (const malformed of malformedStates) {
    assert.equal(
      deriveInternalParallelMultiInstancePreparation(
        parallelProgram,
        malformed,
        operation,
      ),
      null,
    );
  }

  for (const [family, elementId] of [
    ["activityActivations", operation.task.elementId],
    ["taskActivations", operation.task.elementId],
    ["timerActivations", operation.boundaryTimer.elementId],
  ] as const) {
    assert.equal(
      deriveInternalParallelMultiInstancePreparation(
        parallelProgram,
        {
          ...beforeEntry,
          [family]: [{ elementId, count: Number.MAX_SAFE_INTEGER }],
        },
        operation,
      ),
      null,
      family,
    );
  }
});

test("owns optional-controller representation change and containing-region conflicts", () => {
  const {
    parallelMultiInstanceControllers: _controllers,
    ...withoutPresence
  } = beforeEntry;
  const prepared = requirePrepared(
    deriveInternalParallelMultiInstancePreparation(
      parallelProgram,
      withoutPresence,
      operation,
    ),
  );
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ParallelControllersPresence,
  ), 1);

  const region: InternalTransitionStateFootprint = {
    reads: [],
    writes: [{
      kind: InternalTransitionStateAtomKind.OccurrenceRegion,
      region: { root: prepared.owner, members: [prepared.owner] },
    }],
  };
  assert.equal(independent(prepared.footprint, region), false);

  const siblingOwner = {
    ...prepared.owner,
    definitionScopeId: "scope:DisjointParallelSibling",
  };
  const siblingRegion: InternalTransitionStateFootprint = {
    reads: [],
    writes: [{
      kind: InternalTransitionStateAtomKind.OccurrenceRegion,
      region: { root: siblingOwner, members: [siblingOwner] },
    }],
  };
  assert.equal(independent(prepared.footprint, siblingRegion), true);
});

test("indexes parallel controller arrays without conflating slots and snapshots", () => {
  const prepared = requirePrepared(
    deriveInternalParallelMultiInstancePreparation(
      parallelProgram,
      beforeEntry,
      operation,
    ),
  );
  if (prepared.kind !== ParallelMultiInstanceEntryKind.Armed) {
    throw new Error("expected an armed Parallel Multi-Instance entry");
  }
  const membership = atomFootprint({
    kind: InternalTransitionStateAtomKind.ParallelController,
    id: prepared.controller.id,
    owner: prepared.owner,
  });
  const firstSlot = atomFootprint({
    kind: InternalTransitionStateAtomKind.ParallelControllerSlot,
    id: prepared.controller.id,
    owner: prepared.owner,
    index: 0,
  });
  const secondSlot = atomFootprint({
    kind: InternalTransitionStateAtomKind.ParallelControllerSlot,
    id: prepared.controller.id,
    owner: prepared.owner,
    index: 1,
  });
  const firstSnapshot = atomFootprint({
    kind: InternalTransitionStateAtomKind.ParallelControllerSnapshot,
    id: prepared.controller.id,
    owner: prepared.owner,
    index: 0,
  });

  assert.equal(independent(membership, firstSlot), false);
  assert.equal(independent(firstSlot, secondSlot), true);
  assert.equal(independent(firstSlot, firstSnapshot), true);
});

test("mints every called-owner identity in the called semantic instance", () => {
  const calledEntered = applyStimulus(
    callActivityProgram,
    initialState,
    callActivityStart(),
    2,
  );
  assert.equal(calledEntered.outcome, CommandOutcome.Committed);
  assert.equal(calledEntered.internalStepBoundExceeded, true);
  const calledOperation = calledParallelOperation();
  const program: SemanticProcessProgram = {
    ...callActivityProgram,
    operations: callActivityProgram.operations.map((candidate) =>
      candidate.id === calledOperation.id ? calledOperation : candidate
    ),
  };
  const state: RuntimeState = {
    ...calledEntered.state,
    variables: {
      ...calledEntered.state.variables,
      process: {
        bindings: [{
          name: calledOperation.data.input.dataObjectReferenceId,
          value: { kind: VariableValueKind.StringList, value: ["called"] },
        }, {
          name: "completionPolicy",
          value: { kind: VariableValueKind.String, value: "all" },
        }],
      },
    },
  };
  const prepared = requirePrepared(
    deriveInternalParallelMultiInstancePreparation(
      program,
      state,
      calledOperation,
    ),
  );
  if (prepared.kind !== ParallelMultiInstanceEntryKind.Armed) {
    throw new Error("expected an armed called Parallel Multi-Instance entry");
  }
  assert.equal(prepared.owner.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.record.id.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.taskWaits[0]?.id.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.timerWait.id.processInstanceId, expectedCalledInstanceId);
});

function beforeParallelEntry(
  program: SemanticProcessProgram,
  stimulus: Parameters<typeof applyStimulus>[2],
): RuntimeState {
  const result = applyStimulus(program, initialState, stimulus, 1);
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, true);
  return result.state;
}

function siblingOperation(): Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.AwaitParallelMultiInstanceUserTask }
> {
  return {
    ...operation,
    id: "operation:SecondParallelReview",
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: "SecondParallelReview",
    },
    input: "place:SecondParallelReviewInput",
    task: { elementId: "SecondParallelReview", name: "Second parallel review" },
    data: {
      input: { ...operation.data.input },
      output: {
        ...operation.data.output,
        dataObjectReferenceId: "DataObjectReference_SecondParallelOutput",
      },
    },
    normalOutput: "place:SecondParallelReviewNormal",
    boundaryTimer: {
      ...operation.boundaryTimer,
      elementId: "SecondParallelReviewTimer",
      output: "place:SecondParallelReviewBoundary",
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "SecondParallelReviewBoundaryFlow",
      },
    },
  };
}

function withSibling(
  program: SemanticProcessProgram,
  sibling: ReturnType<typeof siblingOperation>,
): SemanticProcessProgram {
  const rootScopeId = program.definitionScopes.find(({ parentScopeId }) =>
    parentScopeId === null
  )?.id;
  if (rootScopeId === undefined) {
    throw new Error("expected a root scope");
  }
  const addedPlaces = [
    sibling.input,
    sibling.normalOutput,
    sibling.boundaryTimer.output,
  ];
  return {
    ...program,
    operations: [...program.operations, sibling],
    operationScopes: [
      ...program.operationScopes,
      { operationId: sibling.id, scopeId: rootScopeId },
    ],
    controlPlaces: [
      ...program.controlPlaces,
      ...addedPlaces.map((placeId) => controlPlace(placeId.slice("place:".length))),
    ],
    controlPlaceScopes: [
      ...program.controlPlaceScopes,
      ...addedPlaces.map((controlPlaceId) => ({ controlPlaceId, scopeId: rootScopeId })),
    ],
  };
}

function withSiblingToken(
  state: RuntimeState,
  sibling: ReturnType<typeof siblingOperation>,
): RuntimeState {
  const owner = state.scopeOccurrences[0]?.id;
  if (owner === undefined) {
    throw new Error("expected the root occurrence");
  }
  return {
    ...state,
    controlTokens: [
      ...state.controlTokens,
      { placeId: sibling.input, owner, multiplicity: 1 },
    ],
  };
}

function calledParallelOperation(): ReturnType<typeof siblingOperation> {
  const calledTask = callActivityProgram.operations.find(({ origin }) =>
    origin.elementId === "Task_Called"
  );
  if (calledTask === undefined) {
    throw new Error("expected the called task operation");
  }
  return {
    ...operation,
    id: calledTask.id,
    origin: calledTask.origin,
    input: "place:Called_Start",
    task: { elementId: "CalledParallelReview", name: "Called parallel review" },
    normalOutput: "place:Called_End",
    boundaryTimer: {
      ...operation.boundaryTimer,
      elementId: "CalledParallelReviewTimer",
      output: "place:Called_End",
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "CalledParallelReviewBoundaryFlow",
      },
    },
  };
}

function requireParallelOperation(
  program: SemanticProcessProgram,
): Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.AwaitParallelMultiInstanceUserTask }
> {
  const found = program.operations.find((candidate) =>
    candidate.kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask
  );
  if (found?.kind !== SemanticOperationKind.AwaitParallelMultiInstanceUserTask) {
    throw new Error("expected a Parallel Multi-Instance operation");
  }
  return found;
}

function requirePrepared<Prepared>(prepared: Prepared | null): Prepared {
  if (prepared === null) {
    throw new Error("expected a prepared Parallel Multi-Instance entry");
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

function readCount(
  footprint: InternalTransitionStateFootprint,
  kind: InternalTransitionStateAtom["kind"],
): number {
  return footprint.reads.filter((atom) => atom.kind === kind).length;
}

function writeCount(
  footprint: InternalTransitionStateFootprint,
  kind: InternalTransitionStateAtom["kind"],
): number {
  return footprint.writes.filter((atom) => atom.kind === kind).length;
}

function independent(
  left: InternalTransitionStateFootprint,
  right: InternalTransitionStateFootprint,
): boolean {
  return internalTransitionStateFootprintsAreIndependent(left, right);
}

function atomFootprint(
  atom: InternalTransitionStateAtom,
): InternalTransitionStateFootprint {
  return { reads: [], writes: [atom] };
}
