import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticOperationKind as Kind, SimpleBooleanExpressionKind,
  applyInternalOperationStep, compareCanonicalStrings, isWellFormedSemanticProcessProgram,
  projectCurrentControlPositions, projectOpenFlowNodeOccurrences, runtimeStateDefects, supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { InternalLocalControlOperation } from "../src/internal-transition-local-control-preparation.ts";
import { regionalKinds, regionalPairFixture } from "./internal-regional-pair-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { present } from "./inclusive-gateway-fixture.ts";

const { deriveInternalRegionalPreparation: regional, applyPreparedInternalRegionalTransition: applyRegional } = await import(
  new URL("../dist/internal-transition-regional-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-regional-preparation.ts");
const { deriveInternalLocalControlPreparation: localControl, applyPreparedInternalLocalControl: applyLocalControl } = await import(
  new URL("../dist/internal-transition-local-control-preparation.js", import.meta.url).href
) as typeof import("../src/internal-transition-local-control-preparation.ts");
const { internalTransitionStateFootprintsAreIndependent: independent, InternalTransitionStateAtomKind: Atom } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as typeof import("../src/internal-transition-footprint.ts");
const { compareTokenPlaces } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as typeof import("../src/semantic-process-state.ts");

const localKinds = [Kind.Duplicate, Kind.Synchronize, Kind.Choose, Kind.SelectMany, Kind.SynchronizeSelected] as const;
type LocalKind = typeof localKinds[number];

function controlOperations(kind: LocalKind): [InternalLocalControlOperation,
  InternalLocalControlOperation | Extract<SemanticOperation, { kind: typeof Kind.MergeExclusive }>] {
  const outputs = ["Side_A", "Side_B", "Side_Default"].map(controlPlace);
  const [first, second, fallback] = outputs;
  assert.ok(first !== undefined && second !== undefined && fallback !== undefined);
  const candidates = [first, second].map((place) => ({
    condition: { kind: SimpleBooleanExpressionKind.IsPresent, variable: "take-side" },
    output: place.id, expectedJoinInput: place.id, origin: place.origin,
  } as const));
  assert.ok(candidates[0] !== undefined && candidates[1] !== undefined);
  const branch = { output: fallback.id, expectedJoinInput: fallback.id, origin: fallback.origin };
  const fork = { ...operationBase("Side_Task"), input: "place:Side_Input" };
  const join = { ...operationBase("Side_Join"), output: "place:Side_Output" };
  switch (kind) {
    case Kind.Duplicate:
    case Kind.Synchronize:
      return [
        { ...fork, kind: Kind.Duplicate, outputs: [first.id, second.id] },
        { ...join, kind: Kind.Synchronize, inputs: [first.id, second.id] },
      ];
    case Kind.Choose: {
      const exclusive = candidates.map(({ expectedJoinInput: _join, ...candidate }) => candidate);
      assert.ok(exclusive[0] !== undefined && exclusive[1] !== undefined);
      return [
        { ...fork, kind, candidates: [exclusive[0], exclusive[1]],
          defaultOutput: fallback.id, defaultOrigin: fallback.origin },
        { ...join, kind: Kind.MergeExclusive, inputs: [first.id, second.id, fallback.id] },
      ];
    }
    case Kind.SelectMany:
    case Kind.SynchronizeSelected:
      return [
        { ...fork, kind: Kind.SelectMany, candidates: [candidates[0], candidates[1]],
          defaultBranch: branch, selectionKey: "Side_Task" },
        { ...join, kind: Kind.SynchronizeSelected,
          inputs: [first.id, second.id, fallback.id], selectionKey: "Side_Task" },
      ];
  }
}

function fixture(regionalKind: typeof regionalKinds[number], kind: LocalKind, bounded: boolean) {
  const base = regionalPairFixture(regionalKind, Kind.CompleteScope, bounded);
  const [fork, join] = controlOperations(kind);
  const root = base.program.operationScopes.find(({ operationId }) => operationId === base.side.id)?.scopeId;
  assert.ok(root !== undefined);
  const places = (kind === Kind.Duplicate || kind === Kind.Synchronize
    ? ["Side_A", "Side_B"] : ["Side_A", "Side_B", "Side_Default"]).map(controlPlace);
  const program: SemanticProcessProgram = { ...base.program,
    operations: [...base.program.operations.filter(({ id }) => id !== base.side.id), fork, join]
      .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    operationScopes: [...base.program.operationScopes, { operationId: join.id, scopeId: root }]
      .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
    controlPlaces: [...base.program.controlPlaces, ...places].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
    controlPlaceScopes: [...base.program.controlPlaceScopes,
      ...places.map(({ id }) => ({ controlPlaceId: id, scopeId: root }))]
      .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
  };
  let state: RuntimeState = { ...base.state,
    variables: { ...base.state.variables, process: { bindings: [present("take-side")] } } };
  const selected = kind === Kind.Synchronize || kind === Kind.SynchronizeSelected ? join : fork;
  assert.ok(selected.kind !== Kind.MergeExclusive);
  if (selected === join) {
    const step = applyInternalOperationStep(program, fork, state);
    assert.ok(step !== null);
    state = step.successor;
  }
  return { ...base, program, state, selected };
}

function valid(program: SemanticProcessProgram, state: RuntimeState, instanceId: string) {
  assert.equal(isWellFormedSemanticProcessProgram(program), true);
  assert.deepEqual(runtimeStateDefects(program, instanceId, state), []);
  assert.notEqual(projectCurrentControlPositions(program, state), null);
  assert.notEqual(projectOpenFlowNodeOccurrences(program, state), null);
}

for (const regionalKind of regionalKinds) for (const kind of localKinds) {
  for (const bounded of regionalKind === Kind.CompleteScope ? [false, true] : [false]) {
    test(`${regionalKind}/${kind}${bounded ? "/bounded" : ""} preserves complete regional preparation`, () => {
      const { program, state, selected, branches, start } = fixture(regionalKind, kind, bounded);
      valid(program, state, start.instanceId);
      assert.equal(supportsSemanticProcessExecution(start, program), false);
      const first = localControl(program, state, selected);
      const second = regional(program, state, branches[0]!.selected);
      assert.ok(first !== null && second !== null);
      assert.equal(independent(first.footprint, second.footprint), true);
      const after = applyLocalControl(program, state, first);
      assert.ok(after !== null);
      assert.deepEqual(after, applyInternalOperationStep(program, selected, state)?.successor);
      valid(program, after, start.instanceId);
      assert.deepEqual(regional(program, after, branches[0]!.selected), second);
      const result = applyRegional(program, after, second);
      assert.ok(result !== null);
      valid(program, result, start.instanceId);
      const regionalFirst = applyRegional(program, state, second);
      assert.ok(regionalFirst !== null);
      valid(program, regionalFirst, start.instanceId);
      assert.deepEqual(localControl(program, regionalFirst, selected), first);
      assert.deepEqual(applyLocalControl(program, regionalFirst, first), result);
    });
  }
}

for (const kind of [Kind.ThrowError, Kind.TerminateScope] as const) {
  test(`${kind} rejects a contained local fork even if dependency omission claims independence`, () => {
    const { program: base, state: original, branches, start } = regionalPairFixture(kind, Kind.CompleteScope);
    const operation = branches[0]!.selected;
    assert.ok(operation.kind === Kind.ThrowError || operation.kind === Kind.TerminateScope);
    const scopeId = branches[0]!.scopeId;
    const sibling = base.operations.find(({ id }) => id === `operation:${branches[0]!.name}_Sibling_Task`);
    assert.ok(sibling?.kind === Kind.AwaitUserTask);
    const wait = original.userTaskWaits.find(({ id }) => id.elementId === sibling.task.elementId);
    assert.ok(wait !== undefined);
    const added = controlPlace("Inside_Additional");
    const fork = { ...operationBase(sibling.origin.elementId), kind: Kind.Duplicate,
      input: sibling.input, outputs: [sibling.output, added.id].sort(compareCanonicalStrings) } as const;
    const ending = { ...operationBase("Inside_End"), kind: Kind.ReachNoneEnd, input: added.id } as const;
    const program: SemanticProcessProgram = { ...base,
      operations: [...base.operations.filter(({ id }) => id !== sibling.id), fork, ending]
        .sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      operationScopes: [...base.operationScopes, { operationId: ending.id, scopeId }]
        .sort((a, b) => compareCanonicalStrings(a.operationId, b.operationId)),
      controlPlaces: [...base.controlPlaces, added].sort((a, b) => compareCanonicalStrings(a.id, b.id)),
      controlPlaceScopes: [...base.controlPlaceScopes, { controlPlaceId: added.id, scopeId }]
        .sort((a, b) => compareCanonicalStrings(a.controlPlaceId, b.controlPlaceId)),
    };
    const state: RuntimeState = { ...original, userTaskWaits: original.userTaskWaits.filter((entry) => entry !== wait),
      controlTokens: [...original.controlTokens, { placeId: sibling.input, owner: wait.owner, multiplicity: 1 }]
        .sort(compareTokenPlaces) };
    valid(program, state, start.instanceId);
    assert.equal(supportsSemanticProcessExecution(start, program), false);
    const first = localControl(program, state, fork);
    const second = regional(program, state, operation);
    assert.ok(first !== null && second !== null);
    assert.equal(independent(first.footprint, second.footprint), false);
    const retained = (atom: typeof second.footprint.reads[number]) => atom.kind !== Atom.OccurrenceRegion &&
      !(atom.kind === Atom.TokenOwners && atom.placeId === sibling.input);
    const omitted = { reads: second.footprint.reads.filter(retained), writes: second.footprint.writes.filter(retained) };
    assert.equal(independent(first.footprint, omitted), true);
    const after = applyLocalControl(program, state, first);
    assert.ok(after !== null);
    valid(program, after, start.instanceId);
    assert.notDeepEqual(regional(program, after, operation), second);
    assert.equal(applyRegional(program, after, second), null);
    assert.equal(applyRegional(program, state, { ...second, footprint: omitted }), null);
  });
}
