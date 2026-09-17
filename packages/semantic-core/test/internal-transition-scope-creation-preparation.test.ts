import assert from "node:assert/strict";
import test from "node:test";
import {
  initialState, SemanticOperationKind, SemanticTransitionKind,
  applyInternalOperationStep, projectControlPositionDelta,
  projectFlowNodeOccurrenceLifecycleDelta, isWellFormedSemanticProcessProgram,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";
import type { InternalScopeCreationOperation, PreparedInternalScopeCreation } from "../src/internal-transition-scope-creation-preparation.ts";
import { admittedInternalPrefix } from "./internal-operation-prefix-fixture.ts";
import { callActivityProgram, callActivityStart } from "./call-activity-fixture.ts";
import { program as scopeProgram, startStimulus } from "./embedded-subprocess-fixture.ts";

type PreparationModule = typeof import("../src/internal-transition-scope-creation-preparation.ts");
const preparation = await import(new URL("../dist/internal-transition-scope-creation-preparation.js", import.meta.url).href) as PreparationModule;
const call = callActivityProgram.operations.find((operation) => operation.kind === SemanticOperationKind.InvokeProcess)!;
const beforeCall = admittedInternalPrefix(callActivityProgram, initialState, callActivityStart(),
  ["operation:Start_Caller"], ["operation:Call:é"]);
assert.equal(isWellFormedSemanticProcessProgram(scopeProgram), true);
const child = scopeProgram.operations.find((operation) => operation.kind === SemanticOperationKind.EnterScope)!;
assert.ok(child.kind === SemanticOperationKind.EnterScope);
const beforeChild = admittedInternalPrefix(scopeProgram, initialState, startStimulus(),
  ["operation:StartEvent_Outer"], ["operation:SubProcess_Work"]);
type PatchModule = typeof import("../src/internal-transition-scope-creation-patch.ts");
const { applyInternalScopeCreationPatch: applyPatch } = await import(
  new URL("../dist/internal-transition-scope-creation-patch.js", import.meta.url).href
) as PatchModule;
type PublicationModule = typeof import("../src/internal-publication-template.ts");
const { instantiateInternalPublicationBatch, InternalPublicationTemplateAnchorKind: Anchor } = await import(
  new URL("../dist/internal-publication-template.js", import.meta.url).href
) as PublicationModule;
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
const { internalTransitionStateFootprintsAreIndependent: independent, InternalTransitionStateAtomKind: Atom } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
type StateModule = typeof import("../src/semantic-process-state.ts");
const { compareTokenPlaces } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as StateModule;
const { deriveInternalScopeCreationPreparation: prepare, applyPreparedInternalScopeCreation: applyPrepared } = preparation;

test("admitted Call prefix retains its complete patch and publication", () => {
  const prepared = preparation.deriveInternalInvokeProcessPreparation(callActivityProgram, beforeCall, call);
  assert.notEqual(prepared, null);
  assert.ok(Object.hasOwn(prepared!, "patch"), "complete scope creation must retain its local patch");
  assert.ok(Object.hasOwn(prepared!, "publicationTemplate"));
});

for (const [program, state, operation] of [
  [scopeProgram, beforeChild, child], [callActivityProgram, beforeCall, call],
] as const) {
  test(`${operation.kind} admitted prefix patch and full publication equal the runtime step`, () => {
    assertExactStep(program, state, operation);
    const before = { ...state, logicalTimeMs: 491,
      callActivations: [...state.callActivations, { elementId: "unrelated:😀", count: 77 }],
      scopeActivations: [...state.scopeActivations, { elementId: "unrelated:é", count: 91 }],
      endOccurrences: 18 };
    const copy = structuredClone(before);
    const after = assertExactStep(program, before, operation);
    assert.deepEqual(before, copy);
    assert.ok(after.callActivations.some(({ elementId, count }) => elementId === "unrelated:😀" && count === 77));
    assert.ok(after.scopeActivations.some(({ elementId, count }) => elementId === "unrelated:é" && count === 91));
    assert.equal(after.endOccurrences, 18);
    assert.equal(Object.hasOwn(after, "compensationTriggers"), Object.hasOwn(before, "compensationTriggers"));
    const present = { ...before, compensationTriggers: [], compensationHandlerEffectWaits: [] };
    const presentAfter = assertRawStep(program, present, operation).after;
    assert.equal(Object.hasOwn(presentAfter, "compensationTriggers"), true);
    assert.deepEqual(presentAfter.compensationTriggers, []);
    const { compensationTriggers: _triggers, compensationHandlerEffectWaits: _waits, ...absent } = present;
    const absentAfter = assertExactStep(program, absent, operation);
    assert.equal(Object.hasOwn(absentAfter, "compensationTriggers"), false);
    assert.equal(Object.hasOwn(absentAfter, "compensationHandlerEffectWaits"), false);
    assert.equal(containsNumbering(required(program, state, operation)), false);
  });

  test(`${operation.kind} refuses forged complete preparation despite unchanged operation ID`, () => {
    const prepared = required(program, state, operation);
    const started = prepared.publicationTemplate.lifecycle.started[0]!;
    const mutations: PreparedInternalScopeCreation[] = [
      { ...prepared, owner: { ...prepared.owner, activation: 99 } },
      { ...prepared, footprint: { ...prepared.footprint, reads: [] } },
      { ...prepared, patch: { ...prepared.patch, owner: { ...prepared.owner, activation: 99 } } },
      { ...prepared, patch: { ...prepared.patch, counter: { ...prepared.patch.counter, count: 99 } } },
      { ...prepared, publicationTemplate: { ...prepared.publicationTemplate,
        record: { ...prepared.publicationTemplate.record, logicalTimeMs: 99 } } },
      { ...prepared, publicationTemplate: { ...prepared.publicationTemplate,
        lifecycle: { started: [{ ...started, elementId: "forged-anchor-element" }], ended: [] } } },
      { ...prepared, publicationTemplate: { ...prepared.publicationTemplate,
        lifecycle: { started: [{ ...started, anchor: started.anchor.kind === Anchor.CallActivity
          ? { ...started.anchor, id: { ...started.anchor.id, activation: 99 } }
          : { kind: Anchor.Scope, id: { ...prepared.patch.scope.id, activation: 99 } } }], ended: [] } } },
      { ...prepared, publicationTemplate: { ...prepared.publicationTemplate,
        lifecycle: { started: [], ended: [] } } },
    ];
    for (const forged of mutations) assert.equal(applyPrepared(program, state, forged), null);
    assert.equal(applyPrepared(program, { ...state, logicalTimeMs: state.logicalTimeMs + 1 }, prepared), null);
    const key = operation.kind === SemanticOperationKind.EnterScope ? "scopeActivations" : "callActivations";
    const changed = { ...state, [key]: [...state[key].filter(({ elementId }) => elementId !== prepared.patch.counter.elementId),
      { elementId: prepared.patch.counter.elementId, count: 8 }] };
    assert.notEqual(prepare(program, changed, operation), null);
    assert.equal(applyPrepared(program, changed, prepared), null);
  });

  test(`${operation.kind} refuses ambiguous identity, bad provenance, unsafe issuance and snapshots`, () => {
    const prepared = required(program, state, operation);
    const entry = prepared.patch.entry;
    const definition = program.definitionScopes.find(({ id }) => id === prepared.patch.scope.id.definitionScopeId)!;
    const place = program.controlPlaces.find(({ id }) => id === entry)!;
    const malformedPrograms: SemanticProcessProgram[] = [
      { ...program, operations: [...program.operations, { ...operation, origin: { ...operation.origin, elementId: "other" } }] },
      { ...program, operationScopes: [...program.operationScopes, { operationId: operation.id, scopeId: "other" }] },
      { ...program, definitionScopes: [...program.definitionScopes, { ...definition, originElementId: "other" }] },
      { ...program, definitionScopes: [...program.definitionScopes, { ...definition, id: "other" }] },
      { ...program, definitionScopes: program.definitionScopes.map((candidate) => candidate === definition
        ? { ...candidate, originElementId: "incorrect-definition-origin" } : candidate) },
      { ...program, controlPlaces: [...program.controlPlaces, { ...place, origin: { ...place.origin, elementId: "other" } }] },
      { ...program, controlPlaces: [...program.controlPlaces, { ...place, id: "alias" }] },
      { ...program, controlPlaceScopes: [...program.controlPlaceScopes, { controlPlaceId: entry, scopeId: "other" }] },
      { ...program, controlPlaceScopes: program.controlPlaceScopes.map((binding) => binding.controlPlaceId === entry
        ? { ...binding, scopeId: prepared.owner.definitionScopeId } : binding) },
      { ...program, compensationEventSubProcessSnapshots: { targets: [], limits: { maxRecords: 1, maxCanonicalBytes: 1024 } } },
    ];
    for (const malformed of malformedPrograms) assert.equal(prepare(malformed, state, operation), null);
    const key = operation.kind === SemanticOperationKind.EnterScope ? "scopeActivations" : "callActivations";
    const counters = state[key].filter(({ elementId }) => elementId !== prepared.patch.counter.elementId);
    for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER, Infinity, NaN]) {
      assert.equal(prepare(program, { ...state, [key]: [...counters, { elementId: prepared.patch.counter.elementId, count }] }, operation), null);
    }
    assert.equal(prepare(program, { ...state, [key]: [...counters,
      { elementId: prepared.patch.counter.elementId, count: 2 }, { elementId: prepared.patch.counter.elementId, count: 3 }] }, operation), null);
    for (const logicalTimeMs of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal(prepare(program, { ...state, logicalTimeMs }, operation), null);
    }
    const ownerRecord = state.scopeOccurrences.find(({ id }) => id.definitionScopeId === prepared.owner.definitionScopeId)!;
    assert.equal(prepare(program, { ...state, scopeOccurrences: [...state.scopeOccurrences,
      { ...ownerRecord, parent: prepared.owner }] }, operation), null);
    assert.equal(prepare(program, { ...state, controlTokens: [...state.controlTokens,
      { placeId: entry, owner: prepared.patch.scope.id, multiplicity: 1 }] }, operation), null);
    assert.equal(prepare(program, { ...state, scopeOccurrences: [...state.scopeOccurrences, prepared.patch.scope] }, operation), null);
  });

  test(`${operation.kind} protects token-owner census and rejects repeated issuance`, () => {
    const prepared = required(program, state, operation);
    const changed = { ...state, controlTokens: [...state.controlTokens,
      { placeId: operation.input, owner: { ...prepared.owner, activation: 99 }, multiplicity: 1 }] };
    assert.equal(prepare(program, changed, operation), null);
    assert.equal(applyPrepared(program, changed, prepared), null);
    assert.equal(independent(prepared.footprint, { reads: [], writes: [{ kind: Atom.TokenOwners, placeId: operation.input }] }), false);
    const after = assertExactStep(program, state, operation);
    const again = { ...after, controlTokens: [...after.controlTokens,
      { placeId: operation.input, owner: prepared.owner, multiplicity: 1 }] };
    assert.equal(prepare(program, again, operation), null);
  });
}

