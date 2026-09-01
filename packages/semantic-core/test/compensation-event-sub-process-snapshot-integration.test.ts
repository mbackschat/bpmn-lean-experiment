import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommandOutcome,
  CompensationParentContextRetentionKind,
  ControlStateKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  VariableValueKind,
  applyInternalOperationStep,
  applyStimulus,
  applyStimulusWithTrace,
  canonicalCompensationParentContextRetentionsUtf8Bytes,
  compensationEventSubProcessSnapshotProgramDefects,
  initialState,
  isWellFormedSemanticProcessProgram,
  type SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type {
  InternalTransitionStateAtom,
} from "../src/internal-transition-footprint.ts";

import {
  boundedScopeProgram,
  childScopeId,
  completeChildTask,
  fireDeadline,
  rootScopeId,
  start,
} from "./bounded-scope-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram } from "./root-scope-fixture.ts";
import {
  propagatedErrorProgram,
  startFor,
} from "./flow-node-occurrence-lifecycle-fixture.ts";
import {
  terminateChildScopeId,
  terminateCompletion,
  terminateInstanceId,
} from "./terminate-end-event-fixture.ts";

type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type BoundedPreparationModule =
  typeof import("../src/internal-transition-bounded-scope-preparation.ts");
type CompletionPreparationModule =
  typeof import("../src/internal-transition-scope-completion-preparation.ts");
type ErrorPreparationModule =
  typeof import("../src/internal-transition-error-preparation.ts");
type ClosureModule = typeof import("../src/semantic-process-closure.ts");

const footprintModule = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const boundedPreparationModule = await import(
  new URL(
    "../dist/internal-transition-bounded-scope-preparation.js",
    import.meta.url,
  ).href
) as BoundedPreparationModule;
const completionPreparationModule = await import(
  new URL(
    "../dist/internal-transition-scope-completion-preparation.js",
    import.meta.url,
  ).href
) as CompletionPreparationModule;
const errorPreparationModule = await import(
  new URL(
    "../dist/internal-transition-error-preparation.js",
    import.meta.url,
  ).href
) as ErrorPreparationModule;
const closureModule = await import(
  new URL("../dist/semantic-process-closure.js", import.meta.url).href
) as ClosureModule;

const { InternalTransitionStateAtomKind } = footprintModule;
const { deriveInternalBoundedScopePreparation } = boundedPreparationModule;
const { deriveInternalCompleteScopeStateFootprint } = completionPreparationModule;
const { deriveInternalThrowErrorStateFootprint } = errorPreparationModule;
const { closeRefusableInternalOperations } = closureModule;

const childHandlerScopeId = "scope:Compensation_Handler";

function childSnapshotProgram(maxCanonicalBytes = 65_536): SemanticProcessProgram {
  return {
    ...boundedScopeProgram,
    definitionScopes: [
      {
        id: childHandlerScopeId,
        parentScopeId: childScopeId,
        originElementId: "Compensation_Handler",
      },
      ...boundedScopeProgram.definitionScopes,
    ],
    compensationEventSubProcessSnapshots: {
      targets: [{ parentScopeId: childScopeId, handlerScopeId: childHandlerScopeId }],
      limits: { maxRecords: 8, maxCanonicalBytes },
    },
  };
}

test("reserves child entry and promotes its exact completion-time context", () => {
  const program = childSnapshotProgram();
  const started = applyStimulus(program, initialState, start);

  assert.equal(started.outcome, CommandOutcome.Committed);
  assert.equal(started.state.compensationParentContextRetentions?.length, 1);
  assert.equal(
    started.state.compensationParentContextRetentions?.[0]?.kind,
    CompensationParentContextRetentionKind.Provisional,
  );

  const completed = applyStimulus(program, started.state, completeChildTask);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  const retention = completed.state.compensationParentContextRetentions?.[0];
  assert.equal(retention?.kind, CompensationParentContextRetentionKind.Promoted);
  if (retention?.kind !== CompensationParentContextRetentionKind.Promoted) {
    assert.fail("successful child completion must promote its reservation");
  }
  assert.deepEqual(
    retention.snapshot.frames.map(({ owner, bindings }) => ({ owner, bindings })),
    [
      {
        owner: {
          processInstanceId: start.instanceId,
          definitionScopeId: rootScopeId,
          activation: 1,
        },
        bindings: [],
      },
      {
        owner: {
          processInstanceId: start.instanceId,
          definitionScopeId: childScopeId,
          activation: 1,
        },
        bindings: [],
      },
    ],
  );
});

test("interrupting the bounded child purges its provisional reservation", () => {
  const program = childSnapshotProgram();
  const started = applyStimulus(program, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);

  const interrupted = applyStimulus(program, started.state, fireDeadline);
  assert.equal(interrupted.outcome, CommandOutcome.Committed);
  assert.deepEqual(interrupted.state.compensationParentContextRetentions, []);
});

