import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome, SemanticOperationKind as Kind, SemanticTransitionKind, StimulusKind,
  applyInternalOperationStep, applyStimulusWithTrace,
  compareCanonicalStrings, isWellFormedSemanticProcessProgram, projectControlPositionDelta,
  projectCurrentControlPositions, projectFlowNodeOccurrenceLifecycleDelta,
  projectOpenFlowNodeOccurrences, runtimeStateDefects, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { InternalTransitionCandidate } from "../src/internal-transition-footprint.ts";
import type { InstantiatedInternalPublication } from "../src/internal-publication-template.ts";
import { regionalFrontierFixture, regionalKinds } from "./internal-regional-pair-fixture.ts";
import { regionalBatchFixture } from "./internal-regional-batch-fixture.ts";
import { regionalScopeCreationFixture, scopeCreationKinds } from "./internal-regional-scope-creation-fixture.ts";

const { deriveInternalTransitionPreparation: prepare, prepareInternalTransitionBatch: batch,
  applyPreparedInternalTransition: apply } = await import(
  new URL("../dist/internal-transition-batch.js", import.meta.url).href
) as typeof import("../src/internal-transition-batch.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as typeof import("../src/internal-publication-template.ts");

function valid(program: SemanticProcessProgram, state: RuntimeState, instanceId: string) {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.deepEqual(runtimeStateDefects(program, instanceId, state), []);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
  assert.notEqual(projectCurrentControlPositions(program, state), null);
}

function permutations<Value>(values: readonly Value[]): Value[][] {
  return values.length === 0 ? [[]] : values.flatMap((value, index) =>
    permutations(values.filter((_, other) => other !== index)).map((rest) => [value, ...rest]));
}

function frontier(program: SemanticProcessProgram, state: RuntimeState): InternalTransitionCandidate[] {
  return program.operations.flatMap((operation) => {
    const step = applyInternalOperationStep(program, operation, state);
    return step === null ? [] : [{ operation, owner: step.owner }];
  });
}

function assertAllOrders(program: SemanticProcessProgram, state: RuntimeState, instanceId: string,
  candidates: readonly InternalTransitionCandidate[]) {
  valid(program, state, instanceId);
  assert.deepEqual(frontier(program, state), candidates, "the batch covers the complete predecessor frontier");
  const prepared = batch(program, state, candidates);
  assert.ok(prepared !== null, "the independent regional frontier must prepare");
  const expected = instantiateInternalPublicationBatch("regional-batch", 43,
    prepared.map(({ publicationTemplate }) => publicationTemplate));
  assert.ok(expected !== null);
  assert.deepEqual(expected.map(({ transitionIndex }) => transitionIndex), prepared.map((_, index) => 43 + index));
  let final: RuntimeState | undefined;
  for (const ordered of permutations(prepared)) {
    assert.deepEqual(batch(program, state, ordered), ordered);
    assert.deepEqual(instantiateInternalPublicationBatch("regional-batch", 43,
      ordered.map(({ publicationTemplate }) => publicationTemplate)), expected);
    let current = state;
    const publications = [];
    for (const [index, member] of ordered.entries()) {
      for (const remaining of ordered.slice(index)) assert.deepEqual(prepare(program, current, remaining), remaining);
      const next = apply(program, current, member);
      const step = applyInternalOperationStep(program, member.operation, current);
      assert.ok(next !== null && step !== null && step.owner !== null);
      assert.deepEqual(next, step.successor);
      valid(program, next, instanceId);
      const publication: InstantiatedInternalPublication = expected.find(({ alternative }) => alternative.operationId === member.operation.id)!;
      const positionDelta = projectControlPositionDelta(program, current, next);
      const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(program, current, next,
        { kind: "internal", operation: member.operation, owner: step.owner }, "regional-batch", publication.transitionIndex);
      assert.ok(positionDelta !== null && lifecycle !== null);
      publications.push({ alternative: member.alternative, transitionIndex: publication.transitionIndex,
        record: { logicalTimeMs: current.logicalTimeMs, transition: { kind: SemanticTransitionKind.InternalOperation,
          operationId: member.operation.id, operationKind: member.operation.kind, origin: member.operation.origin,
          owner: step.owner }, positionDelta }, lifecycle });
      current = next;
    }
    assert.deepEqual(publications.sort((a, b) => compareCanonicalStrings(a.alternative.operationId, b.alternative.operationId)), expected);
    if (final === undefined) final = current;
    else assert.deepEqual(current, final, "raw canonical states agree without normalization in the assertion");
  }
}

for (const kind of regionalKinds) for (const bounded of kind === Kind.CompleteScope ? [false, true] : [false]) {
  test(`${kind}${bounded ? "/bounded" : ""}: three regional members preserve complete preparations, state and publication in all six orders`, () => {
    const { program, state: prefix, start, side } = regionalFrontierFixture([kind, kind, kind], bounded);
    assert.equal(supportsSemanticProcessExecution(start, program), false,
      "constructed runtime witnesses widen no registered profile");
    const armed = applyInternalOperationStep(program, side, prefix);
    assert.ok(armed !== null);
    const candidates = frontier(program, armed.successor);
    assert.equal(candidates.length, 3);
    assertAllOrders(program, armed.successor, start.instanceId, candidates);
  });
}

for (const kind of regionalKinds) for (const creationKind of scopeCreationKinds)
for (const bounded of kind === Kind.CompleteScope ? [false, true] : [false]) {
  test(`${kind}/${creationKind}${bounded ? "/bounded" : ""}: four prepared families preserve all 24 orders`, () => {
    const { program, state, start } = regionalBatchFixture(kind, creationKind, bounded);
    assert.equal(supportsSemanticProcessExecution(start, program), false);
    const candidates = frontier(program, state);
    assert.equal(candidates.length, 4);
    assertAllOrders(program, state, start.instanceId, candidates);
  });
}

for (const kind of regionalKinds) {
  test(`${kind}: generic execution binds the complete artifact and its common operation/owner fields`, () => {
    const { program, state, start } = regionalBatchFixture(kind, Kind.EnterScope);
    valid(program, state, start.instanceId);
    const prepared = batch(program, state, frontier(program, state));
    assert.ok(prepared !== null);
    const regional = prepared.find(({ family }) => family === "regional");
    assert.ok(regional !== undefined && regional.family === "regional");
    for (const member of [
      { ...regional, operation: { ...regional.operation, id: "forged-operation" } },
      { ...regional, owner: { ...regional.owner, activation: 99 } },
      { ...regional, selection: { ...regional.selection, owner: { ...regional.owner, activation: 99 } } },
      { ...regional, footprint: { ...regional.footprint, reads: [] } },
      { ...regional, region: { ...regional.region, members: [] } },
      { ...regional, publicationTemplate: { ...regional.publicationTemplate,
        record: { ...regional.publicationTemplate.record, logicalTimeMs: 0 } } },
    ]) assert.equal(apply(program, state, member), null);
    assert.equal(prepare(program, state, { ...regional, owner: null }), null);
    assert.equal(prepare(program, state, { ...regional, owner: { ...regional.owner, activation: 99 } }), null);
    const stale = { ...state, logicalTimeMs: state.logicalTimeMs + 1 };
    valid(program, stale, start.instanceId);
    assert.notEqual(prepare(program, stale, regional), null);
    assert.equal(apply(program, stale, regional), null);
    for (const ordered of permutations(prepared)) assert.equal(batch(program, state, [...ordered, ordered[0]!]), null);
    const snapshots = { ...program, compensationEventSubProcessSnapshots: {
      targets: [], limits: { maxRecords: 1, maxCanonicalBytes: 1024 },
    } };
    assert.equal(prepare(snapshots, state, regional), null);
    assert.equal(apply(snapshots, state, regional), null);
    assert.equal(batch(snapshots, state, prepared), null);
  });
}

for (const kind of [Kind.ThrowError, Kind.TerminateScope] as const) {
  test(`${kind}: a nonadjacent containing-region conflict rejects the entire frontier`, () => {
    const { program, state, start, regional, creation } = regionalScopeCreationFixture(kind, Kind.EnterScope, false, true);
    valid(program, state, start.instanceId);
    const candidates = frontier(program, state);
    const destructive = candidates.find(({ operation }) => operation.id === regional.id)!;
    const inside = candidates.find(({ operation }) => operation.id === creation.id)!;
    const others = candidates.filter((candidate) => candidate !== destructive && candidate !== inside);
    assert.ok(others.length > 0);
    assert.notEqual(batch(program, state, [destructive, ...others]), null);
    assert.notEqual(batch(program, state, [...others, inside]), null);
    assert.equal(batch(program, state, [destructive, ...others, inside]), null);
    for (const ordered of permutations(candidates)) assert.equal(batch(program, state, ordered), null);
    const side = program.operations.find(({ id }) => id === "operation:Side_Task")!;
    assert.ok(side.kind === Kind.AwaitUserTask);
    const armed = applyInternalOperationStep(program, side, state);
    assert.ok(armed !== null);
    const wait = armed.successor.userTaskWaits.find(({ id }) => id.elementId === side.task.elementId)!;
    const refused = applyStimulusWithTrace(program, armed.successor, {
      kind: StimulusKind.CompleteUserTaskInstance, commandId: "conflicting-region",
      taskId: wait.id, submittedValues: [],
    }, 20);
    assert.equal(refused.result.outcome, CommandOutcome.RolledBack);
    assert.equal(refused.result.ambiguousInternalChoice, true);
    assert.equal(refused.result.internalStepBoundExceeded, false);
    assert.deepEqual(refused.result.state, armed.successor);
    assert.deepEqual(refused.committedTransitions, []);
    assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
  });
}

test("an enabled unsupported member refuses every order of an otherwise independent regional frontier", () => {
  const fixture = regionalFrontierFixture([Kind.ReturnProcess, Kind.CompleteScope, Kind.TerminateScope]);
  const { side, state, start } = fixture;
  assert.ok(side.kind === Kind.AwaitUserTask);
  const merge = { id: side.id, origin: side.origin, kind: Kind.MergeExclusive,
    inputs: [side.input], output: side.output } as const;
  const program = { ...fixture.program,
    operations: fixture.program.operations.map((operation) => operation === side ? merge : operation) };
  valid(program, state, start.instanceId);
  const candidates = frontier(program, state);
  assert.equal(candidates.length, 4);
  assert.notEqual(batch(program, state, candidates.filter(({ operation }) => operation !== merge)), null);
  for (const ordered of permutations(candidates)) assert.equal(batch(program, state, ordered), null);
});

for (const kind of [Kind.ReturnProcess, Kind.CompleteScope] as const) {
  test(`${kind}: complete command publishes the regional batch and exact fuel exhaustion rolls back the external task completion`, () => {
    const { program, state: prefix, start, side } = regionalFrontierFixture([kind, kind, kind]);
    const armed = applyInternalOperationStep(program, side, prefix);
    assert.ok(armed !== null && side.kind === Kind.AwaitUserTask);
    const state = armed.successor;
    const wait = state.userTaskWaits.find(({ id }) => id.elementId === side.task.elementId)!;
    const command = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "finish-side",
      taskId: wait.id, submittedValues: [] } as const;
    const accepted = applyStimulusWithTrace(program, state, command, 6);
    assert.equal(accepted.result.outcome, CommandOutcome.Committed);
    assert.equal(accepted.result.internalStepBoundExceeded, false);
    assert.equal(accepted.result.ambiguousInternalChoice, false);
    assert.equal(accepted.result.state.control.kind, "completed");
    valid(program, accepted.result.state, start.instanceId);
    assert.equal(accepted.committedTransitions.length, 7);
    assert.equal(accepted.flowNodeOccurrenceLifecycles.length, 7);
    for (const fuel of [0, 2, 3, 5]) {
      const refused = applyStimulusWithTrace(program, state, command, fuel);
      assert.equal(refused.result.outcome, CommandOutcome.RolledBack);
      assert.equal(refused.result.internalStepBoundExceeded, true);
      assert.equal(refused.result.ambiguousInternalChoice, false);
      assert.deepEqual(refused.result.state, state);
      assert.deepEqual(refused.committedTransitions, []);
      assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
    }
  });
}
