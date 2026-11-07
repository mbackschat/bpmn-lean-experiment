import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ControlStateKind,
  InternalSchedulingMode,
  ScopeWorkKind,
  SemanticOperationKind,
  SemanticProcessCompilerId,
  SemanticProcessKind,
  StimulusKind,
  applyInternalOperationStep,
  initialState,
  isPublishedOperationKind,
  publishedOperationKind,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
  ScopeOccurrenceId,
  SemanticOperation,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { controlPlace, operationBase } from "./semantic-program-parts.ts";

type OperationAdmissionModule = typeof import("../src/semantic-process-operation-admission.ts");
type FootprintModule = typeof import("../src/internal-transition-footprint.ts");
type ScopeHostWorkModule = typeof import("../src/scope-host-work.ts");
type StateModule = typeof import("../src/semantic-process-state.ts");
type TriggeredStartModule = typeof import("../src/semantic-process-triggered-start.ts");

const { isWellFormedSemanticOperation } = await import(
  new URL("../dist/semantic-process-operation-admission.js", import.meta.url).href
) as OperationAdmissionModule;
const { deriveInternalTransitionFootprint } = await import(
  new URL("../dist/internal-transition-footprint.js", import.meta.url).href
) as FootprintModule;
const { scopeHostsAreSole } = await import(
  new URL("../dist/scope-host-work.js", import.meta.url).href
) as ScopeHostWorkModule;
const { processStartMatchesProgram } = await import(
  new URL("../dist/semantic-process-triggered-start.js", import.meta.url).href
) as TriggeredStartModule;
const { addToken } = await import(
  new URL("../dist/semantic-process-state.js", import.meta.url).href
) as StateModule;

const processId = "Process_Onboarding";
const instanceId = "Instance_Onboarding";
const rootScope = "scope:root";
const childScope = "scope:Equipment";
const root: ScopeOccurrenceId = { processInstanceId: instanceId, definitionScopeId: rootScope, activation: 1 };
const child: ScopeOccurrenceId = { processInstanceId: instanceId, definitionScopeId: childScope, activation: 1 };
const rootPlaces = ["place:Flow_In", "place:Flow_Out_A", "place:Flow_Out_B"];
const childPlaces = ["place:Flow_Child_A", "place:Flow_Child_B"];

const processHost = {
  ...operationBase("StartEvent_Hire"),
  kind: SemanticOperationKind.Scope,
  inputs: [],
  entries: [{ place: "place:Flow_Out_A" }, { place: "place:Flow_Out_B" }],
  work: { kind: ScopeWorkKind.Process },
} as const satisfies SemanticOperation;

const subProcessHost = {
  ...operationBase("SubProcess_Equipment"),
  kind: SemanticOperationKind.Scope,
  inputs: ["place:Flow_In"],
  entries: [{ place: "place:Flow_Child_A" }, { place: "place:Flow_Child_B" }],
  work: { kind: ScopeWorkKind.SubProcess, childScopeId: childScope },
} as const satisfies SemanticOperation;

const exit = {
  ...operationBase("SubProcess_Equipment"),
  kind: SemanticOperationKind.ScopeExit,
  scopeId: childScope,
  outputs: [{ place: "place:Flow_Out_A" }, { place: "place:Flow_Out_B" }],
} as const satisfies SemanticOperation;

const legacyInitiate: SemanticOperation = {
  ...operationBase("StartEvent_Hire"),
  kind: SemanticOperationKind.Initiate,
  output: "place:Flow_Out_A",
};
const legacyEnter: SemanticOperation = {
  ...operationBase("SubProcess_Equipment"),
  kind: SemanticOperationKind.EnterScope,
  input: "place:Flow_In",
  childEntry: "place:Flow_Child_A",
  childScopeId: childScope,
};
const legacyComplete: SemanticOperation = {
  ...operationBase("SubProcess_Equipment"),
  kind: SemanticOperationKind.CompleteScope,
  scopeId: childScope,
  parentOutput: "place:Flow_Out_A",
};

