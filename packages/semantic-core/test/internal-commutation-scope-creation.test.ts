import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  InternalSchedulingMode,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
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
  callElementId,
  calledProcessId,
  calledScopeId,
  callerScopeId,
  expectedCalledInstanceId,
  instanceId,
} from "./call-activity-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

type ScopeCreationPreparationModule =
  typeof import("../src/internal-transition-scope-creation-preparation.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");

const preparationModule = await import(
  new URL(
    "../dist/internal-transition-scope-creation-preparation.js",
    import.meta.url,
  ).href
) as ScopeCreationPreparationModule;
const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;

const {
  InternalScopeCreationResultKind,
  deriveInternalEnterScopePreparation,
  deriveInternalInvokeProcessPreparation,
} = preparationModule;
const {
  InternalOccurrenceKind,
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;

const rootScopeId = "scope:Process_ScopeCreation";
const childScopeA = "scope:Child_A";
const childScopeB = "scope:Child_B";
const rootOwner = {
  processInstanceId: "Instance_ScopeCreation",
  definitionScopeId: rootScopeId,
  activation: 1,
};
const enterA = enterScopeOperation("Enter_A", "Input_A", "Child_A", childScopeA);
const enterB = enterScopeOperation("Enter_B", "Input_B", "Child_B", childScopeB);
const scopeProgram = scopeCreationProgram([enterA, enterB]);
const scopeState: RuntimeState = {
  ...initialState,
  control: {
    kind: ControlStateKind.Running,
    instanceId: rootOwner.processInstanceId,
  },
  scopeOccurrences: [{ id: rootOwner, parent: null }],
  controlTokens: [
    { placeId: enterA.input, owner: rootOwner, multiplicity: 1 },
    { placeId: enterB.input, owner: rootOwner, multiplicity: 1 },
  ],
  scopeActivations: [{ elementId: childScopeA, count: 2 }],
};

const callOperation = requireOperation(
  callActivityProgram,
  SemanticOperationKind.InvokeProcess,
);
const beforeCall = applyStimulus(
  callActivityProgram,
  initialState,
  callActivityStart(),
  1,
);
assert.equal(beforeCall.outcome, CommandOutcome.Committed);
assert.equal(beforeCall.internalStepBoundExceeded, true);

test("prepares a fresh child scope with its exact parent and activation", () => {
  const prepared = deriveInternalEnterScopePreparation(
    scopeProgram,
    scopeState,
    enterA,
  );
  if (prepared === null) {
    throw new Error("expected a prepared child-scope entry");
  }
  assert.deepEqual(prepared.creation, {
    kind: InternalScopeCreationResultKind.ChildScope,
    child: {
      processInstanceId: rootOwner.processInstanceId,
      definitionScopeId: childScopeA,
      activation: 3,
    },
  });
  assert.deepEqual(activationWrites(prepared.footprint), [{
    occurrenceKind: InternalOccurrenceKind.Scope,
    elementId: childScopeA,
  }]);
  assert.deepEqual(scopeParentWrites(prepared.footprint), [{
    occurrence: prepared.creation.child,
    parent: rootOwner,
  }]);
  assert.deepEqual(controlTokenWrites(prepared.footprint), [
    { owner: prepared.creation.child, placeId: enterA.childEntry },
    { owner: rootOwner, placeId: enterA.input },
  ]);
});

test("separates sibling scope entries and catches a repeated child definition", () => {
  const preparedA = requirePrepared(deriveInternalEnterScopePreparation(
    scopeProgram,
    scopeState,
    enterA,
  ));
  const preparedB = requirePrepared(deriveInternalEnterScopePreparation(
    scopeProgram,
    scopeState,
    enterB,
  ));
  assert.equal(independent(preparedA.footprint, preparedB.footprint), true);

  const collidingB = { ...enterB, childScopeId: childScopeA };
  const collidingProgram = scopeCreationProgram([enterA, collidingB]);
  const collidingPrepared = requirePrepared(deriveInternalEnterScopePreparation(
    collidingProgram,
    scopeState,
    collidingB,
  ));
  assert.equal(independent(preparedA.footprint, collidingPrepared.footprint), false);
});

test("refuses a latent token under the child identity it is about to mint", () => {
  assert.equal(deriveInternalEnterScopePreparation(
    scopeProgram,
    {
      ...scopeState,
      controlTokens: [
        ...scopeState.controlTokens,
        {
          placeId: enterA.childEntry,
          owner: {
            processInstanceId: rootOwner.processInstanceId,
            definitionScopeId: childScopeA,
            activation: 3,
          },
          multiplicity: 1,
        },
      ],
    },
    enterA,
  ), null);
});

test("prepares a called root, association, and call activation from one pre-state", () => {
  const prepared = deriveInternalInvokeProcessPreparation(
    callActivityProgram,
    beforeCall.state,
    callOperation,
  );
  if (prepared === null) {
    throw new Error("expected a prepared Call Activity invocation");
  }
  const caller = {
    processInstanceId: instanceId,
    definitionScopeId: callerScopeId,
    activation: 1,
  };
  const calledRoot = {
    processInstanceId: expectedCalledInstanceId,
    definitionScopeId: calledScopeId,
    activation: 1,
  };
  assert.deepEqual(prepared.creation, {
    kind: InternalScopeCreationResultKind.CalledProcess,
    record: {
      id: {
        processInstanceId: instanceId,
        elementId: callElementId,
        activation: 1,
      },
      caller,
      calledProcessId,
      calledRoot,
      returnOperationId: callOperation.returnOperationId,
    },
  });
  assert.deepEqual(activationWrites(prepared.footprint), [{
    occurrenceKind: InternalOccurrenceKind.Call,
    elementId: callElementId,
  }]);
  assert.deepEqual(scopeParentWrites(prepared.footprint), [{
    occurrence: calledRoot,
    parent: null,
  }]);
  assert.equal(
    prepared.footprint.writes.filter(({ kind }) =>
      kind === InternalTransitionStateAtomKind.CallAssociation
    ).length,
    1,
  );
});

test("call activation identity conflicts despite disjoint token places", () => {
  const prepared = requirePrepared(deriveInternalInvokeProcessPreparation(
    callActivityProgram,
    beforeCall.state,
    callOperation,
  ));
  const exactActivation: InternalTransitionStateAtom = {
    kind: InternalTransitionStateAtomKind.Activation,
    occurrenceKind: InternalOccurrenceKind.Call,
    elementId: callElementId,
  };
  assert.equal(independent(prepared.footprint, {
    reads: [],
    writes: [exactActivation],
  }), false);
  assert.equal(independent(prepared.footprint, {
    reads: [],
    writes: [{ ...exactActivation, elementId: "another-call" }],
  }), true);
});

function enterScopeOperation(
  elementId: string,
  input: string,
  childEntry: string,
  childScopeId: string,
) {
  return {
    ...operationBase(elementId),
    kind: SemanticOperationKind.EnterScope,
    input: `place:${input}`,
    childEntry: `place:${childEntry}`,
    childScopeId,
  } as const;
}

function scopeCreationProgram(
  operations: ReadonlyArray<Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.EnterScope }
  >>,
): SemanticProcessProgram {
  const childScopes = [...new Set(operations.map(({ childScopeId }) => childScopeId))];
  const places = operations.flatMap(({ input, childEntry }) => [input, childEntry]);
  return {
    kind: SemanticProcessKind.SemanticProcess,
    internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: "internal-commutation-scope-creation-test",
      sourceId: "internal-commutation-scope-creation-test",
      sourceOverlay: null,
      sourceSha256: "9".repeat(64),
    },
    processId: "Process_ScopeCreation",
    definitionScopes: [
      {
        id: rootScopeId,
        parentScopeId: null,
        originElementId: "Process_ScopeCreation",
      },
      ...childScopes.map((id) => ({
        id,
        parentScopeId: rootScopeId,
        originElementId: id,
      })),
    ],
    operationScopes: operations.map(({ id: operationId }) => ({
      operationId,
      scopeId: rootScopeId,
    })),
    controlPlaceScopes: operations.flatMap(({ input, childEntry, childScopeId }) => [
      { controlPlaceId: input, scopeId: rootScopeId },
      { controlPlaceId: childEntry, scopeId: childScopeId },
    ]),
    controlPlaces: places.map((id) => controlPlace(id.slice("place:".length))),
    operations,
  };
}

