import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind as Kind, SemanticTransitionKind, VariableValueKind, applyInternalOperationStep,
  compareCanonicalStrings, isWellFormedSemanticProcessProgram, projectControlPositionDelta,
  projectCurrentControlPositions, projectFlowNodeOccurrenceLifecycleDelta, projectOpenFlowNodeOccurrences,
  runtimeStateDefects, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { InstantiatedInternalPublication } from "../src/internal-publication-template.ts";
import { regionalKinds, regionalPairFixture } from "./internal-regional-pair-fixture.ts";
import { internalArmingKinds, internalArmingOperation, withInternalArmingBoundaryRoute } from "./internal-arming-operation-fixture.ts";

const { deriveInternalRegionalPreparation: prepare, applyPreparedInternalRegionalTransition: apply } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { internalTransitionStateFootprintsAreIndependent: independent, InternalTransitionStateAtomKind: Atom } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as typeof import("../src/internal-publication-template.ts");
const { deriveInternalTransitionPreparation: prepareOrdinary, applyPreparedInternalTransition: applyOrdinary } = await import(
  new URL("../dist/internal-transition-batch.js", import.meta.url).href
) as typeof import("../src/internal-transition-batch.ts");
const { compareTokenPlaces } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");

function valid(program: SemanticProcessProgram, state: RuntimeState, instanceId: string) {
  assert.equal(isWellFormedSemanticProcessProgram(program), true, "structurally valid constructed Program");
  assert.deepEqual(runtimeStateDefects(program, instanceId, state), []);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
  assert.notEqual(projectCurrentControlPositions(program, state), null);
}

function assertPair(fixture: ReturnType<typeof regionalPairFixture>) {
  const { program, state, start, branches } = fixture;
  valid(program, state, start.instanceId);
  assert.equal(supportsSemanticProcessExecution(start, program), false,
    "constructed intermediate-state evidence admits no source/profile topology");
  const prepared = branches.map(({ selected, scopeId }) => {
    const member = prepare(program, state, selected);
    assert.ok(member !== null);
    assert.equal(member.selection.owner.definitionScopeId, scopeId);
    assert.deepEqual(member.region.root, member.selection.owner);
    assert.deepEqual(member.region.members, [member.selection.owner]);
    if (member.selection.kind === Kind.ReturnProcess) {
      const { root, record } = member.selection.selected;
      assert.deepEqual(root.id, member.selection.owner);
      assert.ok(state.calledProcessOccurrences.includes(record));
      assert.notEqual(root.id.processInstanceId, start.instanceId);
      assert.equal(record.caller.processInstanceId, start.instanceId);
    }
    return member;
  });
  assert.equal(independent(prepared[0]!.footprint, prepared[1]!.footprint), true);
  const expected = instantiateInternalPublicationBatch("regional-pair", 43, prepared.map((member) => member.publicationTemplate));
  assert.ok(expected !== null);
  assert.deepEqual(expected.map(({ transitionIndex }) => transitionIndex), [43, 44]);
  let final: RuntimeState | undefined;
  for (const order of [prepared, [...prepared].reverse()]) {
    assert.deepEqual(instantiateInternalPublicationBatch("regional-pair", 43,
      order.map(({ publicationTemplate }) => publicationTemplate)), expected);
    let current = state;
    const actual = [];
    for (const [index, member] of order.entries()) {
      for (const remaining of order.slice(index)) {
        assert.deepEqual(prepare(program, current, remaining.selection.operation), remaining,
          "independent step preserves the complete opposite preparation");
      }
      const operation = member.selection.operation;
      const step = applyInternalOperationStep(program, operation, current);
      assert.ok(step !== null && step.owner !== null);
      const next = apply(program, current, member);
      assert.ok(next !== null);
      assert.deepEqual(next, step.successor);
      valid(program, next, start.instanceId);
      const publication: InstantiatedInternalPublication = expected.find(({ alternative }) => alternative.operationId === operation.id)!;
      const positionDelta = projectControlPositionDelta(program, current, next);
      const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(program, current, next,
        { kind: "internal", operation, owner: step.owner }, "regional-pair", publication.transitionIndex);
      assert.ok(positionDelta !== null && lifecycle !== null);
      actual.push({ alternative: member.alternative, transitionIndex: publication.transitionIndex,
        record: { logicalTimeMs: current.logicalTimeMs,
          transition: { kind: SemanticTransitionKind.InternalOperation, operationId: operation.id,
            operationKind: operation.kind, origin: operation.origin, owner: step.owner }, positionDelta }, lifecycle });
      for (const key of ["taskActivations", "messageActivations", "timerActivations", "effectActivations",
        "activityActivations", "scopeActivations", "callActivations", "eventRaceActivations"] as const) {
        assert.deepEqual(next[key], state[key], key);
      }
      current = next;
    }
    assert.deepEqual(actual.sort((a, b) => compareCanonicalStrings(a.alternative.operationId, b.alternative.operationId)), expected);
    if (final === undefined) final = current;
    else assert.deepEqual(current, final, "exact raw states commute without assertion-time normalization");
    assert.equal(current.logicalTimeMs, 491);
    assert.equal(current.endOccurrences, state.endOccurrences + branches.filter(({ kind }) => kind === Kind.TerminateScope).length);
  }
  return prepared;
}

