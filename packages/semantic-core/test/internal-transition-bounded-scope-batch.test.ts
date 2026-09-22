import assert from "node:assert/strict";
import test from "node:test";

import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  applyInternalOperationStep,
  applyStimulusWithTrace,
  compareCanonicalStrings,
  initialState,
  isWellFormedRuntimeState,
  isWellFormedSemanticProcessProgram,
  projectOpenFlowNodeOccurrences,
  projectControlPositionDelta,
  projectFlowNodeOccurrenceLifecycleDelta,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import { boundedScopeProgram, childScopeId, rootOccurrence, rootScopeId, instanceId, start } from "./bounded-scope-fixture.ts";
import { reviewProgram } from "./sequential-multi-instance-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import type { InstantiatedInternalPublication } from "../src/internal-publication-template.ts";

type BatchModule = typeof import("../src/internal-transition-batch.ts");
const { deriveInternalTransitionPreparation: prepare, applyPreparedInternalTransition: apply,
  prepareInternalTransitionBatch: batch } = await import(
  new URL("../dist/internal-transition-batch.js", import.meta.url).href
) as BatchModule;
type PublicationModule = typeof import("../src/internal-publication-template.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as PublicationModule;

type OrdinaryKind = SemanticOperationKind.AwaitUserTask | SemanticOperationKind.AwaitTimer;

function taskScopeCollision(taskName: "ChildTask" | "AfterScope") {
  const multiInstance = reviewProgram.operations.find((operation) =>
    operation.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask);
  assert.ok(multiInstance !== undefined);
  const replaceScope = (id: string) => id === childScopeId ? taskName : id;
  const taskScope = taskName === "ChildTask" ? taskName : rootScopeId;
  const timeoutPlace = controlPlace("Flow_Inner_Timeout");
  const timeoutEnd = { ...operationBase("InnerTimeoutEnd"),
    kind: SemanticOperationKind.ReachNoneEnd, input: timeoutPlace.id } as const;
  const program: SemanticProcessProgram = { ...boundedScopeProgram,
    definitionScopes: boundedScopeProgram.definitionScopes.map((row) =>
      ({ ...row, id: replaceScope(row.id) })).sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operationScopes: [...boundedScopeProgram.operationScopes.map((row) =>
      ({ ...row, scopeId: replaceScope(row.scopeId) })),
    { operationId: timeoutEnd.id, scopeId: taskScope }]
      .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
    controlPlaceScopes: [...boundedScopeProgram.controlPlaceScopes.map((row) =>
      ({ ...row, scopeId: replaceScope(row.scopeId) })),
    { controlPlaceId: timeoutPlace.id, scopeId: taskScope }]
      .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
    controlPlaces: [...boundedScopeProgram.controlPlaces, timeoutPlace]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operations: [...boundedScopeProgram.operations.map((operation): SemanticOperation => {
      switch (operation.kind) {
        case SemanticOperationKind.EnterBoundedScope:
          return { ...operation, childScopeId: taskName };
        case SemanticOperationKind.CompleteScope:
          return { ...operation, scopeId: replaceScope(operation.scopeId) };
        case SemanticOperationKind.AwaitUserTask:
          return operation.task.elementId === taskName ? {
            ...multiInstance, id: operation.id, origin: operation.origin, input: operation.input,
            task: operation.task, normalOutput: operation.output,
            boundaryTimer: { ...multiInstance.boundaryTimer, elementId: "InnerDeadline",
              output: timeoutPlace.id,
              origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: "Flow_Inner_Timeout" } },
          } : operation;
        default:
          return operation;
      }
    }), timeoutEnd].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
  };
  const state: RuntimeState = { ...initialState,
    control: { kind: ControlStateKind.Running, instanceId },
    sequentialMultiInstanceControllers: [],
    scopeOccurrences: [{ id: rootOccurrence, parent: null }],
    scopeActivations: [{ elementId: rootScopeId, count: 1 }],
    activityActivations: [{ elementId: "Scope", count: 7 }],
    controlTokens: [{ placeId: "place:Flow_Start", owner: rootOccurrence, multiplicity: 1 }],
  };
  return { program, state };
}

