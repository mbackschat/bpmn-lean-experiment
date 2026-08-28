import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  SemanticOperationKind,
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
  propagatedErrorProgram,
  startFor,
} from "./flow-node-occurrence-lifecycle-fixture.ts";
import {
  terminateChildScopeId,
  terminateCompletion,
  terminateInstanceId,
  terminateRootScopeId,
} from "./terminate-end-event-fixture.ts";

type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type ErrorPreparationModule =
  typeof import("../src/internal-transition-error-preparation.ts");

const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const preparationModule = await import(
  new URL(
    "../dist/internal-transition-error-preparation.js",
    import.meta.url,
  ).href
) as ErrorPreparationModule;

const {
  InternalOccurrenceKind,
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;
const { deriveInternalThrowErrorStateFootprint } = preparationModule;

const started = applyStimulus(
  propagatedErrorProgram,
  initialState,
  startFor(propagatedErrorProgram, terminateInstanceId),
);
assert.equal(started.outcome, CommandOutcome.Committed);
const ready = applyStimulus(
  propagatedErrorProgram,
  started.state,
  terminateCompletion("UserTask_Trigger"),
  0,
);
assert.equal(ready.outcome, CommandOutcome.Committed);
assert.equal(ready.internalStepBoundExceeded, true);
const operation = propagatedErrorProgram.operations.find(({ kind }) =>
  kind === SemanticOperationKind.ThrowError
);
assert.ok(operation?.kind === SemanticOperationKind.ThrowError);
const candidate = applyInternalOperationStep(
  propagatedErrorProgram,
  operation,
  ready.state,
);
assert.ok(candidate !== null && candidate.owner !== null);

test("derives the exact interrupted region, throwing token, and parent output", () => {
  const footprint = requireErrorFootprint(candidate);
  const child = scopeOccurrence(terminateChildScopeId);
  const root = scopeOccurrence(terminateRootScopeId);

  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.OccurrenceRegion), {
    kind: InternalTransitionStateAtomKind.OccurrenceRegion,
    region: { root: child.id, members: [child.id] },
  });
  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.ControlToken, operation.input), {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner: child.id,
    placeId: operation.input,
  });
  assert.deepEqual(
    findWrite(
      footprint,
      InternalTransitionStateAtomKind.ControlToken,
      operation.handler.output,
    ),
    {
      kind: InternalTransitionStateAtomKind.ControlToken,
      owner: root.id,
      placeId: operation.handler.output,
    },
  );
  assert.deepEqual(
    footprint.reads.find(({ kind }) =>
      kind === InternalTransitionStateAtomKind.ScopeParent
    ),
    {
      kind: InternalTransitionStateAtomKind.ScopeParent,
      occurrence: child.id,
      parent: root.id,
    },
  );
});

test("Error interruption conflicts with child work but not unrelated parent work", () => {
  const footprint = requireErrorFootprint(candidate);
  const sibling = ready.state.userTaskWaits.find(({ id }) =>
    id.elementId === "UserTask_Sibling"
  );
  const root = scopeOccurrence(terminateRootScopeId);
  assert.ok(sibling !== undefined);

  assert.equal(
    independent(footprint, atomWrite({
      kind: InternalTransitionStateAtomKind.Wait,
      occurrence: { kind: InternalOccurrenceKind.UserTask, id: sibling.id },
      owner: sibling.owner,
    })),
    false,
  );
  assert.equal(
    independent(footprint, atomWrite({
      kind: InternalTransitionStateAtomKind.ControlToken,
      owner: root.id,
      placeId: "place:Independent_Parent_Work",
    })),
    true,
  );
  assert.equal(
    independent(footprint, atomWrite({
      kind: InternalTransitionStateAtomKind.ControlToken,
      owner: root.id,
      placeId: operation.handler.output,
    })),
    false,
  );
});

test("preparation ignores the supplied successor and rejects inexact ownership", () => {
  const expected = requireErrorFootprint(candidate);
  const poisoned = {
    ...candidate,
    successor: {
      ...candidate.successor,
      controlTokens: ready.state.controlTokens,
      scopeOccurrences: ready.state.scopeOccurrences,
      userTaskWaits: [],
    },
  };
  assert.deepEqual(requireErrorFootprint(poisoned), expected);

  const root = scopeOccurrence(terminateRootScopeId);
  assert.equal(
    deriveInternalThrowErrorStateFootprint(
      propagatedErrorProgram,
      ready.state,
      { ...candidate, owner: root.id },
    ),
    null,
  );
  assert.equal(
    deriveInternalThrowErrorStateFootprint(
      propagatedErrorProgram,
      {
        ...ready.state,
        scopeOccurrences: [...ready.state.scopeOccurrences, scopeOccurrence(terminateChildScopeId)],
      },
      candidate,
    ),
    null,
  );
});

function requireErrorFootprint(
  selected: InternalTransitionCandidate,
): InternalTransitionStateFootprint {
  const footprint = deriveInternalThrowErrorStateFootprint(
    propagatedErrorProgram,
    ready.state,
    selected,
  );
  if (footprint === null) {
    throw new Error("expected a Throw Error internal state footprint");
  }
  return footprint;
}

function scopeOccurrence(definitionScopeId: string) {
  const occurrence = ready.state.scopeOccurrences.find(({ id }) =>
    id.definitionScopeId === definitionScopeId
  );
  if (occurrence === undefined) {
    throw new Error(`missing scope occurrence ${definitionScopeId}`);
  }
  return occurrence;
}

function findWrite(
  footprint: InternalTransitionStateFootprint,
  kind: InternalTransitionStateAtom["kind"],
  placeId?: string,
): InternalTransitionStateAtom | undefined {
  return footprint.writes.find((atom) =>
    atom.kind === kind &&
    (placeId === undefined ||
      (atom.kind === InternalTransitionStateAtomKind.ControlToken &&
        atom.placeId === placeId))
  );
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
