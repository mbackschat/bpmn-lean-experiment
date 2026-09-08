import assert from "node:assert/strict";
import test from "node:test";
import {
  CommandOutcome,
  ControlStateKind,
  SemanticOperationKind,
  SemanticOriginKind,
  SemanticTransitionKind,
  SimpleBooleanExpressionKind,
  applyInternalOperationStep,
  applyStimulus,
  compareCanonicalStrings,
  initialState,
  projectControlPositionDelta,
  projectFlowNodeOccurrenceLifecycleDelta,
  runtimeStateDefects,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { InternalLocalControlOperation, PreparedInternalLocalControl } from "../src/internal-transition-local-control-preparation.ts";
import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";
import { completionStimulus, parallelProgram, startStimulus } from "./parallel-fork-join-fixture.ts";
import { inclusiveCompletion, inclusiveProgram, inclusiveStart, present } from "./inclusive-gateway-fixture.ts";
import { controlPlace, operationBase } from "./semantic-program-parts.ts";
import { rootScopedProgram, rootScopeOccurrence } from "./root-scope-fixture.ts";

type PreparationModule = typeof import("../src/internal-transition-local-control-preparation.ts");
const preparation = await import(
  new URL("../dist/internal-transition-local-control-preparation.js", import.meta.url).href
) as PreparationModule;
type PatchModule = typeof import("../src/internal-transition-local-control-patch.ts");
const { applyInternalLocalControlPatch: applyPatch, deriveInternalLocalControlPositionDelta, InternalSelectedBranchPatchKind } = await import(
  new URL("../dist/internal-transition-local-control-patch.js", import.meta.url).href
) as PatchModule;
type PublicationModule = typeof import("../src/internal-publication-template.ts");
const { instantiateInternalPublicationBatch } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as PublicationModule;
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
const { internalTransitionStateFootprintsAreIndependent: independent, InternalTransitionStateAtomKind: Atom } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const { deriveInternalLocalControlPreparation: prepare, applyPreparedInternalLocalControl: applyPrepared } = preparation;
type StateModule = typeof import("../src/semantic-process-state.ts");
const { compareTokenPlaces: compareControlTokens } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as StateModule;
const duplicate = parallelProgram.operations.find((operation) =>
  operation.kind === SemanticOperationKind.Duplicate
);
assert.ok(duplicate?.kind === SemanticOperationKind.Duplicate);
const beforeFork = admittedInternalPrefix(
  parallelProgram, initialState, startStimulus(),
  ["operation:StartEvent_1"], ["operation:Gateway_Fork"],
);

test("local-control preparation retains an executable patch and numbering-free publication", () => {
  const prepared = preparation.deriveInternalDuplicatePreparation(parallelProgram, beforeFork, duplicate);
  assert.notEqual(prepared, null);
  assert.ok(Object.hasOwn(prepared!, "patch"), "complete predecessor preparation must retain the local patch");
  assert.ok(Object.hasOwn(prepared!, "publicationTemplate"));
});

const parallelStarted = applyStimulus(parallelProgram, initialState, startStimulus());
assert.equal(parallelStarted.outcome, CommandOutcome.Committed);
const afterA = applyStimulus(parallelProgram, parallelStarted.state, completionStimulus("UserTask_A"));
assert.equal(afterA.outcome, CommandOutcome.Committed);
const beforeJoin = admittedInternalPrefix(parallelProgram, afterA.state, completionStimulus("UserTask_B"), [], ["operation:Gateway_Join"]);
const beforeSplit = admittedInternalPrefix(inclusiveProgram, initialState,
  inclusiveStart([present("takeA"), present("takeB")]), ["operation:Start"], ["operation:Split"]);
const inclusiveStarted = applyStimulus(inclusiveProgram, initialState, inclusiveStart([present("takeA"), present("takeB")]));
assert.equal(inclusiveStarted.outcome, CommandOutcome.Committed);
const inclusiveAfterA = applyStimulus(inclusiveProgram, inclusiveStarted.state, inclusiveCompletion("Task_A"));
assert.equal(inclusiveAfterA.outcome, CommandOutcome.Committed);
const beforeSelectedJoin = admittedInternalPrefix(inclusiveProgram, inclusiveAfterA.state,
  inclusiveCompletion("Task_B"), [], ["operation:Join"]);

for (const [program, before, id] of [
  [parallelProgram, beforeFork, "operation:Gateway_Fork"],
  [parallelProgram, beforeJoin, "operation:Gateway_Join"],
  [inclusiveProgram, beforeSplit, "operation:Split"],
  [inclusiveProgram, beforeSelectedJoin, "operation:Join"],
] as const) {
  test(`${id} patch and template equal the accepted operation on the admitted fixture`, () => {
    const operation = program.operations.find((candidate) => candidate.id === id) as InternalLocalControlOperation;
    assertExactStep(program, before, operation);
    const prepared = required(program, before, operation);
    assert.equal(containsNumbering(prepared), false);
    const existingOutputs: RuntimeState = {
      ...before,
      controlTokens: [
        ...before.controlTokens,
        ...prepared.patch.produced.map((placeId) => ({ placeId, owner: prepared.owner, multiplicity: 4 })),
      ].sort(compareControlTokens),
    };
    const repeated = assertExactStep(program, existingOutputs, operation);
    for (const placeId of prepared.patch.produced) {
      assert.equal(repeated.controlTokens.find((token) => token.placeId === placeId)?.multiplicity, 5);
    }
    assert.equal(Object.hasOwn(assertExactStep(program, before, operation), "compensationTriggers"),
      Object.hasOwn(before, "compensationTriggers"));
    const presentEmpty = { ...existingOutputs, compensationTriggers: [], compensationHandlerEffectWaits: [] };
    const rawAfter = applyPrepared(program, presentEmpty, required(program, presentEmpty, operation));
    assert.notEqual(rawAfter, null);
    assert.deepEqual(rawAfter, applyInternalOperationStep(program, operation, presentEmpty)?.successor);
    assert.equal(Object.hasOwn(rawAfter!, "compensationTriggers"), true);
    assert.deepEqual(rawAfter!.compensationTriggers, []);
  });
}

test("Inclusive selected-set insertion and removal preserve exact unrelated keyed records", () => {
  for (const [before, id] of [[beforeSplit, "operation:Split"], [beforeSelectedJoin, "operation:Join"]] as const) {
    const operation = inclusiveProgram.operations.find((candidate) => candidate.id === id) as InternalLocalControlOperation;
    const original = required(inclusiveProgram, before, operation);
    const unrelated = { owner: original.owner, selectionKey: "other-selection", expectedInputs: ["place:Flow_Default_Join"] as [string] };
    const augmented = { ...before, selectedBranchSets: [...before.selectedBranchSets, unrelated] };
    const after = assertExactStep(inclusiveProgram, augmented, operation);
    assert.ok(after.selectedBranchSets.includes(unrelated));
    assert.equal(after.selectedBranchSets.filter(({ selectionKey }) => selectionKey === "Split").length,
      operation.kind === SemanticOperationKind.SelectMany ? 1 : 0);
  }
});

const kinds = [SemanticOperationKind.Duplicate, SemanticOperationKind.Synchronize,
  SemanticOperationKind.Choose, SemanticOperationKind.SelectMany] as const;
type FramedKind = typeof kinds[number];

function operation(kind: FramedKind, suffix: string): InternalLocalControlOperation {
  const base = operationBase(`Gateway_${suffix}`);
  const place = (part: string) => `place:Flow_${suffix}_${part}`;
  const branch = (part: string) => ({
    condition: { kind: SimpleBooleanExpressionKind.IsPresent, variable: "shared-condition" },
    output: place(part), expectedJoinInput: place(`${part}_Join`),
    origin: { kind: SemanticOriginKind.BpmnSequenceFlow, elementId: `Flow_${suffix}_${part}` },
  } as const);
  switch (kind) {
    case SemanticOperationKind.Duplicate:
      return { ...base, kind, input: place("Input"), outputs: [place("A"), place("B")] };
    case SemanticOperationKind.Synchronize:
      return { ...base, kind, inputs: [place("Input"), place("Other")], output: place("A") };
    case SemanticOperationKind.Choose:
      return { ...base, kind, input: place("Input"), candidates: [branch("A"), branch("B")],
        defaultOutput: place("Default"), defaultOrigin: branch("Default").origin };
    case SemanticOperationKind.SelectMany:
      return { ...base, kind, input: place("Input"), candidates: [branch("A"), branch("B")],
        defaultBranch: branch("Default"), selectionKey: `Gateway_${suffix}` };
  }
}

function pair(leftKind: FramedKind, rightKind: FramedKind) {
  const left = operation(leftKind, "Left");
  const right = operation(rightKind, "Right");
  const program = rootScopedProgram({
    ...parallelProgram,
    controlPlaces: ["Left", "Right"].flatMap((suffix) =>
      ["Input", "Other", "A", "B", "Default", "A_Join", "B_Join", "Default_Join"].map((part) =>
        controlPlace(`Flow_${suffix}_${part}`)
      )
    ).sort(({ id: left }, { id: right }) => compareCanonicalStrings(left, right)),
    operations: [left, right],
  });
  const owner = rootScopeOccurrence(program.processId, "pair-instance");
  const inputs = (op: InternalLocalControlOperation) =>
    op.kind === SemanticOperationKind.Synchronize || op.kind === SemanticOperationKind.SynchronizeSelected ? op.inputs : [op.input];
  const state: RuntimeState = {
    ...initialState,
    control: { kind: ControlStateKind.Running, instanceId: owner.processInstanceId },
    scopeOccurrences: [{ id: owner, parent: null }],
    scopeActivations: [{ elementId: owner.definitionScopeId, count: 1 }],
    controlTokens: [left, right].flatMap(inputs).map((placeId) => ({ placeId, owner, multiplicity: 2 })).sort(compareControlTokens),
    variables: { ...initialState.variables, process: { bindings: [present("shared-condition")] } },
    logicalTimeMs: 123,
  };
  return { program, state, left, right };
}

for (const leftKind of kinds) for (const rightKind of kinds) {
  test(`${leftKind}/${rightKind} retain opposite complete preparations and both exact execution orders`, () => {
    const { program, state, left, right } = pair(leftKind, rightKind);
    const leftPrepared = required(program, state, left);
    const rightPrepared = required(program, state, right);
    assert.equal(independent(leftPrepared.footprint, rightPrepared.footprint), true);
    const afterLeft = assertExactStep(program, state, left);
    const afterRight = assertExactStep(program, state, right);
    assert.deepEqual(required(program, afterLeft, right), rightPrepared);
    assert.deepEqual(required(program, afterRight, left), leftPrepared);
    const leftRight = applyPrepared(program, afterLeft, rightPrepared);
    const rightLeft = applyPrepared(program, afterRight, leftPrepared);
    assert.notEqual(leftRight, null);
    assert.deepEqual(leftRight, rightLeft);
    assert.deepEqual(leftRight, assertExactStep(program, afterLeft, right));
    assert.deepEqual(rightLeft, assertExactStep(program, afterRight, left));
    assert.deepEqual(instantiateInternalPublicationBatch("batch", 17, [rightPrepared.publicationTemplate, leftPrepared.publicationTemplate]),
      instantiateInternalPublicationBatch("batch", 17, [leftPrepared.publicationTemplate, rightPrepared.publicationTemplate]));
  });
}

test("conditional preparations retain read/read sharing and refuse writes to evaluated Process data", () => {
  const { program, state, left, right } = pair(SemanticOperationKind.Choose, SemanticOperationKind.SelectMany);
  const prepared = required(program, state, left);
  assert.equal(independent(prepared.footprint, required(program, state, right).footprint), true);
  assert.equal(independent(prepared.footprint, { reads: [], writes: [{ kind: Atom.ProcessVariable, name: "shared-condition" }] }), false);
  const changed = { ...state, variables: { ...state.variables, process: { bindings: [] } } };
  assert.equal(applyPrepared(program, changed, prepared), null);
  assertExactStep(program, changed, left);
  assertExactStep(program, changed, right);
});

test("checked local apply rejects forged complete preparation fields and stale output provenance", () => {
  const { program, state, left } = pair(SemanticOperationKind.Choose, SemanticOperationKind.Duplicate);
  const prepared = required(program, state, left);
  const mutations: PreparedInternalLocalControl[] = [
    { ...prepared, owner: { ...prepared.owner, activation: 9 } },
    { ...prepared, alternative: { ...prepared.alternative, operationId: "forged" } },
    { ...prepared, operation: { ...prepared.operation, origin: { ...prepared.operation.origin, elementId: "forged" } } },
    { ...prepared, branchResult: null },
    { ...prepared, footprint: { ...prepared.footprint, reads: [] } },
    { ...prepared, patch: { ...prepared.patch, produced: [] } },
    { ...prepared, publicationTemplate: { ...prepared.publicationTemplate, lifecycle: { started: [], ended: [] } } },
    { ...prepared, publicationTemplate: { ...prepared.publicationTemplate,
      record: { ...prepared.publicationTemplate.record, logicalTimeMs: 0 } } },
  ];
  for (const mutation of mutations) assert.equal(applyPrepared(program, state, mutation), null);
  const output = prepared.patch.produced[0];
  assert.ok(output !== undefined);
  const changedProgram = { ...program, controlPlaces: program.controlPlaces.map((place) =>
    place.id === output ? { ...place, origin: { ...place.origin, elementId: "Flow_Changed" } } : place
  ) };
  assert.equal(applyPrepared(changedProgram, state, prepared), null);
  assert.equal(prepare({ ...program, controlPlaces: program.controlPlaces.filter(({ id }) => id !== output) }, state, left), null);
});

test("foreign-owner input insertion changes the selected owner without changing its bucket", () => {
  const prepared = required(parallelProgram, beforeFork, duplicate);
  const foreign = { ...prepared.owner, activation: prepared.owner.activation + 1 };
  const changed = { ...beforeFork, controlTokens: [...beforeFork.controlTokens,
    { placeId: duplicate.input, owner: foreign, multiplicity: 1 }].sort(compareControlTokens) };
  assert.equal(prepare(parallelProgram, changed, duplicate), null);
  assert.equal(applyPrepared(parallelProgram, changed, prepared), null);
  assert.equal(independent(prepared.footprint, { reads: [], writes: [{ kind: Atom.TokenOwners, placeId: duplicate.input }] }), false);
});

test("signed token units cancel in publication without dropping the consumed and produced patch units", () => {
  const prepared = required(parallelProgram, beforeFork, duplicate);
  const patch = { ...prepared.patch, consumed: [duplicate.input], produced: [duplicate.input],
    selectedBranch: { kind: InternalSelectedBranchPatchKind.Preserve } } as const;
  assert.deepEqual(deriveInternalLocalControlPositionDelta(parallelProgram, patch), {
    consumedTokens: [], producedTokens: [], enteredScopes: [], exitedScopes: [],
  });
  assert.deepEqual(applyPatch(beforeFork, patch), beforeFork);
});

test("private selected-join preparation retains repeated token units with one bucket dependency", () => {
  const operation = inclusiveProgram.operations.find((candidate) => candidate.id === "operation:Join");
  assert.ok(operation?.kind === SemanticOperationKind.SynchronizeSelected);
  const record = beforeSelectedJoin.selectedBranchSets[0]!;
  const input = record.expectedInputs[0];
  const before: RuntimeState = {
    ...beforeSelectedJoin,
    selectedBranchSets: [{ ...record, expectedInputs: [input, input] }],
    controlTokens: beforeSelectedJoin.controlTokens.map((token) =>
      token.placeId === input ? { ...token, multiplicity: 2 } : token),
  };
  assert.deepEqual(runtimeStateDefects(inclusiveProgram, record.owner.processInstanceId, before), []);
  assert.notEqual(applyInternalOperationStep(inclusiveProgram, operation, before), null);
  const after = assertExactStep(inclusiveProgram, before, operation);
  const prepared = required(inclusiveProgram, before, operation);
  assert.deepEqual(prepared.patch.consumed, [input, input]);
  for (const atoms of [prepared.footprint.reads, prepared.footprint.writes]) {
    assert.equal(atoms.filter((atom) => atom.kind === Atom.ControlToken && atom.placeId === input).length, 1);
  }
  assert.equal(after.controlTokens.some((token) => token.placeId === input), false);
});

test("private selected-join preparation cancels a consumed and reproduced bucket only in publication", () => {
  const operation = inclusiveProgram.operations.find((candidate) => candidate.id === "operation:Join");
  assert.ok(operation?.kind === SemanticOperationKind.SynchronizeSelected);
  const record = beforeSelectedJoin.selectedBranchSets[0]!;
  const before: RuntimeState = {
    ...beforeSelectedJoin,
    selectedBranchSets: [{ ...record, expectedInputs: [operation.output] }],
    controlTokens: [...beforeSelectedJoin.controlTokens,
      { placeId: operation.output, owner: record.owner, multiplicity: 1 }].sort(compareControlTokens),
  };
  assert.deepEqual(runtimeStateDefects(inclusiveProgram, record.owner.processInstanceId, before), []);
  assert.notEqual(applyInternalOperationStep(inclusiveProgram, operation, before), null);
  const after = assertExactStep(inclusiveProgram, before, operation);
  const prepared = required(inclusiveProgram, before, operation);
  assert.deepEqual(prepared.patch.consumed, [operation.output]);
  assert.deepEqual(prepared.patch.produced, [operation.output]);
  assert.deepEqual(after.controlTokens, before.controlTokens);
  assert.deepEqual(prepared.publicationTemplate.record.positionDelta, {
    consumedTokens: [], producedTokens: [], enteredScopes: [], exitedScopes: [],
  });
});

test("private selected-join preparation refuses more consumed units than the bucket contains", () => {
  const operation = inclusiveProgram.operations.find((candidate) => candidate.id === "operation:Join");
  assert.ok(operation?.kind === SemanticOperationKind.SynchronizeSelected);
  const record = beforeSelectedJoin.selectedBranchSets[0]!;
  const input = record.expectedInputs[0];
  const before: RuntimeState = {
    ...beforeSelectedJoin,
    selectedBranchSets: [{ ...record, expectedInputs: [input, input] }],
  };
  assert.deepEqual(runtimeStateDefects(inclusiveProgram, record.owner.processInstanceId, before), []);
  assert.notEqual(applyInternalOperationStep(inclusiveProgram, operation, before), null);
  assert.equal(prepare(inclusiveProgram, before, operation), null);
});

test("preparation refuses an output increment that has no safe public multiplicity", () => {
  const prepared = required(parallelProgram, beforeFork, duplicate);
  const placeId = duplicate.outputs[0]!;
  const before = { ...beforeFork, controlTokens: [...beforeFork.controlTokens,
    { placeId, owner: prepared.owner, multiplicity: Number.MAX_SAFE_INTEGER }].sort(compareControlTokens) };
  const step = applyInternalOperationStep(parallelProgram, duplicate, before);
  assert.notEqual(step, null);
  assert.equal(projectControlPositionDelta(parallelProgram, before, step!.successor), null);
  assert.equal(prepare(parallelProgram, before, duplicate), null);
});

function required(program: SemanticProcessProgram, state: RuntimeState, operation: InternalLocalControlOperation) {
  const prepared = prepare(program, state, operation);
  assert.notEqual(prepared, null);
  return prepared!;
}

function assertExactStep(program: SemanticProcessProgram, before: RuntimeState, operation: InternalLocalControlOperation) {
  const prepared = required(program, before, operation);
  const step = applyInternalOperationStep(program, operation, before);
  assert.notEqual(step, null);
  assert.ok(step?.owner !== null && step?.owner !== undefined);
  const owner = step.owner;
  const after = applyPatch(before, prepared.patch);
  assert.deepEqual(after, step!.successor);
  assert.deepEqual(applyPrepared(program, before, prepared), after);
  const delta = projectControlPositionDelta(program, before, step!.successor);
  assert.notEqual(delta, null, "failed public projection must not count as equal publication");
  const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(program, before, step!.successor,
    { kind: "internal", operation, owner }, "nonzero-command", 29);
  assert.notEqual(lifecycle, null);
  const publications = instantiateInternalPublicationBatch("nonzero-command", 29, [prepared.publicationTemplate]);
  assert.notEqual(publications, null);
  assert.deepEqual(publications![0]?.record, {
    logicalTimeMs: before.logicalTimeMs,
    transition: { kind: SemanticTransitionKind.InternalOperation, operationId: operation.id,
      operationKind: operation.kind, origin: operation.origin, owner: step!.owner },
    positionDelta: delta,
  });
  assert.deepEqual(publications![0]?.lifecycle, lifecycle);
  return after;
}

function containsNumbering(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    ["commandId", "transitionIndex", "localIndex"].includes(key) || containsNumbering(child)
  );
}