for (const taskName of ["ChildTask", "AfterScope"] as const) {
  test(`bounded entry keeps Activity identity separate from the ${taskName} definition-scope collision`, () => {
    const { program, state } = taskScopeCollision(taskName);
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
    const operation = program.operations.find((candidate) => candidate.kind === SemanticOperationKind.EnterBoundedScope);
    assert.ok(operation !== undefined);
    const prepared = prepare(program, state, { operation, owner: rootOccurrence });
    const evaluated = applyInternalOperationStep(program, operation, state);
    assert.ok(prepared !== null && evaluated !== null);
    assert.deepEqual(apply(program, state, prepared), evaluated.successor);
    assert.equal(isWellFormedRuntimeState(program, instanceId, evaluated.successor), true);
    assert.deepEqual(evaluated.successor.activityOccurrences.map(({ id }) => [id.activityElementId, id.activation]), [["Scope", 8]]);
    assert.equal(evaluated.successor.activityActivations.some(({ elementId }) => elementId === taskName), false);
    assert.equal(evaluated.successor.scopeOccurrences.some(({ id }) =>
      id.definitionScopeId === taskName && id.activation === 1), true);
  });
}

function fixture(kind: OrdinaryKind) {
  const bounded = boundedScopeProgram.operations.find((operation) =>
    operation.kind === SemanticOperationKind.EnterBoundedScope);
  assert.ok(bounded !== undefined);
  const input = "place:Flow_Independent";
  const output = "place:Flow_Independent_End";
  const ordinary: Extract<SemanticOperation, { kind: OrdinaryKind }> = kind === SemanticOperationKind.AwaitTimer
    ? { ...operationBase("IndependentTimer"), kind, input, output,
        timer: { elementId: "IndependentTimer", durationMs: 1000 } }
    : { ...operationBase("IndependentTask"), kind, input, output,
        task: { elementId: "IndependentTask", name: "Independent task" } };
  const outputs: [string, string] = [ordinary.input, bounded.input];
  const fork = { ...operationBase("IndependentFork"), kind: SemanticOperationKind.Duplicate,
    input: "place:Flow_Entry", outputs: outputs.sort(compareCanonicalStrings) } as const;
  const end = { ...operationBase("IndependentEnd"), kind: SemanticOperationKind.ReachNoneEnd,
    input: ordinary.output } as const;
  const places = ["Flow_Entry", "Flow_Independent", "Flow_Independent_End"].map(controlPlace);
  const program: SemanticProcessProgram = { ...boundedScopeProgram,
    controlPlaces: [...boundedScopeProgram.controlPlaces, ...places]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    controlPlaceScopes: [...boundedScopeProgram.controlPlaceScopes,
      ...places.map((place) => ({ controlPlaceId: place.id, scopeId: rootScopeId }))]
      .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
    operations: [...boundedScopeProgram.operations.map((operation): SemanticOperation =>
      operation.kind === SemanticOperationKind.Initiate ? { ...operation, output: fork.input } : operation),
      fork, ordinary, end].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operationScopes: [...boundedScopeProgram.operationScopes, ...[fork, ordinary, end]
      .map((operation) => ({ operationId: operation.id, scopeId: rootScopeId }))]
      .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
  };
  const state: RuntimeState = { ...initialState,
    control: { kind: ControlStateKind.Running, instanceId },
    scopeOccurrences: [{ id: rootOccurrence, parent: null }],
    scopeActivations: [{ elementId: rootScopeId, count: 1 }],
    controlTokens: [ordinary.input, bounded.input].sort(compareCanonicalStrings)
      .map((placeId) => ({ placeId, owner: rootOccurrence, multiplicity: 1 })),
  };
  return { program, state, bounded, ordinary };
}

for (const taskKind of [SemanticOperationKind.AwaitUserTask, SemanticOperationKind.AwaitSequentialMultiInstanceUserTask] as const) {
  test(`bounded batch preparation refuses an Activity element also declared by ${taskKind}`, () => {
    const base = taskKind === SemanticOperationKind.AwaitUserTask
      ? fixture(SemanticOperationKind.AwaitUserTask) : taskScopeCollision("ChildTask");
    const bounded = base.program.operations.find((operation) => operation.kind === SemanticOperationKind.EnterBoundedScope);
    assert.ok(bounded !== undefined);
    const task = base.program.operations.find((operation) => operation.kind === taskKind);
    assert.ok(task?.kind === SemanticOperationKind.AwaitUserTask ||
      task?.kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask);
    const program: SemanticProcessProgram = { ...base.program,
      operations: base.program.operations.map((operation) => operation.id === task.id
        ? { ...task, origin: bounded.origin, task: { ...task.task, elementId: bounded.origin.elementId } }
        : operation),
    };
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(isWellFormedRuntimeState(program, instanceId, base.state), true);
    assert.notEqual(applyInternalOperationStep(program, bounded, base.state), null);
    assert.equal(prepare(program, base.state, { operation: bounded, owner: rootOccurrence }), null);
  });
}