/** A root scope with one embedded child; every operation but an entry or exit of the child is root-owned. */
const program = (operation: SemanticOperation): SemanticProcessProgram => ({
  kind: SemanticProcessKind.SemanticProcess,
  identity: {
    compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "scope-host-test",
    sourceId: "scope-host-test",
    sourceOverlay: null,
    sourceSha256: "e".repeat(64),
  },
  processId,
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  definitionScopes: [
    { id: rootScope, parentScopeId: null, originElementId: processId },
    { id: childScope, parentScopeId: rootScope, originElementId: "SubProcess_Equipment" },
  ],
  controlPlaces: [...rootPlaces, ...childPlaces].map((place) => controlPlace(place.replace(/^place:/u, ""))),
  controlPlaceScopes: [
    ...rootPlaces.map((controlPlaceId) => ({ controlPlaceId, scopeId: rootScope })),
    ...childPlaces.map((controlPlaceId) => ({ controlPlaceId, scopeId: childScope })),
  ],
  operations: [operation],
  operationScopes: [{
    operationId: operation.id,
    scopeId: operation.kind === SemanticOperationKind.ScopeExit || operation.kind === SemanticOperationKind.CompleteScope
      ? childScope : rootScope,
  }],
});

const running = (
  occurrences: ReadonlyArray<ScopeOccurrenceId>,
  tokens: ReadonlyArray<readonly [string, ScopeOccurrenceId]>,
  pending = false,
): RuntimeState => ({
  ...initialState,
  control: { kind: ControlStateKind.Running, instanceId },
  initiationPending: pending,
  scopeOccurrences: occurrences.map((id) => ({ id, parent: id === root ? null : root })),
  scopeActivations: occurrences.map(({ definitionScopeId, activation }) => ({ elementId: definitionScopeId, count: activation }))
    .sort((left, right) => left.elementId < right.elementId ? -1 : 1),
  controlTokens: tokens.map(([placeId, owner]) => ({ placeId, owner, multiplicity: 1 })),
});

const wellFormed = (operation: unknown): boolean => isWellFormedSemanticOperation(
  operation,
  new Set([...rootPlaces, ...childPlaces]),
  new Map(),
  new Map([[rootScope, processId], [childScope, "SubProcess_Equipment"]]),
);

/** The legacy step's state with one further token, owned as the first, on the list's second place. */
function withSecondToken(state: RuntimeState, place: string, owner: ScopeOccurrenceId): RuntimeState {
  return { ...state, controlTokens: addToken(state.controlTokens, place, owner) };
}

test("SCPH-HOST-01: admits a host or exit with two or more sorted distinct places", () => {
  assert.equal(wellFormed(processHost), true);
  assert.equal(wellFormed(subProcessHost), true);
  assert.equal(wellFormed(exit), true);
});

test("SCPH-HOST-01: refuses a host or exit that would double the legacy encoding or break its work", () => {
  assert.equal(wellFormed({ ...processHost, entries: [{ place: "place:Flow_Out_A" }] }), false, "one entry");
  assert.equal(wellFormed({ ...processHost, entries: [...processHost.entries].reverse() }), false, "unsorted entries");
  assert.equal(wellFormed({ ...processHost, inputs: ["place:Flow_In"] }), false, "a process host with an input");
  assert.equal(wellFormed({ ...subProcessHost, inputs: [] }), false, "a subProcess host without its input");
  assert.equal(wellFormed({ ...subProcessHost, inputs: ["place:Flow_Child_A"] }), false, "an input among the entries");
  assert.equal(wellFormed({ ...subProcessHost, work: { kind: ScopeWorkKind.SubProcess, childScopeId: "scope:Absent" } }),
    false, "an absent child scope");
  assert.equal(wellFormed({ ...exit, outputs: [{ place: "place:Flow_Out_A" }] }), false, "one output");
  assert.equal(wellFormed({ ...exit, scopeId: "scope:Absent" }), false, "an absent scope");
  assert.equal(wellFormed({ ...processHost, work: { kind: "call" } }), false, "an unknown work");
});

