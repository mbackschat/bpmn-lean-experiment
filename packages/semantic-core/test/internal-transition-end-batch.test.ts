import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome, SemanticOperationKind as Kind, StimulusKind,
  applyInternalOperationStep, applyStimulusWithTrace, compareCanonicalStrings,
  isWellFormedSemanticProcessProgram, projectControlPositionDelta,
  projectCurrentControlPositions, projectFlowNodeOccurrenceLifecycleDelta,
  projectOpenFlowNodeOccurrences, runtimeStateDefects,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { InternalTransitionCandidate } from "../src/internal-transition-footprint.ts";
import type { PreparedInternalTransition } from "../src/internal-transition-batch.ts";
import type { InstantiatedInternalPublication } from "../src/internal-publication-template.ts";
import { regionalFrontierFixture, regionalKinds } from "./internal-regional-pair-fixture.ts";
import { regionalBatchFixture } from "./internal-regional-batch-fixture.ts";
import { scopeCreationKinds } from "./internal-regional-scope-creation-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";

const { prepareInternalTransitionBatch: batch, deriveInternalTransitionPreparation: prepare,
  applyPreparedInternalTransition: apply } = await import(
  new URL("../dist/internal-transition-batch.js", import.meta.url).href
) as typeof import("../src/internal-transition-batch.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as typeof import("../src/internal-publication-template.ts");
const { compareTokenPlaces } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");
const { completeOrdinaryUserTask } = await import(
  new URL("../dist/semantic-process-user-task-runtime.js", import.meta.url).href
) as typeof import("../src/semantic-process-user-task-runtime.ts");

function valid(program: SemanticProcessProgram, state: RuntimeState, instanceId: string) {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.deepEqual(runtimeStateDefects(program, instanceId, state), []);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
  assert.notEqual(projectCurrentControlPositions(program, state), null);
}

function ordinaryEndFrontier() {
  const fixture = regionalFrontierFixture([Kind.CompleteScope, Kind.CompleteScope, Kind.CompleteScope]);
  const armed = applyInternalOperationStep(fixture.program, fixture.side, fixture.state);
  assert.ok(armed !== null);
  const ends = fixture.branches.map((branch) => {
    const operation = fixture.program.operations.find(({ id }) => id === `operation:${branch.name}_End`);
    const occurrence = armed.successor.scopeOccurrences.find(({ id }) => id.definitionScopeId === branch.scopeId);
    assert.ok(operation?.kind === Kind.ReachNoneEnd && occurrence !== undefined);
    return { operation, owner: occurrence.id };
  });
  const state: RuntimeState = { ...armed.successor,
    endOccurrences: armed.successor.endOccurrences - ends.length,
    controlTokens: [...armed.successor.controlTokens, ...ends.map(({ operation, owner }) =>
      ({ placeId: operation.input, owner, multiplicity: 1 }))].sort(compareTokenPlaces) };
  valid(fixture.program, state, fixture.start.instanceId);
  const frontier = fixture.program.operations.flatMap((operation) => {
    const step = applyInternalOperationStep(fixture.program, operation, state);
    return step === null ? [] : [{ operation, owner: step.owner }];
  });
  assert.deepEqual(frontier, ends);
  return { ...fixture, state, ends, expected: armed.successor };
}

function assertOrders(program: SemanticProcessProgram, state: RuntimeState, instanceId: string,
  candidates: readonly InternalTransitionCandidate[], orders: readonly (readonly number[])[]) {
  valid(program, state, instanceId);
  const frontier = program.operations.flatMap((operation) => {
    const step = applyInternalOperationStep(program, operation, state);
    return step === null ? [] : [{ operation, owner: step.owner }];
  });
  assert.deepEqual(candidates, frontier, "the complete predecessor frontier is covered");
  const prepared = batch(program, state, candidates);
  assert.ok(prepared !== null, "the complete independent ordinary-End frontier must prepare");
  const publications = instantiateInternalPublicationBatch("end-batch", 41,
    prepared.map(({ publicationTemplate }) => publicationTemplate));
  assert.ok(publications !== null);
  let final: RuntimeState | undefined;
  for (const order of orders) {
    let current = state;
    const ordered: PreparedInternalTransition[] = order.map((index) => prepared[index]!);
    assert.deepEqual(instantiateInternalPublicationBatch("end-batch", 41,
      ordered.map(({ publicationTemplate }) => publicationTemplate)), publications);
    for (const [index, member] of ordered.entries()) {
      for (const remaining of ordered.slice(index)) assert.deepEqual(prepare(program, current, remaining), remaining);
      const next = apply(program, current, member);
      const actual = applyInternalOperationStep(program, member.operation, current);
      assert.ok(next !== null && actual !== null);
      assert.deepEqual(next, actual.successor);
      valid(program, next, instanceId);
      const publication: InstantiatedInternalPublication =
        publications.find(({ alternative }) => alternative.operationId === member.operation.id)!;
      assert.deepEqual(publication.record.positionDelta, projectControlPositionDelta(program, current, next));
      assert.deepEqual(publication.lifecycle, projectFlowNodeOccurrenceLifecycleDelta(program, current, next,
        { kind: "internal", operation: member.operation, owner: member.owner }, "end-batch", publication.transitionIndex));
      current = next;
    }
    if (final === undefined) final = current;
    else assert.deepEqual(current, final);
  }
  assert.ok(final !== undefined);
  return final;
}

test("three ordinary Ends retain preparation, exact relative increments, and accepted publication in all six orders", () => {
  const { program, state, start, ends, expected } = ordinaryEndFrontier();
  const final = assertOrders(program, state, start.instanceId, ends,
    [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]);
  assert.deepEqual(final, expected);
  assert.equal(final.endOccurrences, state.endOccurrences + 3);
});

test("ordinary End preparation retains the executor's single-token restriction", () => {
  const { program, state, start, ends } = ordinaryEndFrontier();
  const candidate = ends[0]!;
  for (const multiplicity of [2, 3]) {
    const repeated = { ...state, controlTokens: state.controlTokens.map((token) =>
      token.placeId === candidate.operation.input ? { ...token, multiplicity } : token) };
    valid(program, repeated, start.instanceId);
    assert.equal(applyInternalOperationStep(program, candidate.operation, repeated), null);
    assert.equal(prepare(program, repeated, candidate), null);
    assert.equal(batch(program, repeated, ends), null);
  }
});

test("ordinary End execution binds the complete preparation and refuses stale or forged artifacts", () => {
  const { program, state, ends } = ordinaryEndFrontier();
  const member = prepare(program, state, ends[0]!);
  assert.ok(member !== null && member.family === "ordinaryEnd");
  for (const forged of [
    { ...member, operation: { ...member.operation, id: "forged-operation" } },
    { ...member, owner: { ...member.owner, activation: 99 } },
    { ...member, patch: { ...member.patch, inputControlPlace: ends[1]!.operation.input } },
    { ...member, footprint: { ...member.footprint, reads: [] } },
    { ...member, publicationTemplate: { ...member.publicationTemplate,
      record: { ...member.publicationTemplate.record, logicalTimeMs: 0 } } },
  ]) assert.equal(apply(program, state, forged), null);
  assert.equal(apply(program, { ...state, logicalTimeMs: state.logicalTimeMs + 1 }, member), null);
  assert.equal(prepare(program, state, { ...member, owner: null }), null);
  const snapshots = { ...program, compensationEventSubProcessSnapshots: {
    targets: [], limits: { maxRecords: 1, maxCanonicalBytes: 1024 },
  } };
  assert.equal(prepare(snapshots, state, member), null);
  assert.equal(apply(snapshots, state, member), null);
  assert.equal(batch(snapshots, state, ends), null);
});

test("an End batch rolls back the entire external command when its exact fuel boundary is missed", () => {
  const { program, state, start, side } = ordinaryEndFrontier();
  assert.ok(side.kind === Kind.AwaitUserTask);
  const wait = state.userTaskWaits.find(({ id }) => id.elementId === side.task.elementId)!;
  const command = { kind: StimulusKind.CompleteUserTaskInstance, commandId: "finish-end-batch",
    taskId: wait.id, submittedValues: [] } as const;
  const accepted = applyStimulusWithTrace(program, state, command, 9);
  assert.equal(accepted.result.outcome, CommandOutcome.Committed);
  assert.equal(accepted.result.state.control.kind, "completed");
  assert.equal(accepted.result.internalStepBoundExceeded, false);
  assert.equal(accepted.result.ambiguousInternalChoice, false);
  assert.equal(accepted.committedTransitions.length, 10);
  assert.equal(accepted.flowNodeOccurrenceLifecycles.length, 10);
  valid(program, accepted.result.state, start.instanceId);
  for (const fuel of [0, 2, 3, 5, 8]) {
    const refused = applyStimulusWithTrace(program, state, command, fuel);
    assert.equal(refused.result.outcome, CommandOutcome.RolledBack);
    assert.equal(refused.result.internalStepBoundExceeded, true);
    assert.equal(refused.result.ambiguousInternalChoice, false);
    assert.deepEqual(refused.result.state, state);
    assert.deepEqual(refused.committedTransitions, []);
    assert.deepEqual(refused.flowNodeOccurrenceLifecycles, []);
  }
});

test("shared-input End candidates defensively refuse batching even outside graph admission", () => {
  const fixture = ordinaryEndFrontier();
  const original = fixture.ends[0]!;
  const competing = { ...operationBase("Competing_End"), kind: Kind.ReachNoneEnd,
    input: original.operation.input } as const;
  const program = { ...fixture.program,
    operations: [...fixture.program.operations, competing].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operationScopes: [...fixture.program.operationScopes,
      { operationId: competing.id, scopeId: original.owner.definitionScopeId }]
      .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
  };
  assert.equal(isWellFormedSemanticProcessProgram(program), false,
    "semantic-process-graph-admission requires exactly one consumer per control place");
  assert.deepEqual(runtimeStateDefects(program, fixture.start.instanceId, fixture.state), []);
  const other = { operation: competing, owner: original.owner };
  for (const candidate of [original, other]) {
    assert.notEqual(applyInternalOperationStep(program, candidate.operation, fixture.state), null);
    assert.notEqual(prepare(program, fixture.state, candidate), null);
  }
  assert.equal(batch(program, fixture.state, [original, other]), null);
  assert.equal(batch(program, fixture.state, [other, original]), null);
});

test("a producer of the End input conflicts before it can change the selected token multiplicity", () => {
  const fixture = regionalBatchFixture(Kind.CompleteScope, Kind.EnterScope);
  const end = { ...operationBase("Produced_End"), kind: Kind.ReachNoneEnd, input: fixture.local.outputs[0]! } as const;
  const program: SemanticProcessProgram = { ...fixture.program,
    operations: [...fixture.program.operations.map((operation) =>
      operation.id === "operation:Outer_Join" && operation.kind === Kind.Synchronize
        ? { ...operation, inputs: operation.inputs.filter((input) => input !== end.input) }
        : operation), end].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operationScopes: [...fixture.program.operationScopes,
      { operationId: end.id, scopeId: fixture.owner.definitionScopeId }]
      .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
  };
  const state: RuntimeState = { ...fixture.state,
    controlTokens: [...fixture.state.controlTokens, { placeId: end.input, owner: fixture.owner, multiplicity: 1 }]
      .sort(compareTokenPlaces) };
  valid(program, state, fixture.start.instanceId);
  const ending = { operation: end, owner: fixture.owner };
  const producing = { operation: fixture.local, owner: fixture.owner };
  for (const candidate of [ending, producing]) assert.notEqual(prepare(program, state, candidate), null);
  assert.equal(batch(program, state, [ending, producing]), null);
  assert.equal(batch(program, state, [producing, ending]), null);
  const produced = applyInternalOperationStep(program, fixture.local, state);
  assert.ok(produced !== null);
  valid(program, produced.successor, fixture.start.instanceId);
  assert.equal(produced.successor.controlTokens.find(({ placeId }) => placeId === end.input)!.multiplicity, 2);
  assert.equal(prepare(program, produced.successor, ending), null);
});

for (const kind of [Kind.ThrowError, Kind.TerminateScope] as const) {
  test(`${kind}: a containing-region removal conflicts with End while sibling removal remains independent`, () => {
    const { program, state: prefix, start, branches } = regionalFrontierFixture([kind, kind]);
    const wait = prefix.userTaskWaits.find(({ id }) => id.elementId === `${branches[0]!.name}_Sibling_Task`)!;
    const state = completeOrdinaryUserTask(program, prefix, {
      kind: StimulusKind.CompleteUserTaskInstance, commandId: "finish-sibling",
      taskId: wait.id, submittedValues: [],
    });
    assert.ok(state !== null);
    valid(program, state, start.instanceId);
    const end = program.operations.find(({ id }) => id === `operation:${branches[0]!.name}_Sibling_End`)!;
    const ended = applyInternalOperationStep(program, end, state);
    assert.ok(ended !== null);
    const ending = { operation: end, owner: ended.owner };
    const [containing, sibling] = branches.map(({ selected }) => {
      const actual = applyInternalOperationStep(program, selected, state);
      assert.ok(actual !== null);
      const candidate = { operation: selected, owner: actual.owner };
      assert.notEqual(prepare(program, state, candidate), null);
      return candidate;
    });
    assert.notEqual(prepare(program, state, ending), null);
    assert.notEqual(batch(program, state, [ending, sibling!]), null);
    assert.equal(batch(program, state, [ending, containing!]), null);
    assert.equal(batch(program, state, [containing!, ending]), null);
    const removed = applyInternalOperationStep(program, containing!.operation, state);
    assert.ok(removed !== null);
    assert.equal(prepare(program, removed.successor, ending), null);
  });
}

for (const kind of regionalKinds) for (const creationKind of scopeCreationKinds)
for (const bounded of kind === Kind.CompleteScope ? [false, true] : [false]) {
  test(`${kind}/${creationKind}${bounded ? "/bounded" : ""}: End and four other prepared families retain both relative orders`, () => {
    const fixture = regionalBatchFixture(kind, creationKind, bounded);
    const end = { ...operationBase("Independent_End"), kind: Kind.ReachNoneEnd,
      input: "place:Independent_End_Input" } as const;
    const program: SemanticProcessProgram = { ...fixture.program,
      operations: [...fixture.program.operations.map((operation) =>
        operation.id === "operation:Outer_Fork" && operation.kind === Kind.Duplicate
          ? { ...operation, outputs: [...operation.outputs, end.input].sort(compareCanonicalStrings) }
          : operation), end].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      operationScopes: [...fixture.program.operationScopes,
        { operationId: end.id, scopeId: fixture.owner.definitionScopeId }]
        .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
      controlPlaces: [...fixture.program.controlPlaces, controlPlace("Independent_End_Input")]
        .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      controlPlaceScopes: [...fixture.program.controlPlaceScopes,
        { controlPlaceId: end.input, scopeId: fixture.owner.definitionScopeId }]
        .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
    };
    const state: RuntimeState = { ...fixture.state,
      controlTokens: [...fixture.state.controlTokens, { placeId: end.input, owner: fixture.owner, multiplicity: 1 }]
        .sort(compareTokenPlaces) };
    const candidates = program.operations.flatMap((operation) => {
      const step = applyInternalOperationStep(program, operation, state);
      return step === null ? [] : [{ operation, owner: step.owner }];
    });
    assert.equal(candidates.length, 5);
    const indices = candidates.map((_, index) => index);
    const orders = indices.flatMap((index) => {
      const rotation = [...indices.slice(index), ...indices.slice(0, index)];
      return [rotation, rotation.toReversed()];
    });
    assertOrders(program, state, fixture.start.instanceId, candidates, orders);
  });
}
