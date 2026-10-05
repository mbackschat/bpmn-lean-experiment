import {
  MultiInstanceBodyKind, SemanticOperationKind, VariableValueKind,
  compareCanonicalStrings, isVariablePatch, isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  OpenEffect, OpenSequentialSubProcessMultiInstance, OpenUserTask, PublicScopePosition,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

/** SMIS-PUBLISH-01 validates body progress against the other facts in the same committed publication. */
export function isSequentialScopeProgress(
  value: unknown,
  instanceId: string,
  tasks: readonly OpenUserTask[],
  effects: readonly OpenEffect[],
  scopes: readonly PublicScopePosition[],
  program: SemanticProcessProgram | null,
): value is OpenSequentialSubProcessMultiInstance {
  if (!record(value) || !keys(value, ["id", "mode", "bodyKind", "plannedInstanceCount", "pendingItemCount",
    "numberOfInstances", "numberOfActiveInstances", "numberOfCompletedInstances", "numberOfTerminatedInstances", "activeIterations"]) ||
    !record(value.id) || !keys(value.id, ["processInstanceId", "activityElementId", "activation"]) ||
    value.id.processInstanceId !== instanceId || !wire(value.id.activityElementId) || !integer(value.id.activation, 1) ||
    value.bodyKind !== MultiInstanceBodyKind.SubProcess || value.mode !== "sequential" ||
    !integer(value.plannedInstanceCount, 1) || !integer(value.pendingItemCount, 0) ||
    !integer(value.numberOfInstances, 1) || value.numberOfActiveInstances !== 1 ||
    !integer(value.numberOfCompletedInstances, 0) || value.numberOfTerminatedInstances !== 0 ||
    value.numberOfInstances !== value.numberOfCompletedInstances + 1 ||
    value.plannedInstanceCount !== value.numberOfInstances + value.pendingItemCount ||
    !Array.isArray(value.activeIterations) || value.activeIterations.length !== 1) return false;
  const iteration: unknown = value.activeIterations[0];
  if (!record(iteration) || !keys(iteration, ["loopCounter", "body", "item", "bindings", "userTaskIds", "effectIds"]) ||
    iteration.loopCounter !== value.numberOfCompletedInstances || !record(iteration.body) ||
    !keys(iteration.body, ["processInstanceId", "definitionScopeId", "activation"]) ||
    iteration.body.processInstanceId !== instanceId || !wire(iteration.body.definitionScopeId) ||
    !integer(iteration.body.activation, 1) || !record(iteration.item) ||
    !isVariablePatch([iteration.item]) || !record(iteration.item.value) || iteration.item.value.kind !== VariableValueKind.String ||
    !isVariablePatch(iteration.bindings) || !iteration.bindings.every(binding =>
      binding.value.kind === VariableValueKind.String || binding.value.kind === VariableValueKind.Null) ||
    !members(iteration.userTaskIds, instanceId, tasks) || !members(iteration.effectIds, instanceId, effects)) return false;
  const body = iteration.body;
  const bodyPositions = scopes.filter(({ id }) => id.processInstanceId === body.processInstanceId &&
    id.definitionScopeId === body.definitionScopeId && id.activation === body.activation);
  const position = bodyPositions[0];
  if (bodyPositions.length !== 1 || position === undefined || position.parent === null ||
    position.bpmnElementId !== value.id.activityElementId) return false;
  if (program === null) return true;
  const activityElementId = value.id.activityElementId;
  const entries = program.operations.filter(operation => operation.kind === SemanticOperationKind.EnterSequentialMultiInstanceScope &&
    operation.origin.elementId === activityElementId);
  const entry = entries[0];
  if (entries.length !== 1 || entry?.kind !== SemanticOperationKind.EnterSequentialMultiInstanceScope ||
    entry.childScopeId !== body.definitionScopeId || entry.itemName !== iteration.item.name ||
    iteration.bindings.length !== entry.bodyInputs.length ||
    !iteration.bindings.every(binding => entry.bodyInputs.some(mapping => mapping.target === binding.name))) return false;
  const belongs = (id: { elementId: string }, kind: SemanticOperationKind) => program.operations.some(operation =>
    operation.kind === kind && operation.origin.elementId === id.elementId && program.operationScopes.some(owner =>
      owner.operationId === operation.id && owner.scopeId === entry.childScopeId));
  return iteration.userTaskIds.every(id => belongs(id, SemanticOperationKind.AwaitUserTask)) &&
    iteration.effectIds.every(id => belongs(id, SemanticOperationKind.AwaitEffect)) &&
    tasks.filter(({ id }) => belongs(id, SemanticOperationKind.AwaitUserTask)).length === iteration.userTaskIds.length &&
    effects.filter(({ id }) => belongs(id, SemanticOperationKind.AwaitEffect)).length === iteration.effectIds.length;
}

function members(value: unknown, instanceId: string, visible: readonly { id: { processInstanceId: string; elementId: string; activation: number } }[]):
  value is { processInstanceId: string; elementId: string; activation: number }[] {
  if (!Array.isArray(value)) return false;
  return value.every((id: unknown, index) => record(id) && keys(id, ["processInstanceId", "elementId", "activation"]) &&
    id.processInstanceId === instanceId && wire(id.elementId) && integer(id.activation, 1) &&
    visible.some(({ id: actual }) => actual.processInstanceId === id.processInstanceId &&
      actual.elementId === id.elementId && actual.activation === id.activation) &&
    (index === 0 || compareId(value[index - 1], { elementId: id.elementId, activation: id.activation }) < 0));
}
function compareId(left: { elementId: string; activation: number }, right: { elementId: string; activation: number }): number {
  return compareCanonicalStrings(left.elementId, right.elementId) || left.activation - right.activation;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && Object.keys(value).every(key => expected.includes(key));
}
function wire(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && isWellFormedWireString(value);
}
function integer(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}
