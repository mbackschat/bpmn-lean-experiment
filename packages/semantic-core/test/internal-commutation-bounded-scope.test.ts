import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ActivityBodyKind,
  ActivityHandlerKind,
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
  boundedScopeProgram,
  childScopeId,
  rootScopeId,
  start,
} from "./bounded-scope-fixture.ts";
import {
  callActivityProgram,
  callActivityStart,
  calledScopeId,
  expectedCalledInstanceId,
} from "./call-activity-fixture.ts";
import { controlPlace } from "./semantic-program-parts.ts";

type BoundedScopePreparationModule =
  typeof import("../src/internal-transition-bounded-scope-preparation.ts");
type BoundedScopeRuntimeModule =
  typeof import("../src/semantic-process-bounded-scope-runtime.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");

const preparationModule = await import(
  new URL(
    "../dist/internal-transition-bounded-scope-preparation.js",
    import.meta.url,
  ).href
) as BoundedScopePreparationModule;
const boundedScopeRuntimeModule = await import(
  new URL("../dist/semantic-process-bounded-scope-runtime.js", import.meta.url).href
) as BoundedScopeRuntimeModule;
const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;

const { deriveInternalBoundedScopePreparation } = preparationModule;
const { armBoundedScope } = boundedScopeRuntimeModule;
const {
  InternalOccurrenceKind,
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;

const operation = requireBoundedScopeOperation(boundedScopeProgram);
const beforeBoundedScope = beforeArming();

test("prepares the child, parent relation, Activity, deadline, counters, and tokens", () => {
  const prepared = requirePrepared(deriveInternalBoundedScopePreparation(
    boundedScopeProgram,
    beforeBoundedScope,
    operation,
  ));

  assert.deepEqual(prepared.child, {
    id: {
      processInstanceId: prepared.parent.processInstanceId,
      definitionScopeId: childScopeId,
      activation: 1,
    },
    parent: prepared.parent,
  });
  assert.deepEqual(prepared.record, {
    id: {
      processInstanceId: prepared.parent.processInstanceId,
      activityElementId: operation.origin.elementId,
      activation: 1,
    },
    owner: prepared.parent,
    operationId: operation.id,
    body: {
      kind: ActivityBodyKind.ChildScope,
      scope: prepared.child.id,
    },
    attachedHandlers: [{
      kind: ActivityHandlerKind.Timer,
      occurrence: prepared.deadline.id,
    }],
  });
  assert.equal(prepared.deadline.owner, prepared.parent);
  assert.deepEqual(activationWrites(prepared.footprint), [
    { occurrenceKind: InternalOccurrenceKind.Activity, elementId: operation.origin.elementId },
    { occurrenceKind: InternalOccurrenceKind.Scope, elementId: operation.childScopeId },
    { occurrenceKind: InternalOccurrenceKind.Timer, elementId: operation.boundaryTimer.elementId },
  ]);
  assert.equal(writesOfKind(
    prepared.footprint,
    InternalTransitionStateAtomKind.ActivityAssociation,
  ).length, 1);
  assert.deepEqual(writesOfKind(
    prepared.footprint,
    InternalTransitionStateAtomKind.ScopeParent,
  ), [{
    kind: InternalTransitionStateAtomKind.ScopeParent,
    occurrence: prepared.child.id,
    parent: prepared.parent,
  }]);
  assert.equal(writesOfKind(
    prepared.footprint,
    InternalTransitionStateAtomKind.ControlToken,
  ).length, 2);
  assert.equal(writesOfKind(
    prepared.footprint,
    InternalTransitionStateAtomKind.Wait,
  ).length, 1);
  assert.equal(writesOfKind(
    prepared.footprint,
    InternalTransitionStateAtomKind.OpenWaitAnchor,
  ).length, 1);

  const armed = armBoundedScope(operation, beforeBoundedScope, prepared.parent);
  assert.ok(armed !== null);
  assert.deepEqual(armed.activityOccurrences, [prepared.record]);
  assert.deepEqual(
    armed.scopeOccurrences.find(({ id }) =>
      id.definitionScopeId === prepared.child.id.definitionScopeId
    ),
    prepared.child,
  );
  assert.deepEqual(armed.timerWaits, [prepared.deadline]);
});

test("composes disjoint sibling entries and conflicts on the same child definition", () => {
  const sibling = siblingOperation();
  const program = withSibling(boundedScopeProgram, sibling);
  const state: RuntimeState = {
    ...beforeBoundedScope,
    controlTokens: [
      ...beforeBoundedScope.controlTokens,
      {
        placeId: sibling.input,
        owner: beforeBoundedScope.scopeOccurrences[0]!.id,
        multiplicity: 1,
      },
    ],
  };
  const first = requirePrepared(deriveInternalBoundedScopePreparation(
    program,
    state,
    operation,
  ));
  const second = requirePrepared(deriveInternalBoundedScopePreparation(
    program,
    state,
    sibling,
  ));
  assert.equal(independent(first.footprint, second.footprint), true);

  const colliding = { ...sibling, childScopeId: operation.childScopeId };
  const collidingProgram = withSibling(boundedScopeProgram, colliding);
  const collision = requirePrepared(deriveInternalBoundedScopePreparation(
    collidingProgram,
    state,
    colliding,
  ));
  assert.equal(independent(first.footprint, collision.footprint), false);
});

test("refuses latent child state, hidden ownership, and an occupied deadline anchor", () => {
  const prepared = requirePrepared(deriveInternalBoundedScopePreparation(
    boundedScopeProgram,
    beforeBoundedScope,
    operation,
  ));
  const malformedStates: ReadonlyArray<RuntimeState> = [
    {
      ...beforeBoundedScope,
      scopeOccurrences: [...beforeBoundedScope.scopeOccurrences, prepared.child],
    },
    {
      ...beforeBoundedScope,
      controlTokens: [...beforeBoundedScope.controlTokens, {
        placeId: operation.childEntry,
        owner: prepared.child.id,
        multiplicity: 1,
      }],
    },
    {
      ...beforeBoundedScope,
      activityOccurrences: [prepared.record],
    },
    {
      ...beforeBoundedScope,
      userTaskWaits: [{
        id: prepared.deadline.id,
        owner: prepared.parent,
        name: "foreign deadline anchor",
        output: "place:foreign",
      }],
    },
  ];
  for (const malformed of malformedStates) {
    assert.equal(deriveInternalBoundedScopePreparation(
      boundedScopeProgram,
      malformed,
      operation,
    ), null);
  }
});

test("refuses each bounded-scope counter at the safe-integer boundary", () => {
  const counterFamilies = [
    ["activityActivations", operation.origin.elementId],
    ["scopeActivations", operation.childScopeId],
    ["timerActivations", operation.boundaryTimer.elementId],
  ] as const;
  for (const [family, elementId] of counterFamilies) {
    const unsafe: RuntimeState = {
      ...beforeBoundedScope,
      [family]: [{ elementId, count: Number.MAX_SAFE_INTEGER }],
    };
    assert.equal(deriveInternalBoundedScopePreparation(
      boundedScopeProgram,
      unsafe,
      operation,
    ), null, family);
  }
});

test("mints called-owner child, Activity, and deadline identities in the called instance", () => {
  const calledEntered = applyStimulus(
    callActivityProgram,
    initialState,
    callActivityStart(),
    2,
  );
  assert.equal(calledEntered.outcome, CommandOutcome.Committed);
  assert.equal(calledEntered.internalStepBoundExceeded, true);
  const calledOperation = calledBoundedScopeOperation();
  const calledChildScopeId = calledOperation.childScopeId;
  const program: SemanticProcessProgram = {
    ...callActivityProgram,
    definitionScopes: [
      ...callActivityProgram.definitionScopes,
      {
        id: calledChildScopeId,
        parentScopeId: calledScopeId,
        originElementId: calledOperation.origin.elementId,
      },
    ],
    controlPlaceScopes: [
      ...callActivityProgram.controlPlaceScopes,
      {
        controlPlaceId: calledOperation.childEntry,
        scopeId: calledChildScopeId,
      },
    ],
    controlPlaces: [
      ...callActivityProgram.controlPlaces,
      controlPlace(calledOperation.childEntry.slice("place:".length)),
    ],
    operations: callActivityProgram.operations.map((candidate) =>
      candidate.id === calledOperation.id ? calledOperation : candidate
    ),
  };
  const prepared = requirePrepared(deriveInternalBoundedScopePreparation(
    program,
    calledEntered.state,
    calledOperation,
  ));

  assert.equal(prepared.parent.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.child.id.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.record.id.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.deadline.id.processInstanceId, expectedCalledInstanceId);
  assert.equal(prepared.deadline.owner.processInstanceId, expectedCalledInstanceId);
});

function beforeArming(): RuntimeState {
  const result = applyStimulus(
    boundedScopeProgram,
    initialState,
    start,
    1,
  );
  assert.equal(result.outcome, CommandOutcome.Committed);
  assert.equal(result.internalStepBoundExceeded, true);
  return result.state;
}

function siblingOperation(): Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.EnterBoundedScope }
> {
  return {
    id: "operation:SecondScope",
    kind: SemanticOperationKind.EnterBoundedScope,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: "SecondScope",
    },
    input: "place:Second_Input",
    childEntry: "place:Second_Entry",
    childScopeId: "scope:SecondScope",
    boundaryTimer: {
      elementId: "SecondDeadline",
      durationMs: 1000,
      output: "place:Flow_Boundary",
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "SecondBoundaryFlow",
      },
    },
  };
}