test("child entry consumes exactly one unit of a multiple input bucket", () => {
  const state = { ...beforeChild, controlTokens: beforeChild.controlTokens.map((token) => ({ ...token, multiplicity: 4 })) };
  const after = assertExactStep(scopeProgram, state, child);
  assert.equal(after.controlTokens.find(({ placeId }) => placeId === child.input)?.multiplicity, 3);
});

for (const [program, state, left] of [[scopeProgram, beforeChild, child], [callActivityProgram, beforeCall, call]] as const) {
  test(`${left.kind} helper sibling population retains complete preparations and exact both-order states`, () => {
    const { program: pairProgram, state: pairState, right } = helperPair(program, state, left);
    const leftPrepared = required(pairProgram, pairState, left);
    const rightPrepared = required(pairProgram, pairState, right);
    assert.equal(independent(leftPrepared.footprint, rightPrepared.footprint), true);
    const afterLeft = assertExactStep(pairProgram, pairState, left);
    const afterRight = assertExactStep(pairProgram, pairState, right);
    assert.deepEqual(required(pairProgram, afterLeft, right), rightPrepared);
    assert.deepEqual(required(pairProgram, afterRight, left), leftPrepared);
    const leftRight = applyPrepared(pairProgram, afterLeft, rightPrepared);
    const rightLeft = applyPrepared(pairProgram, afterRight, leftPrepared);
    assert.notEqual(leftRight, null);
    assert.deepEqual(leftRight, rightLeft);
    assert.deepEqual(leftRight, assertExactStep(pairProgram, afterLeft, right));
    assert.deepEqual(rightLeft, assertExactStep(pairProgram, afterRight, left));
    assert.deepEqual(instantiateInternalPublicationBatch("pair", 71, [leftPrepared.publicationTemplate, rightPrepared.publicationTemplate]),
      instantiateInternalPublicationBatch("pair", 71, [rightPrepared.publicationTemplate, leftPrepared.publicationTemplate]));
  });
}

