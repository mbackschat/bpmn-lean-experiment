import assert from "node:assert/strict";
import { test } from "node:test";

import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";

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
  terminateCompletion,
  terminateProgram,
  terminateRootScopeId,
  terminateStartStimulus,
} from "./terminate-end-event-fixture.ts";

type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type TerminationPreparationModule =
  typeof import("../src/internal-transition-termination-preparation.ts");

const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const preparationModule = await import(
  new URL(
    "../dist/internal-transition-termination-preparation.js",
    import.meta.url,
  ).href
) as TerminationPreparationModule;

const {
  InternalOccurrenceKind,
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;
const { deriveInternalTerminateScopeStateFootprint } = preparationModule;

const started = applyStimulus(
  terminateProgram,
  initialState,
  terminateStartStimulus(),
);
assert.equal(started.outcome, CommandOutcome.Committed);
const ready = admittedInternalPrefix(
  terminateProgram,
  started.state,
  terminateCompletion("UserTask_Trigger"),
  [],
  ["operation:EndEvent_Terminate"],
);
const operation = terminateProgram.operations.find(({ kind }) =>
  kind === SemanticOperationKind.TerminateScope
);
assert.ok(operation?.kind === SemanticOperationKind.TerminateScope);
const candidate = applyInternalOperationStep(
  terminateProgram,
  operation,
  ready,
);
assert.ok(candidate !== null && candidate.owner !== null);

test("derives the retained-root termination region, input, and End increment", () => {
  const footprint = requireTerminationFootprint(candidate);
  const child = ready.scopeOccurrences.find(({ id }) =>
    id.definitionScopeId === operation.scopeId
  );
  assert.ok(child !== undefined && child.parent !== null);
  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.OccurrenceRegion), {
    kind: InternalTransitionStateAtomKind.OccurrenceRegion,
    region: { root: child.id, members: [child.id] },
  });
  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.ControlToken), {
    kind: InternalTransitionStateAtomKind.ControlToken,
    owner: child.id,
    placeId: operation.input,
  });
  assert.deepEqual(findWrite(footprint, InternalTransitionStateAtomKind.EndIncrement), {
    kind: InternalTransitionStateAtomKind.EndIncrement,
  });
  assert.deepEqual(
    footprint.reads.find(({ kind }) =>
      kind === InternalTransitionStateAtomKind.ScopeParent
    ),
    {
      kind: InternalTransitionStateAtomKind.ScopeParent,
      occurrence: child.id,
      parent: child.parent,
    },
  );
});

test("termination conflicts with live work in its region but not parent work", () => {
  const footprint = requireTerminationFootprint(candidate);
  const sibling = ready.userTaskWaits.find(({ id }) =>
    id.elementId === "UserTask_Sibling"
  );
  const root = ready.scopeOccurrences.find(({ id }) =>
    id.definitionScopeId === terminateRootScopeId
  );
  assert.ok(sibling !== undefined && root !== undefined);
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
});

test("relative End increments commute while an absolute End-count read conflicts", () => {
  const increment: InternalTransitionStateFootprint = {
    reads: [{ kind: InternalTransitionStateAtomKind.EndIncrement }],
    writes: [{ kind: InternalTransitionStateAtomKind.EndIncrement }],
  };
  assert.equal(independent(increment, increment), true);
  assert.equal(
    independent(increment, {
      reads: [{ kind: InternalTransitionStateAtomKind.EndCount }],
      writes: [],
    }),
    false,
  );
});

test("preparation ignores the supplied successor and rejects another owner", () => {
  const expected = requireTerminationFootprint(candidate);
  const poisoned = {
    ...candidate,
    successor: {
      ...candidate.successor,
      endOccurrences: 999,
      scopeOccurrences: [],
      userTaskWaits: ready.userTaskWaits,
    },
  };
  assert.deepEqual(requireTerminationFootprint(poisoned), expected);
  const root = ready.scopeOccurrences.find(({ id }) =>
    id.definitionScopeId === terminateRootScopeId
  );
  assert.ok(root !== undefined);
  assert.equal(
    deriveInternalTerminateScopeStateFootprint(
      terminateProgram,
      ready,
      { ...candidate, owner: root.id },
    ),
    null,
  );
});

function requireTerminationFootprint(
  selected: InternalTransitionCandidate,
): InternalTransitionStateFootprint {
  const footprint = deriveInternalTerminateScopeStateFootprint(
    terminateProgram,
    ready,
    selected,
  );
  if (footprint === null) {
    throw new Error("expected a Terminate End internal state footprint");
  }
  return footprint;
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