function requireOperation<Kind extends SemanticOperationKind>(
  program: SemanticProcessProgram,
  kind: Kind,
): Extract<SemanticOperation, { kind: Kind }> {
  const found = program.operations.find((operation) => operation.kind === kind);
  if (found?.kind !== kind) {
    throw new Error(`expected ${kind} operation`);
  }
  return found as Extract<SemanticOperation, { kind: Kind }>;
}

function requirePrepared<Prepared>(prepared: Prepared | null): Prepared {
  if (prepared === null) {
    throw new Error("expected a prepared scope-creation transition");
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

function scopeParentWrites(footprint: InternalTransitionStateFootprint) {
  return footprint.writes.flatMap((atom) =>
    atom.kind === InternalTransitionStateAtomKind.ScopeParent
      ? [{ occurrence: atom.occurrence, parent: atom.parent }]
      : []
  );
}

function controlTokenWrites(footprint: InternalTransitionStateFootprint) {
  return footprint.writes.flatMap((atom) =>
    atom.kind === InternalTransitionStateAtomKind.ControlToken
      ? [{ owner: atom.owner, placeId: atom.placeId }]
      : []
  );
}

function independent(
  left: InternalTransitionStateFootprint,
  right: InternalTransitionStateFootprint,
): boolean {
  return internalTransitionStateFootprintsAreIndependent(left, right);
}