test("a Timer declaration sharing the bounded Activity element is outside the User Task exclusion", () => {
  const base = fixture(SemanticOperationKind.AwaitTimer);
  assert.ok(base.ordinary.kind === SemanticOperationKind.AwaitTimer);
  const timer = { ...base.ordinary, origin: base.bounded.origin,
    timer: { ...base.ordinary.timer, elementId: base.bounded.origin.elementId } };
  const program = { ...base.program, operations: base.program.operations.map((operation) =>
    operation.id === timer.id ? timer : operation) };
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.notEqual(prepare(program, base.state, { operation: base.bounded, owner: rootOccurrence }), null);
});

for (const kind of [SemanticOperationKind.AwaitUserTask, SemanticOperationKind.AwaitTimer] as const) {
  test(`bounded Sub-Process and independent ${kind} commit after a complete commuting frontier`, () => {
    const { program, state, bounded, ordinary } = fixture(kind);
    assert.equal(isWellFormedSemanticProcessProgram(program), true);
    assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
    assert.deepEqual(program.operations.filter((operation) =>
      applyInternalOperationStep(program, operation, state) !== null)
      .map((operation) => operation.id).sort(compareCanonicalStrings),
    [bounded.id, ordinary.id].sort(compareCanonicalStrings));
    const left = applyInternalOperationStep(program, bounded, state);
    const right = applyInternalOperationStep(program, ordinary, state);
    assert.ok(left !== null && right !== null);
    const lr = applyInternalOperationStep(program, ordinary, left.successor);
    const rl = applyInternalOperationStep(program, bounded, right.successor);
    assert.ok(lr !== null && rl !== null);
    assert.deepEqual(lr.successor, rl.successor);
    for (const successor of [left.successor, right.successor, lr.successor]) {
      assert.equal(isWellFormedRuntimeState(program, instanceId, successor), true);
      assert.notEqual(projectOpenFlowNodeOccurrences(program, successor), null);
    }
    const result = applyStimulusWithTrace(program, initialState, start, 8);
    assert.equal(result.result.outcome, CommandOutcome.Committed);
    assert.equal(isWellFormedRuntimeState(program, instanceId, result.result.state), true);
    assert.equal(result.result.state.activityOccurrences.length, 1);
    assert.equal(result.result.state.scopeOccurrences.length, 2);
    assert.equal(result.result.state.userTaskWaits.length, kind === SemanticOperationKind.AwaitUserTask ? 2 : 1);
    assert.equal(result.result.state.timerWaits.length, kind === SemanticOperationKind.AwaitTimer ? 2 : 1);
  });

  test(`bounded Sub-Process and ${kind} roll back before a batch exceeding remaining fuel`, () => {
    const { program } = fixture(kind);
    const result = applyStimulusWithTrace(program, initialState, start, 3);
    assert.equal(result.result.outcome, CommandOutcome.RolledBack);
    assert.equal(result.result.internalStepBoundExceeded, true);
    assert.equal(result.result.ambiguousInternalChoice, false);
    assert.deepEqual(result.result.state, initialState);
    assert.deepEqual(result.committedTransitions, []);
    assert.deepEqual(result.flowNodeOccurrenceLifecycles, []);
  });

  test(`bounded Sub-Process retains complete preparation and publication beside ${kind}`, () => {
    const { program, state: empty, bounded, ordinary } = fixture(kind);
    const state: RuntimeState = { ...empty, logicalTimeMs: 123,
      scopeActivations: [...empty.scopeActivations, { elementId: bounded.childScopeId, count: 2 }]
        .sort((a, b) => compareCanonicalStrings(a.elementId, b.elementId)),
      activityActivations: [{ elementId: bounded.origin.elementId, count: 5 }],
      timerActivations: [{ elementId: bounded.boundaryTimer.elementId, count: 7 }],
    };
    assert.equal(isWellFormedRuntimeState(program, instanceId, state), true);
    const prepared = batch(program, state, [bounded, ordinary].map((operation) =>
      ({ operation, owner: rootOccurrence })));
    assert.ok(prepared !== null);
    const publication = instantiateInternalPublicationBatch("bounded-batch", 17,
      prepared.map(({ publicationTemplate }) => publicationTemplate));
    assert.ok(publication !== null);
    let final: RuntimeState | undefined;
    for (const ordered of [prepared, prepared.toReversed()]) {
      assert.deepEqual(instantiateInternalPublicationBatch("bounded-batch", 17,
        ordered.map(({ publicationTemplate }) => publicationTemplate)), publication);
      let current: RuntimeState = state;
      for (const member of ordered) {
        assert.deepEqual(prepare(program, current, member), member);
        const successor = apply(program, current, member);
        const evaluated = applyInternalOperationStep(program, member.operation, current);
        assert.ok(successor !== null && evaluated !== null);
        assert.deepEqual(successor, evaluated.successor);
        assert.equal(isWellFormedRuntimeState(program, instanceId, successor), true);
        assert.notEqual(projectOpenFlowNodeOccurrences(program, successor), null);
        const expected: InstantiatedInternalPublication | undefined = publication.find(
          ({ alternative }) => alternative.operationId === member.operation.id);
        assert.ok(expected !== undefined);
        assert.deepEqual(projectControlPositionDelta(program, current, successor), expected.record.positionDelta);
        assert.deepEqual(projectFlowNodeOccurrenceLifecycleDelta(program, current, successor,
          { kind: "internal", operation: member.operation, owner: member.owner }, "bounded-batch", expected.transitionIndex),
        expected.lifecycle);
        current = successor;
      }
      if (final === undefined) final = current;
      else assert.deepEqual(current, final);
    }
    assert.ok(final !== undefined);
    assert.equal(final.scopeOccurrences.find(({ id }) => id.definitionScopeId === bounded.childScopeId)?.id.activation, 3);
    assert.equal(final.activityOccurrences[0]?.id.activation, 6);
    const deadline = final.timerWaits.find(({ id }) => id.elementId === bounded.boundaryTimer.elementId);
    assert.equal(deadline?.id.activation, 8);
    assert.equal(deadline?.deadlineMs, 1123);
    assert.deepEqual(deadline?.owner, rootOccurrence);
    assert.deepEqual(publication.find(({ alternative }) => alternative.operationId === bounded.id)
      ?.lifecycle.started.map(({ elementId }) => elementId), [bounded.origin.elementId]);
  });
}

