import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  SemanticOperationKind,
  applyStimulus,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  ScopeOccurrenceId,
  SemanticOperation,
} from "@bpmn-lean/semantic-core";
import type {
  InternalTransitionStateFootprint,
} from "../src/internal-transition-footprint.ts";

import {
  completionStimulus,
  parallelProgram,
  startStimulus,
} from "./parallel-fork-join-fixture.ts";

type LocalControlPreparationModule =
  typeof import("../src/internal-transition-local-control-preparation.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type AlternativeModule =
  typeof import("../src/internal-transition-alternative.ts");

const preparationModule = await import(
  new URL(
    "../dist/internal-transition-local-control-preparation.js",
    import.meta.url,
  ).href
) as LocalControlPreparationModule;
const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const alternativeModule = await import(
  new URL("../dist/internal-transition-alternative.js", import.meta.url).href
) as AlternativeModule;

const {
  deriveInternalDuplicatePreparation,
  deriveInternalSynchronizePreparation,
} = preparationModule;
const {
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;
const { InternalAlternativeKind } = alternativeModule;

const duplicate = requireOperation(SemanticOperationKind.Duplicate);
const synchronize = requireOperation(SemanticOperationKind.Synchronize);
const duplicateOutput = duplicate.outputs[0];
if (duplicateOutput === undefined) {
  throw new Error("expected one Parallel Gateway fork output");
}

const beforeFork = applyStimulus(
  parallelProgram,
  initialState,
  startStimulus(),
  1,
);
assert.equal(beforeFork.outcome, CommandOutcome.Committed);
assert.equal(beforeFork.internalStepBoundExceeded, true);

const started = applyStimulus(
  parallelProgram,
  initialState,
  startStimulus(),
);
assert.equal(started.outcome, CommandOutcome.Committed);
const afterA = applyStimulus(
  parallelProgram,
  started.state,
  completionStimulus("UserTask_A"),
);
assert.equal(afterA.outcome, CommandOutcome.Committed);
const beforeJoin = applyStimulus(
  parallelProgram,
  afterA.state,
  completionStimulus("UserTask_B"),
  0,
);
assert.equal(beforeJoin.outcome, CommandOutcome.Committed);
assert.equal(beforeJoin.internalStepBoundExceeded, true);

test("prepares the exact Parallel Gateway fork token footprint", () => {
  const prepared = deriveInternalDuplicatePreparation(
    parallelProgram,
    beforeFork.state,
    duplicate,
  );
  if (prepared === null) {
    throw new Error("expected a prepared Parallel Gateway fork");
  }
  assert.deepEqual(prepared.alternative, {
    kind: InternalAlternativeKind.Operation,
    operationId: duplicate.id,
  });
  assert.deepEqual(controlTokenWrites(prepared.footprint), [
    "place:Flow_ForkToA",
    "place:Flow_ForkToB",
    "place:Flow_StartToFork",
  ]);
});

test("prepares the exact Parallel Gateway join token footprint", () => {
  const prepared = deriveInternalSynchronizePreparation(
    parallelProgram,
    beforeJoin.state,
    synchronize,
  );
  if (prepared === null) {
    throw new Error("expected a prepared Parallel Gateway join");
  }
  assert.deepEqual(controlTokenWrites(prepared.footprint), [
    "place:Flow_AToJoin",
    "place:Flow_BToJoin",
    "place:Flow_JoinToEnd",
  ]);
});

test("retains token-unit semantics for a repeated fork offer", () => {
  const input = beforeFork.state.controlTokens.find(({ placeId }) =>
    placeId === duplicate.input
  );
  assert.ok(input !== undefined);
  const repeated: RuntimeState = {
    ...beforeFork.state,
    controlTokens: beforeFork.state.controlTokens.map((token) =>
      token === input ? { ...token, multiplicity: 2 } : token
    ),
  };
  assert.notEqual(
    deriveInternalDuplicatePreparation(parallelProgram, repeated, duplicate),
    null,
  );
});

test("refuses an ambiguous affected output bucket", () => {
  const owner = beforeFork.state.controlTokens[0]?.owner;
  if (owner === undefined) {
    throw new Error("expected one Parallel Gateway fork owner");
  }
  assert.equal(
    deriveInternalDuplicatePreparation(
      parallelProgram,
      {
        ...beforeFork.state,
        controlTokens: [
          ...beforeFork.state.controlTokens,
          { placeId: duplicateOutput, owner, multiplicity: 1 },
          { placeId: duplicateOutput, owner, multiplicity: 1 },
        ],
      },
      duplicate,
    ),
    null,
  );
});

test("separates disjoint owners and conflicts on one exact token bucket", () => {
  const prepared = deriveInternalDuplicatePreparation(
    parallelProgram,
    beforeFork.state,
    duplicate,
  );
  if (prepared === null) {
    throw new Error("expected a prepared Parallel Gateway fork");
  }
  const owner = prepared.owner;
  const disjointOwner = { ...owner, activation: owner.activation + 1 };
  assert.equal(
    independent(prepared.footprint, remapOwner(prepared.footprint, disjointOwner)),
    true,
  );
  assert.equal(
    independent(prepared.footprint, {
      reads: [{
        kind: InternalTransitionStateAtomKind.ControlToken,
        owner,
        placeId: duplicateOutput,
      }],
      writes: [],
    }),
    false,
  );
});

function requireOperation<Kind extends SemanticOperationKind>(
  kind: Kind,
): Extract<SemanticOperation, { kind: Kind }> {
  const found = parallelProgram.operations.find((operation) =>
    operation.kind === kind
  );
  if (found?.kind !== kind) {
    throw new Error(`expected ${kind} operation`);
  }
  return found as Extract<SemanticOperation, { kind: Kind }>;
}

function controlTokenWrites(
  footprint: InternalTransitionStateFootprint,
): ReadonlyArray<string> {
  return footprint.writes.flatMap((atom) =>
    atom.kind === InternalTransitionStateAtomKind.ControlToken
      ? [atom.placeId]
      : []
  );
}

function remapOwner(
  footprint: InternalTransitionStateFootprint,
  owner: ScopeOccurrenceId,
): InternalTransitionStateFootprint {
  const remap = (
    atom: typeof footprint.reads[number],
  ): typeof footprint.reads[number] => {
    switch (atom.kind) {
      case InternalTransitionStateAtomKind.ControlToken:
      case InternalTransitionStateAtomKind.ScopeOccurrence:
        return { ...atom, owner };
      case InternalTransitionStateAtomKind.RuntimeControl:
        return { ...atom, instanceId: owner.processInstanceId };
      default:
        return atom;
    }
  };
  return {
    reads: footprint.reads.map(remap),
    writes: footprint.writes.map(remap),
  };
}

function independent(
  left: InternalTransitionStateFootprint,
  right: InternalTransitionStateFootprint,
): boolean {
  return internalTransitionStateFootprintsAreIndependent(left, right);
}
