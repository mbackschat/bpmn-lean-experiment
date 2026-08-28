import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  SemanticOperationKind,
  SemanticOriginKind,
  VariableValueKind,
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
  callActivityProgram,
  callActivityStart,
  expectedCalledInstanceId,
} from "./call-activity-fixture.ts";
import {
  items,
  reviewData,
  reviewProgram,
  start,
  startEmpty,
} from "./sequential-multi-instance-fixture.ts";
import { controlPlace } from "./semantic-program-parts.ts";

type PreparationModule =
  typeof import("../src/internal-transition-sequential-multi-instance-preparation.ts");
type RuntimeModule =
  typeof import("../src/semantic-process-sequential-multi-instance-runtime.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");

const preparationModule = await import(
  new URL(
    "../dist/internal-transition-sequential-multi-instance-preparation.js",
    import.meta.url,
  ).href
) as PreparationModule;
const runtimeModule = await import(
  new URL(
    "../dist/semantic-process-sequential-multi-instance-runtime.js",
    import.meta.url,
  ).href
) as RuntimeModule;
const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;

const {
  SequentialMultiInstanceEntryKind,
  deriveInternalSequentialMultiInstancePreparation,
} = preparationModule;
const { enterSequentialMultiInstanceUserTask } = runtimeModule;
const {
  InternalOccurrenceKind,
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;

const operation = requireSequentialOperation(reviewProgram);
const beforeEntry = beforeSequentialEntry(start);
const beforeEmptyEntry = beforeSequentialEntry(startEmpty);

test("prepares the complete controller, Activity, body, deadline, and snapshot", () => {
  const prepared = requirePrepared(
    deriveInternalSequentialMultiInstancePreparation(
      reviewProgram,
      beforeEntry,
      operation,
    ),
  );
  assert.equal(prepared.kind, SequentialMultiInstanceEntryKind.Armed);
  if (prepared.kind !== SequentialMultiInstanceEntryKind.Armed) {
    throw new Error("expected an armed Sequential Multi-Instance entry");
  }

  assert.deepEqual(prepared.controller.snapshot, [...items]);
  assert.deepEqual(prepared.controller.outputSlots, []);
  assert.deepEqual(prepared.controller.id, prepared.record.id);
  assert.deepEqual(prepared.record.body, {
    kind: "userTask",
    task: prepared.taskWait.id,
  });
  assert.deepEqual(prepared.record.attachedTimers, [prepared.timerWait.id]);
  assert.deepEqual(activationWrites(prepared.footprint), [
    { occurrenceKind: InternalOccurrenceKind.Activity, elementId: operation.task.elementId },
    { occurrenceKind: InternalOccurrenceKind.Timer, elementId: operation.boundaryTimer.elementId },
    { occurrenceKind: InternalOccurrenceKind.UserTask, elementId: operation.task.elementId },
  ]);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.SequentialController,
  ), 1);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.SequentialControllerSnapshot,
  ), items.length);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.SequentialControllerOutput,
  ), 0);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ActivityAssociation,
  ), 1);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.Wait,
  ), 2);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.OpenWaitAnchor,
  ), 2);
  assert.equal(readCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.SequentialControllersPresence,
  ), 1);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.SequentialControllersPresence,
  ), 0);
  assert.equal(readCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ProcessVariable,
  ), 1);

  const entered = enterSequentialMultiInstanceUserTask(
    operation,
    beforeEntry,
    prepared.owner,
  );
  assert.ok(entered !== null);
  assert.deepEqual(entered.activityOccurrences, [prepared.record]);
  assert.deepEqual(entered.userTaskWaits, [prepared.taskWait]);
  assert.deepEqual(entered.timerWaits, [prepared.timerWait]);
  assert.deepEqual(entered.sequentialMultiInstanceControllers, [prepared.controller]);
});

test("prepares zero items as one atomic data and control transition", () => {
  const prepared = requirePrepared(
    deriveInternalSequentialMultiInstancePreparation(
      reviewProgram,
      beforeEmptyEntry,
      operation,
    ),
  );
  assert.equal(prepared.kind, SequentialMultiInstanceEntryKind.Empty);
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
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.ActivityAssociation,
  ), 0);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.Wait,
  ), 0);
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.SequentialController,
  ), 0);
  assert.equal(readCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.LogicalTime,
  ), 0);

  const atMaximumLogicalTime = requirePrepared(
    deriveInternalSequentialMultiInstancePreparation(
      reviewProgram,
      { ...beforeEmptyEntry, logicalTimeMs: Number.MAX_SAFE_INTEGER },
      operation,
    ),
  );
  assert.equal(atMaximumLogicalTime.kind, SequentialMultiInstanceEntryKind.Empty);

  const completed = enterSequentialMultiInstanceUserTask(
    operation,
    beforeEmptyEntry,
    prepared.owner,
  );
  assert.ok(completed !== null);
  assert.deepEqual(completed.controlTokens, prepared.resultingTokens);
  assert.deepEqual(completed.variables.process.bindings, prepared.processBindings);
});