test("entry overflow rejects the whole start stimulus without trace", () => {
  const program = childSnapshotProgram(2);
  const refused = applyStimulusWithTrace(program, initialState, start);

  assert.equal(refused.result.outcome, CommandOutcome.Rejected);
  assert.equal(refused.result.state, initialState);
  assert.deepEqual(refused.committedTransitions, []);
  assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
  assert.equal(refused.currentPositions, null);
});

test("promotion overflow rolls back admitted completion and earlier internal steps", () => {
  const wideProgram = childSnapshotProgram();
  const started = applyStimulus(wideProgram, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const provisional = started.state.compensationParentContextRetentions ?? [];
  const exactProvisionalBytes =
    canonicalCompensationParentContextRetentionsUtf8Bytes(provisional);
  const exactProgram = childSnapshotProgram(exactProvisionalBytes);

  const refused = applyStimulusWithTrace(
    exactProgram,
    started.state,
    completeChildTask,
  );
  assert.equal(refused.result.outcome, CommandOutcome.Rejected);
  assert.equal(refused.result.state, started.state);
  assert.deepEqual(refused.committedTransitions, []);
  assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
  assert.equal(refused.currentPositions, null);
});

const rootBase = rootScopedProgram({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: boundedScopeProgram.identity.semanticProfile,
    sourceId: "root-compensation-snapshot",
    sourceOverlay: null,
    sourceSha256: "8".repeat(64),
  },
  processId: "Process_RootCompensationSnapshot",
  controlPlaces: [controlPlace("Flow_StartToEnd")],
  operations: [
    {
      ...operationBase("End"),
      kind: SemanticOperationKind.ReachNoneEnd,
      input: "place:Flow_StartToEnd",
    },
    {
      ...operationBase("Start"),
      kind: SemanticOperationKind.Initiate,
      output: "place:Flow_StartToEnd",
    },
  ],
});
const selectedRootScopeId = rootBase.definitionScopes[0]?.id;
assert.ok(selectedRootScopeId);
const rootHandlerScopeId = "scope:Root_Compensation_Handler";
const rootProgram = {
  ...rootBase,
  definitionScopes: [
    ...rootBase.definitionScopes,
    {
      id: rootHandlerScopeId,
      parentScopeId: selectedRootScopeId,
      originElementId: "Root_Compensation_Handler",
    },
  ],
  compensationEventSubProcessSnapshots: {
    targets: [{ parentScopeId: selectedRootScopeId, handlerScopeId: rootHandlerScopeId }],
    limits: { maxRecords: 1, maxCanonicalBytes: 65_536 },
  },
} as const satisfies SemanticProcessProgram;

test("selected root completion retains one promoted terminal owner", () => {
  assert.deepEqual(compensationEventSubProcessSnapshotProgramDefects(rootProgram), []);
  assert.equal(isWellFormedSemanticProcessProgram(rootProgram), true);
  const stimulus = {
    kind: StimulusKind.StartProcess,
    commandId: "start-root-snapshot",
    processId: rootProgram.processId,
    instanceId: "Instance_RootSnapshot",
    initialVariables: [],
  } as const;

  const completed = applyStimulus(rootProgram, initialState, stimulus);
  assert.equal(completed.outcome, CommandOutcome.Committed);
  assert.deepEqual(completed.state.control, {
    kind: ControlStateKind.Completed,
    instanceId: stimulus.instanceId,
  });
  assert.equal(completed.state.compensationParentContextRetentions?.length, 1);
  assert.equal(
    completed.state.compensationParentContextRetentions?.[0]?.kind,
    CompensationParentContextRetentionKind.Promoted,
  );
});

test("entry and completion footprints bind capacity, exact parent, and captured data", () => {
  const program = childSnapshotProgram();
  const initiated = applyStimulus(program, initialState, start, 1);
  assert.equal(initiated.outcome, CommandOutcome.Committed);
  const entry = requireOperation(program, SemanticOperationKind.EnterBoundedScope);
  const preparedEntry = deriveInternalBoundedScopePreparation(
    program,
    initiated.state,
    entry,
  );
  assert.ok(preparedEntry !== null);
  assert.deepEqual(snapshotAtomKinds(preparedEntry.footprint.reads), [
    InternalTransitionStateAtomKind.CompensationParentContextCapacity,
    InternalTransitionStateAtomKind.CompensationParentContextRetention,
  ]);
  assert.deepEqual(snapshotAtomKinds(preparedEntry.footprint.writes), [
    InternalTransitionStateAtomKind.CompensationParentContextCapacity,
    InternalTransitionStateAtomKind.CompensationParentContextRetention,
  ]);

  const started = applyStimulus(program, initialState, start);
  assert.equal(started.outcome, CommandOutcome.Committed);
  const completionReady = applyStimulus(
    program,
    started.state,
    completeChildTask,
    1,
  );
  assert.equal(completionReady.outcome, CommandOutcome.Committed);
  const decidingState = {
    ...completionReady.state,
    variables: {
      ...completionReady.state.variables,
      process: {
        bindings: [{
          name: "context",
          value: { kind: VariableValueKind.String, value: "completion-time" },
        }],
      },
    },
  };
  const completion = program.operations.find((operation) =>
    operation.kind === SemanticOperationKind.CompleteScope &&
    operation.scopeId === childScopeId
  );
  assert.ok(completion?.kind === SemanticOperationKind.CompleteScope);
  const candidate = {
    operation: completion,
    owner: decidingState.scopeOccurrences.find(({ id }) =>
      id.definitionScopeId === childScopeId
    )?.id ?? null,
  };
  const footprint = deriveInternalCompleteScopeStateFootprint(
    program,
    decidingState,
    candidate,
  );
  assert.ok(footprint !== null);
  assert.deepEqual(snapshotAtomKinds(footprint.writes), [
    InternalTransitionStateAtomKind.CompensationParentContextCapacity,
    InternalTransitionStateAtomKind.CompensationParentContextRetention,
  ]);
  assert.equal(
    footprint.reads.some((atom) =>
      atom.kind === InternalTransitionStateAtomKind.ProcessVariable &&
      atom.name === "context"
    ),
    true,
  );
});

