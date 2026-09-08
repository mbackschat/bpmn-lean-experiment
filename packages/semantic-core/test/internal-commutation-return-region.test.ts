import assert from "node:assert/strict";
import { test } from "node:test";

import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";

import {
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
  callActivityCompletion,
  callActivityProgram,
  callActivityStart,
  expectedCalledInstanceId,
} from "./call-activity-fixture.ts";

type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type ReturnPreparationModule =
  typeof import("../src/internal-transition-return-preparation.ts");

const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const returnPreparationModule = await import(
  new URL(
    "../dist/internal-transition-return-preparation.js",
    import.meta.url,
  ).href
) as ReturnPreparationModule;

const {
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;
const { deriveInternalReturnProcessStateFootprint } = returnPreparationModule;

const started = applyStimulus(
  callActivityProgram,
  initialState,
  callActivityStart(),
  3,
);
const returnReady = admittedInternalPrefix(
  callActivityProgram,
  started.state,
  callActivityCompletion(
    expectedCalledInstanceId,
    "Task_Called",
    "prepare-return",
  ),
  ["operation:End_Called"],
  ["operation:return-process:Call:é"],
);
const returnOperation = callActivityProgram.operations.find(({ kind }) =>
  kind === SemanticOperationKind.ReturnProcess
);
assert.ok(returnOperation?.kind === SemanticOperationKind.ReturnProcess);
const returnCandidate = applyInternalOperationStep(
  callActivityProgram,
  returnOperation,
  returnReady,
);
assert.ok(returnCandidate !== null && returnCandidate.owner !== null);

test("derives the exact called region, Call association, and caller output", () => {
  const footprint = requireReturnFootprint(returnCandidate);
  const association = returnReady.calledProcessOccurrences[0];
  assert.ok(association !== undefined);
  assert.deepEqual(new Set(footprint.reads.flatMap((atom) =>
    atom.kind === InternalTransitionStateAtomKind.TokenOwners ? [atom.placeId] : []
  )), new Set([]));
  assert.deepEqual(new Set(footprint.writes.flatMap((atom) =>
    atom.kind === InternalTransitionStateAtomKind.TokenOwners ? [atom.placeId] : []
  )), new Set([returnOperation.callerOutput]));
  assert.deepEqual(
    footprint.writes.find(({ kind }) =>
      kind === InternalTransitionStateAtomKind.OccurrenceRegion
    ),
    {
      kind: InternalTransitionStateAtomKind.OccurrenceRegion,
      region: {
        root: association.calledRoot,
        members: [association.calledRoot],
      },
    },
  );
  assert.deepEqual(
    footprint.writes.find(({ kind }) =>
      kind === InternalTransitionStateAtomKind.CallAssociation
    ),
    {
      kind: InternalTransitionStateAtomKind.CallAssociation,
      record: association,
    },
  );
  assert.deepEqual(
    footprint.writes.find(({ kind }) =>
      kind === InternalTransitionStateAtomKind.ControlToken
    ),
    {
      kind: InternalTransitionStateAtomKind.ControlToken,
      owner: association.caller,
      placeId: returnOperation.callerOutput,
    },
  );
});

test("caller-output equality conflicts while another parent bucket composes", () => {
  const footprint = requireReturnFootprint(returnCandidate);
  const association = returnReady.calledProcessOccurrences[0];
  assert.ok(association !== undefined);
  assert.equal(
    internalTransitionStateFootprintsAreIndependent(
      footprint,
      atomWrite({
        kind: InternalTransitionStateAtomKind.ControlToken,
        owner: association.caller,
        placeId: returnOperation.callerOutput,
      }),
    ),
    false,
  );
  assert.equal(
    internalTransitionStateFootprintsAreIndependent(
      footprint,
      atomWrite({
        kind: InternalTransitionStateAtomKind.ControlToken,
        owner: association.caller,
        placeId: "place:Independent_Parent_Output",
      }),
    ),
    true,
  );
});

test("preparation ignores a supplied successor and fails closed off the selected owner", () => {
  const expected = requireReturnFootprint(returnCandidate);
  const poisoned = {
    ...returnCandidate,
    successor: {
      ...returnCandidate.successor,
      calledProcessOccurrences: [],
      scopeOccurrences: [],
    },
  };
  assert.deepEqual(requireReturnFootprint(poisoned), expected);
  assert.equal(
    deriveInternalReturnProcessStateFootprint(
      callActivityProgram,
      returnReady,
      { ...returnCandidate, owner: returnReady.scopeOccurrences[0]!.id },
    ),
    null,
  );
});

function requireReturnFootprint(
  candidate: InternalTransitionCandidate,
): InternalTransitionStateFootprint {
  const footprint = deriveInternalReturnProcessStateFootprint(
    callActivityProgram,
    returnReady,
    candidate,
  );
  assert.notEqual(footprint, null);
  return footprint!;
}

function atomWrite(
  atom: InternalTransitionStateAtom,
): InternalTransitionStateFootprint {
  return { reads: [], writes: [atom] };
}
