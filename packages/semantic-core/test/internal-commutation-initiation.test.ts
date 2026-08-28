import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ControlStateKind,
  MessageChannelKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  applyInternalOperationStep,
  initialState,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import {
  controlPlace,
  operationBase,
} from "./semantic-program-parts.ts";
import {
  rootScopedProgram,
  rootScopeOccurrence,
} from "./root-scope-fixture.ts";

type InitiationPreparationModule =
  typeof import("../src/internal-transition-initiation-preparation.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");

const preparationModule = await import(
  new URL(
    "../dist/internal-transition-initiation-preparation.js",
    import.meta.url,
  ).href
) as InitiationPreparationModule;
const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;

const { deriveInternalInitiationPreparation } = preparationModule;
const {
  InternalTransitionStateAtomKind,
  internalTransitionStateFootprintsAreIndependent,
} = footprintModule;

const noneOperation = {
  ...operationBase("Start_None"),
  kind: SemanticOperationKind.Initiate,
  output: "place:Flow_None",
} as const;
const messageOperation = {
  ...operationBase("Start_Message"),
  kind: SemanticOperationKind.InitiateMessage,
  channel: {
    kind: MessageChannelKind.OperationMessage,
    interfaceId: "Interface_Start",
    interfaceOperationId: "Operation_Start",
    messageId: "Message_Start",
  },
  outputs: ["place:Flow_Message_A", "place:Flow_Message_B"],
} as const;
const timerOperation = {
  ...operationBase("Start_Timer"),
  kind: SemanticOperationKind.InitiateTimer,
  timer: { durationMs: 1000 },
  outputs: ["place:Flow_Timer"],
} as const;

const noneProgram = initiationProgram("None", noneOperation);
const messageProgram = initiationProgram("Message", messageOperation);
const timerProgram = initiationProgram("Timer", timerOperation);

test("prepares each Process initiation from one exact pending root", () => {
  for (const [program, operation] of [
    [noneProgram, noneOperation],
    [messageProgram, messageOperation],
    [timerProgram, timerOperation],
  ] as const) {
    const owner = rootScopeOccurrence(program.processId, `Instance_${program.processId}`);
    const state = pendingState(owner);
    const prepared = deriveInternalInitiationPreparation(program, state, operation);
    assert.notEqual(prepared, null);
    if (prepared === null) {
      throw new Error(`expected ${operation.kind} initiation preparation`);
    }
    assert.deepEqual(prepared.owner, owner);
    assert.deepEqual(
      prepared.outputs,
      operation.kind === SemanticOperationKind.Initiate
        ? [operation.output]
        : operation.outputs,
    );
    assert.deepEqual(prepared.alternative, {
      kind: "operation",
      operationId: operation.id,
    });
    assert.deepEqual(
      prepared.footprint.writes.filter(({ kind }) =>
        kind === InternalTransitionStateAtomKind.ControlToken
      ),
      prepared.outputs.map((placeId) => ({
        kind: InternalTransitionStateAtomKind.ControlToken,
        owner,
        placeId,
      })),
    );
    assert.deepEqual(
      prepared.footprint.writes.find(({ kind }) =>
        kind === InternalTransitionStateAtomKind.InitiationPending
      ),
      { kind: InternalTransitionStateAtomKind.InitiationPending },
    );
    assert.deepEqual(
      prepared.footprint.reads.find(({ kind }) =>
        kind === InternalTransitionStateAtomKind.ScopeParent
      ),
      {
        kind: InternalTransitionStateAtomKind.ScopeParent,
        occurrence: owner,
        parent: null,
      },
    );
    assert.equal(
      prepared.footprint.reads.some(({ kind }) =>
        kind === InternalTransitionStateAtomKind.LogicalTime
      ),
      true,
    );
  }
});

test("the prepared outputs exactly predict the initiation successor", () => {
  const owner = rootScopeOccurrence(messageProgram.processId, "Instance_Message");
  const state: RuntimeState = {
    ...pendingState(owner),
    controlTokens: [{
      owner,
      placeId: messageOperation.outputs[0],
      multiplicity: 2,
    }],
  };
  const prepared = deriveInternalInitiationPreparation(
    messageProgram,
    state,
    messageOperation,
  );
  const applied = applyInternalOperationStep(
    messageProgram,
    messageOperation,
    state,
  );
  assert.notEqual(prepared, null);
  assert.notEqual(applied, null);
  assert.deepEqual(applied?.owner, owner);
  assert.equal(applied?.successor.initiationPending, false);
  assert.deepEqual(applied?.successor.controlTokens, [
    { owner, placeId: messageOperation.outputs[0], multiplicity: 3 },
    { owner, placeId: messageOperation.outputs[1], multiplicity: 1 },
  ]);
});