for (const left of regionalKinds) for (const right of regionalKinds) {
  test(`${left}/${right} preserves exact preparation, valid prefixes and accepted publication in both orders`, () => {
    assertPair(regionalPairFixture(left, right));
  });
}

for (const other of regionalKinds) {
  test(`bounded completion/${other} preserves parent-owned deadline withdrawal in both orders`, () => {
    const fixture = regionalPairFixture(Kind.CompleteScope, other, true);
    const prepared = assertPair(fixture);
    const first = prepared[0]!;
    assert.ok(first.selection.kind === Kind.CompleteScope && first.selection.withdrawal.kind === "bounded");
    const { record, timerWaits } = first.selection.withdrawal;
    assert.notDeepEqual(record.owner, first.selection.owner);
    assert.equal(timerWaits.length, 1);
    assert.deepEqual(timerWaits[0]!.owner, record.owner);
    const after = apply(fixture.program, fixture.state, first)!;
    assert.equal(after.activityOccurrences.includes(record), false);
    assert.equal(after.timerWaits.includes(timerWaits[0]!), false);
  });
}

for (const kind of regionalKinds) for (const armingKind of internalArmingKinds)
for (const bounded of kind === Kind.CompleteScope ? [false, true] : [false]) {
  test(`${kind}/${armingKind}${bounded ? "/bounded" : ""} preserves complete preparation, raw state and accepted publication in both orders`, () => {
    const fixture = regionalPairFixture(kind, Kind.CompleteScope, bounded);
    const { start, branches, side } = fixture;
    assert.ok(side.kind === Kind.AwaitUserTask);
    const arming = internalArmingOperation(armingKind, side.input, side.output);
    const program = withInternalArmingBoundaryRoute({ ...fixture.program,
      operations: fixture.program.operations.map((operation) => operation === side ? arming : operation)
        .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      operationScopes: fixture.program.operationScopes.map((binding) => binding.operationId === side.id
        ? { ...binding, operationId: arming.id } : binding)
        .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)) }, arming);
    const state: RuntimeState = { ...fixture.state,
      variables: { ...fixture.state.variables, process: { bindings: [
        { name: "details", value: { kind: VariableValueKind.String, value: "Review details" } },
      ] } } };
    valid(program, state, start.instanceId);
    assert.equal(supportsSemanticProcessExecution(start, program), false,
      "constructed mixed frontier establishes no source/profile admission");
    const regional = prepare(program, state, branches[0]!.selected);
    const candidate = { operation: arming, owner: state.controlTokens.find(({ placeId }) => placeId === side.input)!.owner };
    const ordinary = prepareOrdinary(program, state, candidate);
    assert.ok(regional !== null && ordinary !== null);
    assert.equal(independent(regional.footprint, ordinary.footprint), true);
    const expected = instantiateInternalPublicationBatch("regional-arming", 43,
      [regional.publicationTemplate, ordinary.publicationTemplate]);
    assert.ok(expected !== null);
    assert.deepEqual(expected.map(({ transitionIndex }) => transitionIndex), [43, 44]);
    let final: RuntimeState | undefined;
    for (const order of [[regional, ordinary], [ordinary, regional]]) {
      assert.deepEqual(instantiateInternalPublicationBatch("regional-arming", 43,
        order.map(({ publicationTemplate }) => publicationTemplate)), expected);
      let current = state;
      const actual = [];
      for (const [index, member] of order.entries()) {
        for (const remaining of order.slice(index)) {
          assert.deepEqual("selection" in remaining
            ? prepare(program, current, remaining.selection.operation)
            : prepareOrdinary(program, current, candidate), remaining);
        }
        const operation = "selection" in member ? member.selection.operation : member.operation;
        const step = applyInternalOperationStep(program, operation, current);
        const next = "selection" in member ? apply(program, current, member) : applyOrdinary(program, current, member);
        assert.ok(step !== null && step.owner !== null && next !== null);
        assert.deepEqual(next, step.successor);
        valid(program, next, start.instanceId);
        const publication: InstantiatedInternalPublication = expected.find(({ alternative }) => alternative.operationId === operation.id)!;
        const positionDelta = projectControlPositionDelta(program, current, next);
        const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(program, current, next,
          { kind: "internal", operation, owner: step.owner }, "regional-arming", publication.transitionIndex);
        assert.ok(positionDelta !== null && lifecycle !== null);
        actual.push({ alternative: member.alternative, transitionIndex: publication.transitionIndex,
          record: { logicalTimeMs: current.logicalTimeMs,
            transition: { kind: SemanticTransitionKind.InternalOperation, operationId: operation.id,
              operationKind: operation.kind, origin: operation.origin, owner: step.owner }, positionDelta }, lifecycle });
        current = next;
      }
      assert.deepEqual(actual.sort((a, b) => compareCanonicalStrings(a.alternative.operationId, b.alternative.operationId)), expected);
      if (final === undefined) final = current;
      else assert.deepEqual(current, final, "exact raw states commute without assertion-time normalization");
    }
    if (bounded) {
      assert.ok(regional.selection.kind === Kind.CompleteScope && regional.selection.withdrawal.kind === "bounded");
      const { record, timerWaits } = regional.selection.withdrawal;
      assert.notDeepEqual(record.owner, regional.selection.owner);
      assert.equal(timerWaits.length, 1);
      assert.ok(final !== undefined);
      assert.equal(final.activityOccurrences.includes(record), false);
      assert.equal(final.timerWaits.includes(timerWaits[0]!), false);
    }
  });
}