test("composes disjoint entries and conflicts on one empty-arm Process output", () => {
  const sibling = siblingOperation();
  const program = withSibling(reviewProgram, sibling);
  const state = withSiblingToken(beforeEntry, sibling);
  const first = requirePrepared(
    deriveInternalSequentialMultiInstancePreparation(program, state, operation),
  );
  const second = requirePrepared(
    deriveInternalSequentialMultiInstancePreparation(program, state, sibling),
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
  const collidingProgram = withSibling(reviewProgram, colliding);
  const emptyFirst = requirePrepared(
    deriveInternalSequentialMultiInstancePreparation(
      collidingProgram,
      emptyState,
      operation,
    ),
  );
  const emptySecond = requirePrepared(
    deriveInternalSequentialMultiInstancePreparation(
      collidingProgram,
      emptyState,
      colliding,
    ),
  );
  assert.equal(independent(emptyFirst.footprint, emptySecond.footprint), false);
});

test("refuses hidden ownership, occupied anchors, and exhausted counters", () => {
  const prepared = requirePrepared(
    deriveInternalSequentialMultiInstancePreparation(
      reviewProgram,
      beforeEntry,
      operation,
    ),
  );
  if (prepared.kind !== SequentialMultiInstanceEntryKind.Armed) {
    throw new Error("expected an armed Sequential Multi-Instance entry");
  }
  const malformedStates: ReadonlyArray<RuntimeState> = [
    { ...beforeEntry, activityOccurrences: [prepared.record] },
    { ...beforeEntry, sequentialMultiInstanceControllers: [prepared.controller] },
    {
      ...beforeEntry,
      messageWaits: [{
        id: prepared.taskWait.id,
        owner: prepared.owner,
        channel: { kind: "directMessage", messageId: "occupied" },
        output: "place:occupied",
      }],
    },
    { ...beforeEntry, logicalTimeMs: Number.MAX_SAFE_INTEGER },
  ];
  for (const malformed of malformedStates) {
    assert.equal(
      deriveInternalSequentialMultiInstancePreparation(
        reviewProgram,
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
      deriveInternalSequentialMultiInstancePreparation(
        reviewProgram,
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

test("owns the optional-controller representation change when it is absent", () => {
  const {
    sequentialMultiInstanceControllers: _controllers,
    ...withoutPresence
  } = beforeEntry;
  const prepared = requirePrepared(
    deriveInternalSequentialMultiInstancePreparation(
      reviewProgram,
      withoutPresence,
      operation,
    ),
  );
  assert.equal(writeCount(
    prepared.footprint,
    InternalTransitionStateAtomKind.SequentialControllersPresence,
  ), 1);
});

test("binds controller membership and slots to the containing occurrence region", () => {
  const prepared = requirePrepared(
    deriveInternalSequentialMultiInstancePreparation(
      reviewProgram,
      beforeEntry,
      operation,
    ),
  );
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
    definitionScopeId: "scope:DisjointSibling",
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

test("mints every called-owner identity in the called semantic instance", () => {
  const calledEntered = applyStimulus(
    callActivityProgram,
    initialState,
    callActivityStart(),
    2,
  );
  assert.equal(calledEntered.outcome, CommandOutcome.Committed);
  assert.equal(calledEntered.internalStepBoundExceeded, true);
  const calledOperation = calledSequentialOperation();
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
        }],
      },
    },
  };
  const prepared = requirePrepared(
    deriveInternalSequentialMultiInstancePreparation(
      program,
      state,
      calledOperation,
    ),
  );
  if (prepared.kind !== SequentialMultiInstanceEntryKind.Armed) {
    throw new Error("expected an armed called Sequential Multi-Instance entry");
  }
  assert.equal(prepared.owner.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.record.id.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.taskWait.id.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.timerWait.id.processInstanceId, expectedCalledInstanceId);
});

function beforeSequentialEntry(
  stimulus: Parameters<typeof applyStimulus>[2],
): RuntimeState {
  const result = applyStimulus(reviewProgram, initialState, stimulus, 1);
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, true);
  return result.state;
}

function siblingOperation(): Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.AwaitSequentialMultiInstanceUserTask }
> {
  return {
    ...operation,
    id: "operation:SecondReview",
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: "SecondReview",
    },
    input: "place:SecondReviewInput",
    task: { elementId: "SecondReview", name: "Second review" },
    data: {
      input: { ...operation.data.input },
      output: {
        ...operation.data.output,
        dataObjectReferenceId: "DataObjectReference_SecondOutput",
      },
    },
    normalOutput: "place:SecondReviewNormal",
    boundaryTimer: {
      ...operation.boundaryTimer,
      elementId: "SecondReviewTimer",
      output: "place:SecondReviewBoundary",
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "SecondReviewBoundaryFlow",
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

function calledSequentialOperation(): ReturnType<typeof siblingOperation> {
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
    task: { elementId: "CalledReview", name: "Called review" },
    normalOutput: "place:Called_End",
    boundaryTimer: {
      ...operation.boundaryTimer,
      elementId: "CalledReviewTimer",
      output: "place:Called_End",
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "CalledReviewBoundaryFlow",
      },
    },
  };
}

function requireSequentialOperation(
  program: SemanticProcessProgram,
): Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.AwaitSequentialMultiInstanceUserTask }
> {
  const found = program.operations.find((candidate) =>
    candidate.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
  );
  if (found?.kind !== SemanticOperationKind.AwaitSequentialMultiInstanceUserTask) {
    throw new Error("expected a Sequential Multi-Instance operation");
  }
  return found;
}

function requirePrepared<Prepared>(prepared: Prepared | null): Prepared {
  if (prepared === null) {
    throw new Error("expected a prepared Sequential Multi-Instance entry");
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