const errorHandlerScopeId = "scope:Compensation_Error_Handler";
const errorSnapshotProgram = {
  ...propagatedErrorProgram,
  definitionScopes: [
    {
      id: errorHandlerScopeId,
      parentScopeId: terminateChildScopeId,
      originElementId: "Compensation_Error_Handler",
    },
    ...propagatedErrorProgram.definitionScopes,
  ],
  compensationEventSubProcessSnapshots: {
    targets: [{
      parentScopeId: terminateChildScopeId,
      handlerScopeId: errorHandlerScopeId,
    }],
    limits: { maxRecords: 1, maxCanonicalBytes: 65_536 },
  },
} as const satisfies SemanticProcessProgram;

test("Error interruption footprint writes the purged parent reservation", () => {
  assert.deepEqual(
    compensationEventSubProcessSnapshotProgramDefects(errorSnapshotProgram),
    [],
  );
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
  const operation = requireOperation(
    errorSnapshotProgram,
    SemanticOperationKind.ThrowError,
  );
  const owner = ready.state.scopeOccurrences.find(({ id }) =>
    id.definitionScopeId === terminateChildScopeId
  );
  assert.ok(owner !== undefined);
  const snapshotReady = {
    ...ready.state,
    compensationParentContextRetentions: [{
      kind: CompensationParentContextRetentionKind.Provisional,
      parent: owner,
      handlerScopeId: errorHandlerScopeId,
    }],
  };
  const footprint = deriveInternalThrowErrorStateFootprint(
    errorSnapshotProgram,
    snapshotReady,
    { operation, owner: owner.id },
  );
  assert.ok(footprint !== null);
  assert.deepEqual(snapshotAtomKinds(footprint.writes), [
    InternalTransitionStateAtomKind.CompensationParentContextCapacity,
    InternalTransitionStateAtomKind.CompensationParentContextRetention,
  ]);
  const applied = applyInternalOperationStep(
    errorSnapshotProgram,
    operation,
    snapshotReady,
  );
  assert.ok(applied !== null);
  assert.deepEqual(applied.successor.compensationParentContextRetentions, []);
});

test("refusal outranks enabled work and discards a partially re-evaluated batch", () => {
  const operations = boundedScopeProgram.operations.slice(0, 2);
  const first = operations[0];
  const second = operations[1];
  assert.ok(first !== undefined && second !== undefined);
  const refusal = { reason: "capacity" } as const;
  const immediate = closeRefusableInternalOperations(
    0,
    2,
    () => ({
      steps: [{ operation: first, successor: 1 }],
      refusal,
    }),
    () => true,
  );
  assert.deepEqual(immediate, {
    state: 0,
    hitBound: false,
    ambiguousInternalChoice: false,
    steps: [],
    batches: [],
    refusal,
  });

  const duringBatch = closeRefusableInternalOperations(
    0,
    2,
    (state) =>
      state === 0
        ? {
            steps: [
              { operation: first, successor: 1 },
              { operation: second, successor: 2 },
            ],
            refusal: null,
          }
        : { steps: [], refusal },
    () => true,
  );
  assert.deepEqual(duringBatch, {
    state: 0,
    hitBound: false,
    ambiguousInternalChoice: false,
    steps: [],
    batches: [],
    refusal,
  });
});

function snapshotAtomKinds(atoms: ReadonlyArray<InternalTransitionStateAtom>) {
  return atoms.flatMap(({ kind }) =>
    kind === InternalTransitionStateAtomKind.CompensationParentContextCapacity ||
      kind === InternalTransitionStateAtomKind.CompensationParentContextRetention
      ? [kind]
      : []
  );
}

function requireOperation<Kind extends SemanticOperationKind>(
  program: SemanticProcessProgram,
  kind: Kind,
): Extract<SemanticProcessProgram["operations"][number], { kind: Kind }> {
  const operation = program.operations.find(
    (candidate): candidate is Extract<
      SemanticProcessProgram["operations"][number],
      { kind: Kind }
    > => candidate.kind === kind,
  );
  assert.ok(operation !== undefined);
  return operation;
}
