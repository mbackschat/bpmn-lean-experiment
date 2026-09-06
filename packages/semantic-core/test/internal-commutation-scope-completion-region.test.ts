import assert from "node:assert/strict";
import { test } from "node:test";

import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";

import {
  CommandOutcome,
  SemanticOperationKind,
  StimulusKind,
  applyInternalOperationStep,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  InternalTransitionCandidate,
  InternalTransitionStateAtom,
  InternalTransitionStateFootprint,
} from "../src/internal-transition-footprint.ts";

import {
  boundedScopeProgram,
  completeChildTask,
  rootOccurrence,
  start,
} from "./bounded-scope-fixture.ts";

type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type ScopeCompletionPreparationModule =
  typeof import("../src/internal-transition-scope-completion-preparation.ts");

const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const preparationModule = await import(
  new URL(
    "../dist/internal-transition-scope-completion-preparation.js",
    import.meta.url,
  ).href
) as ScopeCompletionPreparationModule;

const {
  InternalOccurrenceKind,
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;
const { deriveInternalCompleteScopeStateFootprint } = preparationModule;

const armed = applyStimulus(boundedScopeProgram, initialState, start);
assert.equal(armed.outcome, CommandOutcome.Committed);
const boundedReady = admittedInternalPrefix(
  boundedScopeProgram,
  armed.state,
  completeChildTask,
  ["operation:ChildEnd"],
  ["operation:complete-scope:scope:Scope"],
);
const boundedOperation = completeOperation("scope:Scope");
const boundedParentOutput = boundedOperation.parentOutput;
if (boundedParentOutput === null) {
  throw new Error("the bounded child completion must have a parent output");
}
const boundedCandidate = applyInternalOperationStep(
  boundedScopeProgram,
  boundedOperation,
  boundedReady,
);
assert.ok(boundedCandidate !== null && boundedCandidate.owner !== null);

test("derives the exact child region, parent continuation, Activity, and deadline", () => {
  const footprint = requireScopeCompletionFootprint(
    boundedReady,
    boundedCandidate,
  );
  const child = boundedReady.scopeOccurrences.find(({ id }) =>
    id.definitionScopeId === boundedOperation.scopeId
  );
  const activity = boundedReady.activityOccurrences[0];
  const deadline = boundedReady.timerWaits[0];
  assert.ok(child !== undefined && activity !== undefined && deadline !== undefined);

  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.OccurrenceRegion), {
    kind: InternalTransitionStateAtomKind.OccurrenceRegion,
    region: { root: child.id, members: [child.id] },
  });
  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.ControlToken), {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner: rootOccurrence,
    placeId: boundedOperation.parentOutput,
  });
  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.ActivityAssociation), {
    kind: InternalTransitionStateAtomKind.ActivityAssociation,
    record: activity,
  });
  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.Wait), {
    kind: InternalTransitionStateAtomKind.Wait,
    occurrence: { kind: InternalOccurrenceKind.Timer, id: deadline.id },
    owner: deadline.owner,
  });
  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.OpenWaitAnchor), {
    kind: InternalTransitionStateAtomKind.OpenWaitAnchor,
    occurrence: deadline.id,
    owner: deadline.owner,
  });
});

test("the exact parent output conflicts while a different parent bucket composes", () => {
  const footprint = requireScopeCompletionFootprint(
    boundedReady,
    boundedCandidate,
  );
  assert.equal(
    independent(footprint, atomWrite({
      kind: InternalTransitionStateAtomKind.ControlToken,
      owner: rootOccurrence,
      placeId: boundedParentOutput,
    })),
    false,
  );
  assert.equal(
    independent(footprint, atomWrite({
      kind: InternalTransitionStateAtomKind.ControlToken,
      owner: rootOccurrence,
      placeId: "place:Independent_Parent_Output",
    })),
    true,
  );
});

test("child removal conflicts with its bounded Activity association and deadline", () => {
  const footprint = requireScopeCompletionFootprint(
    boundedReady,
    boundedCandidate,
  );
  const activity = boundedReady.activityOccurrences[0];
  const deadline = boundedReady.timerWaits[0];
  assert.ok(activity !== undefined && deadline !== undefined);
  assert.equal(
    independent(footprint, atomWrite({
      kind: InternalTransitionStateAtomKind.ActivityAssociation,
      record: activity,
    })),
    false,
  );
  assert.equal(
    independent(footprint, atomWrite({
      kind: InternalTransitionStateAtomKind.Wait,
      occurrence: { kind: InternalOccurrenceKind.Timer, id: deadline.id },
      owner: deadline.owner,
    })),
    false,
  );
});

