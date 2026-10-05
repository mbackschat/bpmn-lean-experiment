import assert from "node:assert/strict";
import { test } from "node:test";
import { initialState, ControlStateKind, SemanticOperationKind as Kind, SemanticOriginKind,
  MappingExpressionKind, applyInternalOperationStep } from "@bpmn-lean/semantic-core";
import type { RuntimeState, SemanticOperation, ScopeOccurrenceId } from "@bpmn-lean/semantic-core";
import { program as fixture } from "./embedded-subprocess-fixture.ts";
const owner: ScopeOccurrenceId = { processInstanceId: "P", definitionScopeId: "root", activation: 1 };
const origin = { kind: SemanticOriginKind.BpmnElement, elementId: "Work" } as const;
const human: SemanticOperation = { kind: Kind.AwaitUserTask, id: "human", origin, input: "in", output: "out",
  task: { elementId: "Work", name: null } };
const effect: SemanticOperation = { kind: Kind.AwaitEffect, id: "effect", origin, input: "in", output: "out",
  effect: { elementId: "Work", descriptor: { protocol: "urn:bpmn-lean:effect-protocol:activity-v1", operation: "validateInvoice" },
    inputMappings: [{ target: "argument", expression: { kind: MappingExpressionKind.EnclosingVariable, name: "missing" } }],
    outputMappings: [] }, bpmnErrorRoute: null };
function assertDisabled(operation: SemanticOperation, state: RuntimeState): void {
  const program = { ...fixture, operations: [operation], operationScopes: [{ operationId: operation.id, scopeId: owner.definitionScopeId }] };
  const saved = structuredClone(state);
  assert.equal(applyInternalOperationStep(program, operation, state), null);
  assert.deepEqual(state, saved);
}
test("missing effect input disables arming instead of reporting an unchanged successful step", () => {
  assertDisabled(effect, { ...initialState, control: { kind: ControlStateKind.Running, instanceId: "P" },
    scopeOccurrences: [{ id: owner, parent: null }], controlTokens: [{ owner, placeId: "in", multiplicity: 1 }] });
});
test("a token cannot make ordinary arming succeed outside a running instance", () => {
  const state: RuntimeState = { ...initialState, controlTokens: [{ owner, placeId: "in", multiplicity: 1 }] };
  assertDisabled(human, state);
  assertDisabled(effect, state);
});
