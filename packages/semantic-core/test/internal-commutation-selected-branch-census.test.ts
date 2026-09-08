import assert from "node:assert/strict";
import test from "node:test";
import {
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  VariableValueKind,
  applyInternalOperationStep,
  applyStimulus,
  compareCanonicalStrings,
  initialState,
  isWellFormedRuntimeState,
  isWellFormedSemanticProcessProgram,
  projectCurrentControlPositions,
  projectOpenFlowNodeOccurrences,
  runtimeStateDefects,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { ScopeOccurrenceId, SelectedBranchSet } from "../src/semantic-process-state.ts";
import { inclusiveProgram } from "./inclusive-gateway-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";
import { propagatedErrorProgram, startFor } from "./flow-node-occurrence-lifecycle-fixture.ts";
import { terminateProgram, terminateCompletion, terminateInstanceId } from "./terminate-end-event-fixture.ts";

const { deriveInternalLocalControlPreparation: prepare, applyPreparedInternalLocalControl } = await import(
  new URL("../dist/internal-transition-local-control-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-local-control-preparation.ts");
const { InternalTransitionStateAtomKind: Atom, internalTransitionStateFootprintsAreIndependent: independent } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint.ts");
const { compareTokenPlaces, compareSelectedBranchSets } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");
const { deriveInternalThrowErrorStateFootprint } = await import(
  new URL("../dist/internal-transition-error-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-error-preparation.ts");
const { deriveInternalTerminateScopeStateFootprint } = await import(
  new URL("../dist/internal-transition-termination-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-termination-preparation.ts");
const { canonicalUniqueStateAtoms } = await import(
  new URL("../dist/internal-transition-footprint-ordering.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint-ordering.ts");

const instanceId = "selected-join-instance";
const rootScope = "scope:Process_Inclusive";
const childScope = "scope:Child";
const root = { processInstanceId: instanceId, definitionScopeId: rootScope, activation: 1 };
const first = { ...root, definitionScopeId: childScope };
const second = { ...first, activation: 2 };
const program = childProgram();
const join = program.operations.find(({ kind }) => kind === SemanticOperationKind.SynchronizeSelected);
const producer = program.operations.find(({ kind }) => kind === SemanticOperationKind.Duplicate);
const split = program.operations.find(({ kind }) => kind === SemanticOperationKind.SelectMany);
assert.ok(join?.kind === SemanticOperationKind.SynchronizeSelected);
assert.ok(producer?.kind === SemanticOperationKind.Duplicate);
assert.ok(split?.kind === SemanticOperationKind.SelectMany);

for (const expectedInput of ["place:Flow_B_Join", "place:Flow_Extra"]) {
  test(`selected join protects an unready record's actual input ${expectedInput}`, () => {
    const before = state([
      token(first, "place:Flow_A_Join"), token(second, producer.input),
    ], [record(first, "place:Flow_A_Join"), record(second, expectedInput)]);
    const read = prepare(program, before, join);
    const write = prepare(program, before, producer);
    assert.ok(read && write);
    const after = applyInternalOperationStep(program, producer, before)?.successor;
    assert.ok(after);
    assertValid(before);
    assertValid(after);
    assert.equal(prepare(program, after, join), null);
    assert.equal(independent(read.footprint, write.footprint), false);
    const missingUnreadyInput = {
      ...read.footprint,
      reads: read.footprint.reads.filter((atom) => !(atom.kind === Atom.ControlToken &&
        atom.owner.activation === second.activation && atom.placeId === expectedInput)),
    };
    assert.equal(independent(missingUnreadyInput, write.footprint), true);
  });

  test(`different-owner changes at ${expectedInput} preserve the complete selected join`, () => {
    const before = state([
      token(first, "place:Flow_A_Join"), token(first, producer.input),
    ], [record(first, "place:Flow_A_Join"), record(second, expectedInput)]);
    const read = prepare(program, before, join);
    const write = prepare(program, before, producer);
    assert.ok(read && write);
    const after = applyInternalOperationStep(program, producer, before)?.successor;
    assert.ok(after);
    assertValid(before);
    assertValid(after);
    assert.deepEqual(prepare(program, after, join), read);
    assert.equal(independent(read.footprint, write.footprint), true);
  });
}

test("selected join protects insertion of another ready same-key record", () => {
  const before = state([
    token(first, "place:Flow_A_Join"), token(second, split.input), token(second, "place:Flow_B_Join"),
  ], [record(first, "place:Flow_A_Join")]);
  const read = prepare(program, before, join);
  const write = prepare(program, before, split);
  assert.ok(read && write);
  const after = applyInternalOperationStep(program, split, before)?.successor;
  assert.ok(after);
  assertValid(before);
  assertValid(after);
  assert.equal(prepare(program, after, join), null);
  assert.equal(independent(read.footprint, write.footprint), false);
  assert.equal(independent({
    reads: read.footprint.reads.filter(({ kind }) => kind !== Atom.SelectedBranchOwners),
    writes: read.footprint.writes.filter(({ kind }) => kind !== Atom.SelectedBranchOwners),
  }, write.footprint), true);
  assert.equal(independent(read.footprint, {
    ...write.footprint, writes: write.footprint.writes.filter(({ kind }) => kind !== Atom.SelectedBranchOwners),
  }), true);
  assert.equal(independent(read.footprint, {
    reads: [], writes: [{ kind: Atom.SelectedBranchOwners, selectionKey: "Other" }],
  }), true);
  assert.equal(independent(read.footprint, {
    reads: [], writes: [{ kind: Atom.SelectedBranch, owner: second, selectionKey: "Split" }],
  }), true);
});

test("selected join reads every existing same-key record and writes its population on consumption", () => {
  const before = state([token(first, "place:Flow_A_Join")], [
    record(first, "place:Flow_A_Join"), record(second, "place:Flow_Extra"),
  ]);
  const prepared = prepare(program, before, join);
  assert.ok(prepared);
  assertValid(before);
  assert.equal(independent(prepared.footprint, {
    reads: [], writes: [{ kind: Atom.SelectedBranch, owner: second, selectionKey: "Split" }],
  }), false);
  assert.equal(independent(prepared.footprint, {
    reads: [{ kind: Atom.SelectedBranchOwners, selectionKey: "Split" }], writes: [],
  }), false);
  assert.equal(independent(prepared.footprint, {
    reads: [], writes: [{ kind: Atom.SelectedBranch, owner: second, selectionKey: "Other" }],
  }), true);
});

for (const extraInputs of [
  ["place:Flow_Extra", "place:Flow_Extra"],
  ["place:Flow_Extra", "place:Flow_B_Join"],
]) {
  test(`selected join deduplicates dependencies while retaining other-owner records ${extraInputs.join(",")}`, () => {
    const retained = extraInputs.map((input) => record(second, input));
    const before = state([token(first, "place:Flow_A_Join")], [
      record(first, "place:Flow_A_Join"), ...retained,
    ]);
    const original = structuredClone(before);
    assertValid(before);
    const actual = applyInternalOperationStep(program, join, before)?.successor;
    assert.ok(actual);
    assertValid(actual);
    const prepared = prepare(program, before, join);
    assert.ok(prepared);
    assert.deepEqual(applyPreparedInternalLocalControl(program, before, prepared), actual);
    assert.deepEqual(actual.selectedBranchSets, [...retained].sort(compareSelectedBranchSets));
    assert.deepEqual(before, original);
    assert.notEqual(canonicalUniqueStateAtoms(prepared.footprint.reads), null);
    for (const placeId of extraInputs) {
      assert.equal(independent(prepared.footprint, {
        reads: [], writes: [{ kind: Atom.ControlToken, owner: second, placeId }],
      }), false);
    }
    assert.equal(independent(prepared.footprint, {
      reads: [], writes: [{ kind: Atom.SelectedBranch, owner: second, selectionKey: "Split" }],
    }), false);
  });
}

test("selection populations retain exact canonical keys and no occurrence-region owner", () => {
  const atom = { kind: Atom.SelectedBranchOwners, selectionKey: "\u{10000}" } as const;
  const earlier = { ...atom, selectionKey: "\uE000" };
  assert.deepEqual(canonicalUniqueStateAtoms([atom, earlier]), [earlier, atom]);
  assert.equal(canonicalUniqueStateAtoms([atom, atom]), null);
  assert.equal(independent({ reads: [atom], writes: [] }, { reads: [], writes: [{
    kind: Atom.OccurrenceRegion, region: { root, members: [root, first, second] },
  }] }), true);
});

for (const error of [false, true]) {
  test(`${error ? "Error" : "Terminate"} declares selected populations through retained root, descendant, and Call cleanup`, () => {
    const selectedProgram = error ? propagatedErrorProgram : terminateProgram;
    const started = applyStimulus(selectedProgram, initialState, startFor(selectedProgram, terminateInstanceId));
    const ready = admittedInternalPrefix(selectedProgram, started.state, terminateCompletion("UserTask_Trigger"),
      [], ["operation:EndEvent_Terminate"]);
    const operation = selectedProgram.operations.find(({ kind }) =>
      kind === (error ? SemanticOperationKind.ThrowError : SemanticOperationKind.TerminateScope));
    assert.ok(operation && "input" in operation);
    const regionOwner = ready.controlTokens.find(({ placeId }) => placeId === operation.input)?.owner;
    assert.ok(regionOwner);
    const descendant = { ...regionOwner, definitionScopeId: "scope:Descendant" };
    const calledRoot = { processInstanceId: "called-instance", definitionScopeId: "scope:Called", activation: 1 };
    // As in the regional census tests, these are cleanup-helper witnesses, not source-admission claims.
    const before: RuntimeState = {
      ...ready,
      scopeOccurrences: [...ready.scopeOccurrences, { id: descendant, parent: regionOwner }, { id: calledRoot, parent: null }],
      calledProcessOccurrences: [...ready.calledProcessOccurrences, {
        id: { processInstanceId: regionOwner.processInstanceId, elementId: "Call", activation: 1 },
        caller: descendant, calledRoot, calledProcessId: "Process_Called", returnOperationId: "operation:Return",
      }],
      selectedBranchSets: [record(regionOwner, "root-input"), record(descendant, "child-input"),
        record(calledRoot, "called-input"), { ...record(calledRoot, "other-input"), selectionKey: "Other" }],
    };
    const candidate = applyInternalOperationStep(selectedProgram, operation, before);
    assert.ok(candidate);
    assert.deepEqual(candidate.successor.selectedBranchSets, []);
    const write = error
      ? deriveInternalThrowErrorStateFootprint(selectedProgram, before, candidate)
      : deriveInternalTerminateScopeStateFootprint(selectedProgram, before, candidate);
    assert.ok(write);
    assert.deepEqual(write.writes.filter(({ kind }) => kind === Atom.SelectedBranchOwners), [
      { kind: Atom.SelectedBranchOwners, selectionKey: "Other" },
      { kind: Atom.SelectedBranchOwners, selectionKey: "Split" },
    ]);
    for (const selectionKey of ["Split", "Other", "Unrelated"]) {
      const read = { reads: [{ kind: Atom.SelectedBranchOwners, selectionKey } as const], writes: [] };
      assert.equal(independent(read, write), selectionKey === "Unrelated");
      assert.equal(independent(read, {
        ...write, writes: write.writes.filter(({ kind }) => kind !== Atom.SelectedBranchOwners),
      }), true);
    }
  });
}

function assertValid(value: RuntimeState): void {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.deepEqual(runtimeStateDefects(program, instanceId, value), []);
  assert.equal(isWellFormedRuntimeState(program, instanceId, value), true);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, value), null);
  assert.notEqual(projectCurrentControlPositions(program, value), null);
  assert.deepEqual(value.controlTokens, [...value.controlTokens].sort(compareTokenPlaces));
  assert.deepEqual(value.selectedBranchSets, [...value.selectedBranchSets].sort(compareSelectedBranchSets));
}

function state(tokens: RuntimeState["controlTokens"], records: RuntimeState["selectedBranchSets"]): RuntimeState {
  return {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId },
    scopeOccurrences: [{ id: root, parent: null }, { id: first, parent: root }, { id: second, parent: root }],
    scopeActivations: [{ elementId: childScope, count: 2 }],
    variables: { process: { bindings: [{ name: "takeB", value: { kind: VariableValueKind.Null } }] }, activities: [] },
    controlTokens: [...tokens].sort(compareTokenPlaces),
    selectedBranchSets: [...records].sort(compareSelectedBranchSets),
  };
}

function token(owner: ScopeOccurrenceId, placeId: string) {
  return { owner, placeId, multiplicity: 1 };
}

function record(owner: ScopeOccurrenceId, expectedInput: string): SelectedBranchSet {
  return { owner, selectionKey: "Split", expectedInputs: [expectedInput] };
}

function childProgram(): SemanticProcessProgram {
  const operations: SemanticOperation[] = inclusiveProgram.operations.map((operation) => {
    switch (operation.kind) {
      case SemanticOperationKind.Initiate:
        return { ...operation, output: "place:Flow_OuterStart" };
      case SemanticOperationKind.CompleteScope:
        return {
          ...operationBase("CompleteChild"), kind: SemanticOperationKind.CompleteScope,
          origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Sub" },
          scopeId: childScope, parentOutput: "place:Flow_OuterEnd",
        };
      case SemanticOperationKind.AwaitUserTask:
        return operation.origin.elementId === "Task_B" ? {
          ...operationBase("Task_B"), kind: SemanticOperationKind.Duplicate,
          input: "place:Flow_B", outputs: ["place:Flow_B_Join", "place:Flow_Extra"],
        } : operation;
      default:
        return operation;
    }
  });
  operations.push(
    {
      ...operationBase("Sub"), kind: SemanticOperationKind.EnterScope,
      input: "place:Flow_OuterStart", childEntry: "place:Flow_Start", childScopeId: childScope,
    },
    { ...operationBase("OuterEnd"), kind: SemanticOperationKind.ReachNoneEnd, input: "place:Flow_OuterEnd" },
    { ...operationBase("ExtraEnd"), kind: SemanticOperationKind.ReachNoneEnd, input: "place:Flow_Extra" },
    {
      ...operationBase("CompleteRoot"), kind: SemanticOperationKind.CompleteScope,
      origin: { kind: SemanticOriginKind.BpmnElement, elementId: inclusiveProgram.processId },
      scopeId: rootScope, parentOutput: null,
    },
  );
  operations.sort((left, right) => compareCanonicalStrings(left.id, right.id));
  const rootOperations = new Set(["operation:Start", "operation:Sub", "operation:OuterEnd", "operation:CompleteRoot"]);
  const rootPlaces = new Set(["place:Flow_OuterStart", "place:Flow_OuterEnd"]);
  const controlPlaces = [...inclusiveProgram.controlPlaces,
    ...["Flow_OuterStart", "Flow_OuterEnd", "Flow_Extra"].map(controlPlace),
  ].sort((left, right) => compareCanonicalStrings(left.id, right.id));
  return {
    ...inclusiveProgram, operations, controlPlaces,
    definitionScopes: [
      { id: childScope, parentScopeId: rootScope, originElementId: "Sub" },
      { id: rootScope, parentScopeId: null, originElementId: inclusiveProgram.processId },
    ],
    operationScopes: operations.map(({ id }) => ({ operationId: id, scopeId: rootOperations.has(id) ? rootScope : childScope })),
    controlPlaceScopes: controlPlaces.map(({ id }) => ({ controlPlaceId: id, scopeId: rootPlaces.has(id) ? rootScope : childScope })),
  };
}