test("preparation ignores the supplied successor and rejects malformed ownership", () => {
  const expected = requireScopeCompletionFootprint(
    boundedReady,
    boundedCandidate,
  );
  const poisoned = {
    ...boundedCandidate,
    successor: {
      ...boundedCandidate.successor,
      activityOccurrences: boundedReady.activityOccurrences,
      scopeOccurrences: [],
      timerWaits: boundedReady.timerWaits,
    },
  };
  assert.deepEqual(
    requireScopeCompletionFootprint(boundedReady, poisoned),
    expected,
  );
  assert.equal(
    deriveInternalCompleteScopeStateFootprint(
      boundedScopeProgram,
      boundedReady,
      { ...boundedCandidate, owner: rootOccurrence },
    ),
    null,
  );
  assert.equal(
    deriveInternalCompleteScopeStateFootprint(
      boundedScopeProgram,
      { ...boundedReady, timerWaits: [] },
      boundedCandidate,
    ),
    null,
  );
});

test("root completion writes runtime control and reads initiation state", () => {
  const afterChild = applyStimulus(
    boundedScopeProgram,
    armed.state,
    completeChildTask,
  );
  assert.equal(afterChild.outcome, CommandOutcome.Committed);
  const afterScopeTask = afterChild.state.userTaskWaits.find(({ id }) =>
    id.elementId === "AfterScope"
  );
  assert.ok(afterScopeTask !== undefined);
  const rootReady = admittedInternalPrefix(
    boundedScopeProgram,
    afterChild.state,
    {
      kind: StimulusKind.CompleteUserTaskInstance,
      commandId: "complete-after-scope-for-region",
      taskId: afterScopeTask.id,
      submittedValues: [],
    },
    ["operation:NormalEnd"],
    ["operation:complete-scope:scope:Process_SubProcessBoundaryTimer"],
  );
  const operation = completeOperation("scope:Process_SubProcessBoundaryTimer");
  const candidate = applyInternalOperationStep(
    boundedScopeProgram,
    operation,
    rootReady,
  );
  assert.ok(candidate !== null && candidate.owner !== null);
  const footprint = requireScopeCompletionFootprint(rootReady, candidate);

  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.RuntimeControl), {
    kind: InternalTransitionStateAtomKind.RuntimeControl,
    instanceId: rootOccurrence.processInstanceId,
  });
  assert.deepEqual(
    footprint.reads.find(({ kind }) =>
      kind === InternalTransitionStateAtomKind.InitiationPending
    ),
    { kind: InternalTransitionStateAtomKind.InitiationPending },
  );
  assert.equal(
    footprint.writes.some(({ kind }) =>
      kind === InternalTransitionStateAtomKind.ActivityAssociation
    ),
    false,
  );
});

function completeOperation(scopeId: string) {
  const operation = boundedScopeProgram.operations.find((candidate) =>
    candidate.kind === SemanticOperationKind.CompleteScope &&
    candidate.scopeId === scopeId
  );
  assert.ok(operation?.kind === SemanticOperationKind.CompleteScope);
  return operation;
}

function requireScopeCompletionFootprint(
  state: typeof boundedReady,
  candidate: InternalTransitionCandidate,
): InternalTransitionStateFootprint {
  const footprint = deriveInternalCompleteScopeStateFootprint(
    boundedScopeProgram,
    state,
    candidate,
  );
  assert.notEqual(footprint, null);
  return footprint!;
}

function findWrite(
  footprint: InternalTransitionStateFootprint,
  kind: InternalTransitionStateAtom["kind"],
): InternalTransitionStateAtom | undefined {
  return footprint.writes.find((atom) => atom.kind === kind);
}

function atomWrite(
  atom: InternalTransitionStateAtom,
): InternalTransitionStateFootprint {
  return { reads: [], writes: [atom] };
}

function independent(
  left: InternalTransitionStateFootprint,
  right: InternalTransitionStateFootprint,
): boolean {
  return internalTransitionStateFootprintsAreIndependent(left, right);
}
