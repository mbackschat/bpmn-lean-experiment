import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ControlStateKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  applyInternalOperationStep,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  MergeExclusiveOperation,
  RuntimeState,
  ScopeOccurrenceId,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  InternalTransitionStateFootprint,
} from "../src/internal-transition-footprint.ts";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

type AlternativeModule =
  typeof import("../src/internal-transition-alternative.ts");
type MergePreparationModule =
  typeof import("../src/internal-transition-merge-preparation.ts");
type CyclicRuntimeModule =
  typeof import("../src/semantic-process-cyclic-control-flow-runtime.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");

const alternativeModule = await import(
  new URL("../dist/internal-transition-alternative.js", import.meta.url).href
) as AlternativeModule;
const mergePreparationModule = await import(
  new URL(
    "../dist/internal-transition-merge-preparation.js",
    import.meta.url,
  ).href
) as MergePreparationModule;
const cyclicRuntimeModule = await import(
  new URL(
    "../dist/semantic-process-cyclic-control-flow-runtime.js",
    import.meta.url,
  ).href
) as CyclicRuntimeModule;
const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;

const {
  InternalAlternativeKind,
  canonicalUniqueInternalAlternatives,
} = alternativeModule;
const { deriveInternalExclusiveMergePreparations } = mergePreparationModule;
const {
  applyExclusiveMergeInput,
  mergeExclusive,
} = cyclicRuntimeModule;
const {
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;

const processId = "Process_InternalCommutationMerge";
const instanceId = "Instance_InternalCommutationMerge";
const childScopeId = "scope:MergeRegion";
const rootOwner = rootScopeOccurrence(processId, instanceId);
const firstOwner: ScopeOccurrenceId = {
  processInstanceId: instanceId,
  definitionScopeId: childScopeId,
  activation: 1,
};
const secondOwner: ScopeOccurrenceId = {
  processInstanceId: instanceId,
  definitionScopeId: childScopeId,
  activation: 2,
};
const calledProcessId = "Process_InternalCommutationMerge_Called";
const calledOwner: ScopeOccurrenceId = {
  processInstanceId: "Instance_InternalCommutationMerge_Called",
  definitionScopeId: `scope:${calledProcessId}`,
  activation: 1,
};

const rootProgram = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "internal-commutation-merge-test",
    sourceId: "internal-commutation-merge-test",
    sourceOverlay: null,
    sourceSha256: "c".repeat(64),
  },
  processId,
  controlPlaces: ["A", "B", "Output"].map((id) =>
    controlPlace(`Flow_${id}`)
  ),
  operations: [{
    ...operationBase("Merge"),
    kind: SemanticOperationKind.MergeExclusive,
    inputs: ["place:Flow_A", "place:Flow_B"],
    output: "place:Flow_Output",
  }],
});

const mergeOperation = requireMergeOperation(rootProgram);

const program: SemanticProcessProgram = {
  ...rootProgram,
  definitionScopes: [
    ...rootProgram.definitionScopes,
    {
      id: childScopeId,
      parentScopeId: rootOwner.definitionScopeId,
      originElementId: "SubProcess_MergeRegion",
    },
  ],
  operationScopes: rootProgram.operationScopes.map((binding) =>
    binding.operationId === mergeOperation.id
      ? { ...binding, scopeId: childScopeId }
      : binding
  ),
  controlPlaceScopes: rootProgram.controlPlaceScopes.map((binding) => ({
    ...binding,
    scopeId: childScopeId,
  })),
};

const multiOfferState = runningState([
  token("place:Flow_B", firstOwner, 1),
  token("place:Flow_A", firstOwner, 1),
  token("place:Flow_A", secondOwner, 1),
]);

test("exposes every exact merge input in canonical alternative order", () => {
  assert.equal(
    applyInternalOperationStep(program, mergeOperation, multiOfferState),
    null,
    "the legacy unique-unit evaluator remains incomplete for multiple offers",
  );

  const preparations = requirePreparations(multiOfferState);
  assert.deepEqual(
    preparations.map(({ alternative }) => alternative),
    [
      mergeAlternative(firstOwner, "place:Flow_A"),
      mergeAlternative(firstOwner, "place:Flow_B"),
      mergeAlternative(secondOwner, "place:Flow_A"),
    ],
  );
});

test("derives exact selected-input and owner-local output footprints", () => {
  const preparations = requirePreparations(multiOfferState);
  const firstInput = requirePreparation(
    preparations,
    firstOwner,
    "place:Flow_A",
  );
  assert.deepEqual(firstInput.footprint.writes, [
    {
      kind: InternalTransitionStateAtomKind.ControlToken,
      owner: firstOwner,
      placeId: "place:Flow_A",
    },
    {
      kind: InternalTransitionStateAtomKind.ControlToken,
      owner: firstOwner,
      placeId: "place:Flow_Output",
    },
  ]);

  const sameOwnerOtherInput = requirePreparation(
    preparations,
    firstOwner,
    "place:Flow_B",
  );
  const otherOwner = requirePreparation(
    preparations,
    secondOwner,
    "place:Flow_A",
  );
  assert.equal(independent(firstInput.footprint, sameOwnerOtherInput.footprint), false);
  assert.equal(independent(firstInput.footprint, otherOwner.footprint), true);
});