test("bounded Sub-Process rejects stale issuance, publication, owner, and snapshot-enabled batches", () => {
  const { program, state, bounded, ordinary } = fixture(SemanticOperationKind.AwaitUserTask);
  const candidate = { operation: bounded, owner: rootOccurrence };
  const prepared = prepare(program, state, candidate);
  assert.ok(prepared !== null);
  const stale: RuntimeState[] = [
    { ...state, logicalTimeMs: 1 },
    { ...state, scopeActivations: [...state.scopeActivations, { elementId: bounded.childScopeId, count: 1 }] },
    { ...state, activityActivations: [{ elementId: bounded.origin.elementId, count: 1 }] },
    { ...state, timerActivations: [{ elementId: bounded.boundaryTimer.elementId, count: 1 }] },
  ];
  for (const changed of stale) {
    assert.notEqual(prepare(program, changed, candidate), null);
    assert.equal(apply(program, changed, prepared), null);
  }
  assert.equal(apply(program, state, { ...prepared, publicationTemplate: {
    ...prepared.publicationTemplate, lifecycle: { started: [], ended: [] },
  } }), null);
  assert.equal(prepare(program, state, { ...candidate, owner: { ...rootOccurrence, activation: 2 } }), null);
  assert.equal(apply(program, state, { ...prepared, owner: { ...rootOccurrence, activation: 2 } }), null);
  const snapshots = { ...program, compensationEventSubProcessSnapshots: {
    targets: [], limits: { maxRecords: 1, maxCanonicalBytes: 1024 },
  } };
  assert.equal(prepare(snapshots, state, candidate), null);
  assert.equal(apply(snapshots, state, prepared), null);
  assert.equal(batch(snapshots, state, [candidate, { operation: ordinary, owner: rootOccurrence }]), null);
});