test("the global pending-start write prevents two initiation preparations commuting", () => {
  const none = requirePreparation(
    noneProgram,
    pendingState(rootScopeOccurrence(noneProgram.processId, "Instance_None")),
    noneOperation,
  );
  const timer = requirePreparation(
    timerProgram,
    pendingState(rootScopeOccurrence(timerProgram.processId, "Instance_Timer")),
    timerOperation,
  );
  assert.equal(
    internalTransitionStateFootprintsAreIndependent(
      none.footprint,
      timer.footprint,
    ),
    false,
  );
});

test("refuses a second initiation operation instead of exposing local choice", () => {
  const owner = rootScopeOccurrence(noneProgram.processId, "Instance_DuplicateStart");
  const duplicate: SemanticOperation = {
    ...operationBase("Start_Second"),
    kind: SemanticOperationKind.Initiate,
    output: noneOperation.output,
  };
  const malformed: SemanticProcessProgram = {
    ...noneProgram,
    operations: [...noneProgram.operations, duplicate],
    operationScopes: [
      ...noneProgram.operationScopes,
      { operationId: duplicate.id, scopeId: owner.definitionScopeId },
    ],
  };
  const state = pendingState(owner);
  assert.equal(
    deriveInternalInitiationPreparation(malformed, state, noneOperation),
    null,
  );
});

test("refuses ambiguous roots and malformed output buckets before mutation", () => {
  const owner = rootScopeOccurrence(noneProgram.processId, "Instance_AmbiguousRoot");
  const other = { ...owner, activation: 2 };
  const ambiguous: RuntimeState = {
    ...pendingState(owner),
    scopeOccurrences: [
      { id: owner, parent: null },
      { id: other, parent: null },
    ],
  };
  assert.equal(
    deriveInternalInitiationPreparation(noneProgram, ambiguous, noneOperation),
    null,
  );

  const duplicateOutput: RuntimeState = {
    ...pendingState(owner),
    controlTokens: [
      { owner, placeId: noneOperation.output, multiplicity: 1 },
      { owner, placeId: noneOperation.output, multiplicity: 2 },
    ],
  };
  assert.equal(
    deriveInternalInitiationPreparation(
      noneProgram,
      duplicateOutput,
      noneOperation,
    ),
    null,
  );
});

function initiationProgram(
  suffix: string,
  operation: Extract<
    SemanticOperation,
    {
      kind:
        | SemanticOperationKind.Initiate
        | SemanticOperationKind.InitiateMessage
        | SemanticOperationKind.InitiateTimer;
    }
  >,
): SemanticProcessProgram {
  const outputs = operation.kind === SemanticOperationKind.Initiate
    ? [operation.output]
    : operation.outputs;
  return rootScopedProgram({
    kind: SemanticProcessKind.SemanticProcess,
    identity: {
      compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
      semanticProfile: `internal-commutation-initiation-${suffix.toLowerCase()}`,
      sourceId: `internal-commutation-initiation-${suffix.toLowerCase()}`,
      sourceOverlay: null,
      sourceSha256: "a".repeat(64),
    },
    processId: `Process_Initiation_${suffix}`,
    controlPlaces: outputs.map((output) =>
      controlPlace(output.replace(/^place:/u, ""))
    ),
    operations: [operation],
  });
}

function pendingState(
  owner: ReturnType<typeof rootScopeOccurrence>,
): RuntimeState {
  return {
    ...initialState,
    control: {
      kind: ControlStateKind.Running,
      instanceId: owner.processInstanceId,
    },
    initiationPending: true,
    scopeOccurrences: [{ id: owner, parent: null }],
  };
}

function requirePreparation(
  program: SemanticProcessProgram,
  state: RuntimeState,
  operation: Extract<
    SemanticOperation,
    {
      kind:
        | SemanticOperationKind.Initiate
        | SemanticOperationKind.InitiateMessage
        | SemanticOperationKind.InitiateTimer;
    }
  >,
) {
  const prepared = deriveInternalInitiationPreparation(program, state, operation);
  if (prepared === null) {
    throw new Error(`expected ${operation.kind} initiation preparation`);
  }
  return prepared;
}