for (const kind of [Kind.ThrowError, Kind.TerminateScope] as const) {
  test(`${kind} region and place-census dependencies reject arming work inside the removed region`, () => {
    const fixture = regionalPairFixture(kind, Kind.CompleteScope);
    const { program, start, branches } = fixture;
    const branch = branches[0]!;
    const sibling = program.operations.find(({ id }) => id === `operation:${branch.name}_Sibling_Task`);
    assert.ok(sibling?.kind === Kind.AwaitUserTask);
    const wait = fixture.state.userTaskWaits.find(({ id }) => id.elementId === sibling.task.elementId)!;
    const state: RuntimeState = { ...fixture.state,
      userTaskWaits: fixture.state.userTaskWaits.filter((entry) => entry !== wait),
      controlTokens: [...fixture.state.controlTokens,
        { placeId: sibling.input, owner: wait.owner, multiplicity: 1 }].sort(compareTokenPlaces) };
    valid(program, state, start.instanceId);
    const regional = prepare(program, state, branch.selected);
    const candidate = { operation: sibling, owner: wait.owner };
    const ordinary = prepareOrdinary(program, state, candidate);
    assert.ok(regional !== null && ordinary !== null);
    assert.equal(independent(regional.footprint, ordinary.footprint), false);
    const withoutRemovalDependencies = {
      reads: regional.footprint.reads.filter((atom) => atom.kind !== Atom.OccurrenceRegion),
      writes: regional.footprint.writes.filter((atom) => atom.kind !== Atom.OccurrenceRegion &&
        !(atom.kind === Atom.TokenOwners && atom.placeId === sibling.input)),
    };
    assert.equal(independent(withoutRemovalDependencies, ordinary.footprint), true,
      "omitting the region and its changed place census restores the unsound independence result");
    const regionalFirst = apply(program, state, regional);
    const ordinaryFirst = applyOrdinary(program, state, ordinary);
    assert.ok(regionalFirst !== null && ordinaryFirst !== null);
    valid(program, regionalFirst, start.instanceId);
    valid(program, ordinaryFirst, start.instanceId);
    assert.equal(prepareOrdinary(program, regionalFirst, candidate), null);
    assert.equal(applyOrdinary(program, regionalFirst, ordinary), null);
    assert.equal(applyInternalOperationStep(program, sibling, regionalFirst), null);
    assert.notDeepEqual(prepare(program, ordinaryFirst, branch.selected), regional,
      "arming replaces a consumed token by a newly issued cancellation lifecycle anchor");
    assert.equal(apply(program, ordinaryFirst, regional), null,
      "the actual complete-preparation executor kills the omission mutation");
    assert.equal(apply(program, state, { ...regional, footprint: withoutRemovalDependencies }), null);
  });
}
