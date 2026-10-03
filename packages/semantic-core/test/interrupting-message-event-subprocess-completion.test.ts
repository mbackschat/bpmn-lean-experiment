import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ControlStateKind, InternalSchedulingMode, SemanticOperationKind, SemanticOriginKind,
  SemanticProcessCompilerId, SemanticProcessKind, VariableValueKind,
  applyInternalOperation, initialState,
} from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticProcessProgram } from "@bpmn-lean/semantic-core";

const root = { processInstanceId: "application-1", definitionScopeId: "root", activation: 1 };
const child = { ...root, definitionScopeId: "handler", activation: 2 };
const outside = { ...root, definitionScopeId: "outside", activation: 3 };
const completion = {
  id: "complete-handler", kind: SemanticOperationKind.CompleteEventSubProcess,
  origin: { kind: SemanticOriginKind.BpmnElement, elementId: "Withdrawal" }, scopeId: child.definitionScopeId,
} as const;
const declaration = {
  parentScopeId: root.definitionScopeId, handlerScopeId: child.definitionScopeId,
  elementId: "Withdrawal", startEventId: "MessageStart",
  channel: { kind: "operationMessage", interfaceId: "ApplicationMessages", interfaceOperationId: "Withdraw", messageId: "WithdrawalMessage" },
  childEntry: "handler-entry",
} as const;
// The local completion law also frames an outside region; broader source composition is excluded.
const program: SemanticProcessProgram = {
  kind: SemanticProcessKind.SemanticProcess,
  identity: { compiler: SemanticProcessCompilerId.BpmnSourceSemanticProcess,
    semanticProfile: "bpmn-2.0.2-interrupting-message-event-subprocess-draft",
    sourceId: "local-completion-law", sourceSha256: "a".repeat(64), sourceOverlay: null },
  internalSchedulingMode: InternalSchedulingMode.RejectObservableChoice,
  processId: "Application",
  definitionScopes: [
    { id: root.definitionScopeId, parentScopeId: null, originElementId: "Application" },
    { id: child.definitionScopeId, parentScopeId: root.definitionScopeId, originElementId: "Withdrawal" },
  ],
  operations: [completion], operationScopes: [{ operationId: completion.id, scopeId: child.definitionScopeId }],
  controlPlaces: [], controlPlaceScopes: [], interruptingMessageEventSubProcesses: [declaration],
};
const ready: RuntimeState = {
  ...initialState, control: { kind: ControlStateKind.Running, instanceId: root.processInstanceId },
  scopeOccurrences: [{ id: root, parent: null }, { id: child, parent: root }, { id: outside, parent: null }],
  controlTokens: [{ placeId: "outside-token", owner: outside, multiplicity: 2 }],
  logicalTimeMs: 47, endOccurrences: 2,
  variables: { ...initialState.variables, process: { bindings: [{ name: "Context", value: { kind: VariableValueKind.String, value: "retained" } }] } },
  scopeActivations: [{ elementId: child.definitionScopeId, count: 2 }],
  taskActivations: [{ elementId: "Eligibility", count: 1 }],
};

test("handler completion removes only its quiescent scope and emits no parent token", () => {
  const after = applyInternalOperation(program, completion, ready);
  assert.deepEqual(after, { ...ready, scopeOccurrences: [ready.scopeOccurrences[0], ready.scopeOccurrences[2]] });
});

test("ordinary child completion still requires its normal continuation", () => {
  assert.equal(applyInternalOperation(program, { ...completion, kind: SemanticOperationKind.CompleteScope, parentOutput: null }, ready), null);
});

test("normal parent completion expires its passive listener without creating a handler", () => {
  const parentCompletion = { ...completion, kind: SemanticOperationKind.CompleteScope, scopeId: root.definitionScopeId,
    origin: { ...completion.origin, elementId: "Application" }, parentOutput: null } as const;
  const state: RuntimeState = { ...ready, scopeOccurrences: [{ id: root, parent: null }], controlTokens: [],
    eventSubProcessMessageSubscriptions: [{ owner: root, channel: declaration.channel,
      id: { processInstanceId: root.processInstanceId, elementId: declaration.startEventId, activation: 1 } }] };
  const after = applyInternalOperation(program, parentCompletion, state);
  assert.deepEqual(after, { ...state, control: { kind: ControlStateKind.Completed, instanceId: root.processInstanceId },
    scopeOccurrences: [], eventSubProcessMessageSubscriptions: [] });
  assert.equal(applyInternalOperation(program, parentCompletion, { ...state,
    scopeOccurrences: [...state.scopeOccurrences, { id: child, parent: root }], eventSubProcessMessageSubscriptions: [] }), null);
});

for (const [label, state] of [
  ["active handler token", { ...ready, controlTokens: [...ready.controlTokens, { placeId: "handler-work", owner: child, multiplicity: 1 }] }],
  ["missing parent", { ...ready, scopeOccurrences: [{ id: child, parent: root }] }],
  ["wrong parent definition", { ...ready, scopeOccurrences: [{ id: root, parent: null }, { id: child, parent: outside }, { id: outside, parent: null }] }],
  ["duplicate child", { ...ready, scopeOccurrences: [...ready.scopeOccurrences, { id: child, parent: root }] }],
  ["child in another instance", { ...ready, scopeOccurrences: [{ id: root, parent: null }, { id: { ...child, processInstanceId: "another" }, parent: root }] }],
  ["live nested child", { ...ready, scopeOccurrences: [...ready.scopeOccurrences, { id: { ...child, definitionScopeId: "nested" }, parent: child }] }],
] as const) {
  test(`handler completion refuses ${label} without changing state`, () => {
    const snapshot = structuredClone(state);
    assert.equal(applyInternalOperation(program, completion, state), null);
    assert.deepEqual(state, snapshot);
  });
}

test("handler completion requires one exact declaration and matching BPMN origin", () => {
  assert.equal(applyInternalOperation({ ...program, interruptingMessageEventSubProcesses: [] }, completion, ready), null);
  assert.equal(applyInternalOperation({ ...program, interruptingMessageEventSubProcesses: [declaration, declaration] }, completion, ready), null);
  assert.equal(applyInternalOperation({ ...program, definitionScopes: program.definitionScopes.filter(({ id }) => id !== root.definitionScopeId) }, completion, ready), null);
  assert.equal(applyInternalOperation(program, { ...completion, origin: { ...completion.origin, elementId: "Other" } }, ready), null);
  assert.equal(applyInternalOperation(program, { ...completion, scopeId: root.definitionScopeId }, ready), null);
});