function helperPair(program: SemanticProcessProgram, state: RuntimeState, left: InternalScopeCreationOperation) {
  const owner = required(program, state, left).owner;
  const input = `${left.input}:sibling`;
  const entry = `${left.kind === SemanticOperationKind.EnterScope ? left.childEntry : left.calledEntry}:sibling`;
  const origin = { ...left.origin, elementId: `${left.origin.elementId}:sibling` };
  const right: InternalScopeCreationOperation = left.kind === SemanticOperationKind.EnterScope
    ? { ...left, id: `${left.id}:sibling`, origin, input, childEntry: entry, childScopeId: `${left.childScopeId}:sibling` }
    : { ...left, id: `${left.id}:sibling`, origin, input, calledEntry: entry,
      calledRootScopeId: `${left.calledRootScopeId}:sibling`, calledProcessId: `${left.calledProcessId}:sibling`,
      returnOperationId: `${left.returnOperationId}:sibling` };
  const extraDefinition = right.kind === SemanticOperationKind.EnterScope
    ? [{ id: right.childScopeId, parentScopeId: owner.definitionScopeId, originElementId: right.origin.elementId }]
    : [{ id: right.calledRootScopeId, parentScopeId: null, originElementId: right.calledProcessId }];
  const extraPlaces = [{ id: input, origin: { ...program.controlPlaces[0]!.origin, elementId: "Sibling_Input" } },
    { id: entry, origin: { ...program.controlPlaces[0]!.origin, elementId: "Sibling_Entry" } }];
  const pairProgram: SemanticProcessProgram = {
    ...program, definitionScopes: [...program.definitionScopes, ...extraDefinition],
    operations: [...program.operations, right],
    operationScopes: [...program.operationScopes, { operationId: right.id, scopeId: owner.definitionScopeId }],
    controlPlaces: [...program.controlPlaces, ...extraPlaces],
    controlPlaceScopes: [...program.controlPlaceScopes, { controlPlaceId: input, scopeId: owner.definitionScopeId },
      { controlPlaceId: entry, scopeId: right.kind === SemanticOperationKind.EnterScope ? right.childScopeId : right.calledRootScopeId }],
  };
  const key = left.kind === SemanticOperationKind.EnterScope ? "scopeActivations" : "callActivations";
  const elementId = left.kind === SemanticOperationKind.EnterScope ? left.childScopeId : left.origin.elementId;
  const pairState: RuntimeState = { ...state,
    controlTokens: [...state.controlTokens, { placeId: input, owner, multiplicity: 1 }].sort(compareTokenPlaces),
    [key]: [...state[key].filter((counter) => counter.elementId !== elementId), { elementId, count: 8 }],
  };
  return { program: pairProgram, state: pairState, right };
}