test("SCPH-HOST-01: a subProcess host is the only entry of its child and an exit the only completion of its scope", () => {
  assert.equal(scopeHostsAreSole([subProcessHost, exit]), true);
  assert.equal(scopeHostsAreSole([subProcessHost, { ...legacyEnter, id: "operation:Second" }]), false);
  assert.equal(scopeHostsAreSole([exit, { ...legacyComplete, id: "operation:Second" }]), false);
});

test("SCPH-HOST-01: publishes its work's legacy kind and never its discriminant", () => {
  assert.equal(publishedOperationKind(processHost), SemanticOperationKind.Initiate);
  assert.equal(publishedOperationKind(subProcessHost), SemanticOperationKind.EnterScope);
  assert.equal(publishedOperationKind(exit), SemanticOperationKind.CompleteScope);
  assert.equal(isPublishedOperationKind("scope"), false);
  assert.equal(isPublishedOperationKind("scopeExit"), false);
});

test("SCPH-START-01: a process host initiates over every entry in one step", () => {
  const before = running([root], [], true);
  const host = applyInternalOperationStep(program(processHost), processHost, before);
  const legacy = applyInternalOperationStep(program(legacyInitiate), legacyInitiate, before);
  assert.ok(host !== null && legacy !== null);
  assert.deepEqual(host.owner, legacy.owner);
  assert.deepEqual(host.successor, withSecondToken(legacy.successor, "place:Flow_Out_B", root));
});

test("SCPH-HOST-01: a process host is the None Start initiation an ordinary start command selects", () => {
  const start = { kind: StimulusKind.StartProcess, commandId: "start", processId, instanceId, initialVariables: [] } as const;
  assert.equal(processStartMatchesProgram(start, program(processHost)), true);
  assert.equal(processStartMatchesProgram(start, program(legacyInitiate)), true);
  assert.equal(processStartMatchesProgram(start, program(subProcessHost)), false);
});

test("SCPH-START-01: a subProcess host enters its child over every entry in one step", () => {
  const before = running([root], [["place:Flow_In", root]]);
  const host = applyInternalOperationStep(program(subProcessHost), subProcessHost, before);
  const legacy = applyInternalOperationStep(program(legacyEnter), legacyEnter, before);
  assert.ok(host !== null && legacy !== null);
  assert.deepEqual(host.owner, legacy.owner);
  const entered = legacy.successor.scopeOccurrences.find(({ id }) => id.definitionScopeId === childScope)?.id;
  assert.ok(entered !== undefined);
  assert.deepEqual(host.successor, withSecondToken(legacy.successor, "place:Flow_Child_B", entered));
});

test("SCPH-EXIT-01: an exit completes its quiescent scope onto every output in one step", () => {
  const before = running([root, child], []);
  const host = applyInternalOperationStep(program(exit), exit, before);
  const legacy = applyInternalOperationStep(program(legacyComplete), legacyComplete, before);
  assert.ok(host !== null && legacy !== null);
  assert.deepEqual(host.owner, legacy.owner);
  assert.deepEqual(host.successor, withSecondToken(legacy.successor, "place:Flow_Out_B", root));
});

test("SCPH-SINGLE-01: a host or exit carries no footprint, so it is never batched", () => {
  assert.equal(deriveInternalTransitionFootprint(program(processHost), running([root], [], true),
    { operation: processHost, owner: root }), null);
  assert.equal(deriveInternalTransitionFootprint(program(subProcessHost), running([root], [["place:Flow_In", root]]),
    { operation: subProcessHost, owner: root }), null);
  assert.equal(deriveInternalTransitionFootprint(program(exit), running([root, child], []),
    { operation: exit, owner: child }), null);
});