function withSibling(
  program: SemanticProcessProgram,
  sibling: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.EnterBoundedScope }
  >,
): SemanticProcessProgram {
  return {
    ...program,
    definitionScopes: [
      ...program.definitionScopes,
      {
        id: "scope:SecondScope",
        parentScopeId: rootScopeId,
        originElementId: sibling.origin.elementId,
      },
    ],
    operationScopes: [
      ...program.operationScopes,
      { operationId: sibling.id, scopeId: rootScopeId },
    ],
    controlPlaceScopes: [
      ...program.controlPlaceScopes,
      { controlPlaceId: sibling.input, scopeId: rootScopeId },
      { controlPlaceId: sibling.childEntry, scopeId: "scope:SecondScope" },
    ],
    controlPlaces: [
      ...program.controlPlaces,
      controlPlace(sibling.input.slice("place:".length)),
      controlPlace(sibling.childEntry.slice("place:".length)),
    ],
    operations: [...program.operations, sibling],
  };
}

function calledBoundedScopeOperation(): Extract<
  SemanticOperation,
  { kind: SemanticOperationKind.EnterBoundedScope }
> {
  return {
    id: "operation:Task_Called",
    kind: SemanticOperationKind.EnterBoundedScope,
    origin: {
      kind: SemanticOriginKind.BpmnElement,
      elementId: "CalledBoundedScope",
    },
    input: "place:Called_Start",
    childEntry: "place:Called_Bounded_Entry",
    childScopeId: "scope:Called_Bounded",
    boundaryTimer: {
      elementId: "CalledScopeDeadline",
      durationMs: 1000,
      output: "place:Called_End",
      origin: {
        kind: SemanticOriginKind.BpmnSequenceFlow,
        elementId: "CalledScopeBoundaryFlow",
      },
    },
  };
}

function requireBoundedScopeOperation(
  program: SemanticProcessProgram,
): Extract<SemanticOperation, { kind: SemanticOperationKind.EnterBoundedScope }> {
  const found = program.operations.find((candidate) =>
    candidate.kind === SemanticOperationKind.EnterBoundedScope
  );
  if (found?.kind !== SemanticOperationKind.EnterBoundedScope) {
    throw new Error("expected a bounded-scope operation");
  }
  return found;
}

function requirePrepared<Prepared>(prepared: Prepared | null): Prepared {
  if (prepared === null) {
    throw new Error("expected a prepared bounded-scope transition");
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