function required(program: SemanticProcessProgram, state: RuntimeState, operation: InternalScopeCreationOperation) {
  const prepared = prepare(program, state, operation);
  assert.notEqual(prepared, null);
  return prepared!;
}

function assertRawStep(program: SemanticProcessProgram, before: RuntimeState, operation: InternalScopeCreationOperation) {
  const prepared = required(program, before, operation);
  const step = applyInternalOperationStep(program, operation, before);
  assert.ok(step !== null && step.owner !== null);
  const after = applyPatch(before, prepared.patch);
  assert.deepEqual(after, step.successor);
  assert.deepEqual(applyPrepared(program, before, prepared), after);
  return { prepared, step, after };
}

function assertExactStep(program: SemanticProcessProgram, before: RuntimeState, operation: InternalScopeCreationOperation) {
  const { prepared, step, after } = assertRawStep(program, before, operation);
  assert.ok(step.owner !== null);
  const delta = projectControlPositionDelta(program, before, step.successor);
  assert.notEqual(delta, null);
  const lifecycle = projectFlowNodeOccurrenceLifecycleDelta(program, before, step.successor,
    { kind: "internal", operation, owner: step.owner }, "scope-command", 43);
  assert.notEqual(lifecycle, null);
  const publication = instantiateInternalPublicationBatch("scope-command", 43, [prepared.publicationTemplate]);
  assert.notEqual(publication, null);
  assert.deepEqual(publication![0]?.record, {
    logicalTimeMs: before.logicalTimeMs,
    transition: { kind: SemanticTransitionKind.InternalOperation, operationId: operation.id,
      operationKind: operation.kind, origin: operation.origin, owner: step.owner }, positionDelta: delta,
  });
  assert.deepEqual(publication![0]?.lifecycle, lifecycle);
  return after;
}

function containsNumbering(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    ["commandId", "transitionIndex", "localIndex"].includes(key) || containsNumbering(child));
}