test("selects one unit from an exact bucket without broadening the legacy evaluator", () => {
  const multiplicityState = runningState([
    token("place:Flow_A", firstOwner, 2),
  ]);
  const [prepared] = requirePreparations(multiplicityState);
  assert.ok(prepared !== undefined);
  assert.equal(mergeExclusive(mergeOperation, multiplicityState), null);
  assert.deepEqual(
    applyExclusiveMergeInput(
      mergeOperation,
      multiplicityState,
      prepared.alternative,
    )?.controlTokens,
    [
      token("place:Flow_A", firstOwner, 1),
      token("place:Flow_Output", firstOwner, 1),
    ],
  );
});

test("uses the reviewed discriminator-first alternative ordering", () => {
  assert.deepEqual(
    canonicalUniqueInternalAlternatives([
      mergeAlternative(firstOwner, "place:Flow_A", "operation:A"),
      {
        kind: InternalAlternativeKind.Operation,
        operationId: "operation:Z",
      },
    ]),
    [
      {
        kind: InternalAlternativeKind.Operation,
        operationId: "operation:Z",
      },
      mergeAlternative(firstOwner, "place:Flow_A", "operation:A"),
    ],
  );
});

test("retains a called Process semantic owner instead of the host instance", () => {
  const calledProgram: SemanticProcessProgram = {
    ...program,
    definitionScopes: [
      rootProgram.definitionScopes[0]!,
      {
        id: calledOwner.definitionScopeId,
        parentScopeId: null,
        originElementId: calledProcessId,
      },
    ],
    operationScopes: program.operationScopes.map((binding) =>
      binding.operationId === mergeOperation.id
        ? { ...binding, scopeId: calledOwner.definitionScopeId }
        : binding
    ),
    controlPlaceScopes: program.controlPlaceScopes.map((binding) => ({
      ...binding,
      scopeId: calledOwner.definitionScopeId,
    })),
  };
  const calledState: RuntimeState = {
    ...runningState([]),
    scopeOccurrences: [
      { id: rootOwner, parent: null },
      { id: calledOwner, parent: null },
    ],
    calledProcessOccurrences: [{
      id: {
        processInstanceId: instanceId,
        elementId: "Call_CalledMerge",
        activation: 1,
      },
      caller: rootOwner,
      calledProcessId,
      calledRoot: calledOwner,
      returnOperationId: "operation:Return_CalledMerge",
    }],
    controlTokens: [token("place:Flow_A", calledOwner, 1)],
  };
  const preparations = deriveInternalExclusiveMergePreparations(
    calledProgram,
    calledState,
    mergeOperation,
  );
  assert.ok(preparations !== null && preparations[0] !== undefined);
  assert.notEqual(calledOwner.processInstanceId, instanceId);
  assert.deepEqual(preparations[0].alternative.owner, calledOwner);
});

test("is invariant to token storage order and rejects duplicate exact buckets", () => {
  const expected = requirePreparations(multiOfferState);
  assert.deepEqual(
    requirePreparations({
      ...multiOfferState,
      controlTokens: [...multiOfferState.controlTokens].reverse(),
    }),
    expected,
  );
  assert.equal(
    deriveInternalExclusiveMergePreparations(program, {
      ...multiOfferState,
      controlTokens: [
        ...multiOfferState.controlTokens,
        token("place:Flow_A", firstOwner, 1),
      ],
    }, mergeOperation),
    null,
  );
});

function runningState(
  controlTokens: RuntimeState["controlTokens"],
): RuntimeState {
  return {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId },
    scopeOccurrences: [
      { id: rootOwner, parent: null },
      { id: firstOwner, parent: rootOwner },
      { id: secondOwner, parent: rootOwner },
    ],
    controlTokens,
  };
}

function requireMergeOperation(
  selectedProgram: SemanticProcessProgram,
): MergeExclusiveOperation {
  const found = selectedProgram.operations.find(({ kind }) =>
    kind === SemanticOperationKind.MergeExclusive
  );
  if (found?.kind !== SemanticOperationKind.MergeExclusive) {
    throw new Error("expected one Exclusive Gateway merge operation");
  }
  return found;
}

function token(
  placeId: string,
  owner: ScopeOccurrenceId,
  multiplicity: number,
) {
  return { placeId, owner, multiplicity } as const;
}

function mergeAlternative(
  owner: ScopeOccurrenceId,
  inputControlPlace: string,
  operationId: string = mergeOperation.id,
) {
  return {
    kind: InternalAlternativeKind.MergeInput,
    operationId,
    owner,
    inputControlPlace,
  } as const;
}

function requirePreparations(state: RuntimeState) {
  const preparations = deriveInternalExclusiveMergePreparations(
    program,
    state,
    mergeOperation,
  );
  if (preparations === null) {
    throw new Error("expected exact Exclusive Gateway merge preparations");
  }
  return preparations;
}

function requirePreparation(
  preparations: ReturnType<typeof requirePreparations>,
  owner: ScopeOccurrenceId,
  inputControlPlace: string,
) {
  const prepared = preparations.find(({ alternative }) =>
    alternative.owner.processInstanceId === owner.processInstanceId &&
    alternative.owner.definitionScopeId === owner.definitionScopeId &&
    alternative.owner.activation === owner.activation &&
    alternative.inputControlPlace === inputControlPlace
  );
  if (prepared === undefined) {
    throw new Error("expected exact Exclusive Gateway merge input preparation");
  }
  return prepared;
}

function independent(
  left: InternalTransitionStateFootprint,
  right: InternalTransitionStateFootprint,
): boolean {
  return internalTransitionStateFootprintsAreIndependent(left, right);
}
