/** Closed recursive validation for the optional sequential Multi-Instance E1 projection. */
import {
  VariableValueKind,
  compareCanonicalStrings,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  OpenSequentialMultiInstance,
  OpenUserTask,
} from "@bpmn-lean/semantic-core";

import { isCanonicalPublicationVariablePatch } from "./semantic-publication-variable-validation.js";

export function isSequentialMultiInstanceProgress(
  value: unknown,
  instanceId: unknown,
  openUserTasks: readonly OpenUserTask[],
): value is OpenSequentialMultiInstance[] {
  if (
    typeof instanceId !== "string" ||
    !Array.isArray(value) ||
    !value.every((item) => isProgress(item, instanceId, openUserTasks)) ||
    !canonical(value, compareProgress)
  ) {
    return false;
  }
  const taskIds = value.flatMap(({ activeIterations }) =>
    activeIterations.map(({ taskId }) => taskId)
  );
  return taskIds.every((taskId, index) =>
    taskIds.findIndex((candidate) => sameOccurrence(candidate, taskId)) === index
  );
}

function isProgress(
  value: unknown,
  instanceId: string,
  openUserTasks: readonly OpenUserTask[],
): value is OpenSequentialMultiInstance {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "mode",
      "plannedInstanceCount",
      "pendingItemCount",
      "numberOfInstances",
      "numberOfActiveInstances",
      "numberOfCompletedInstances",
      "numberOfTerminatedInstances",
      "activeIterations",
    ]) ||
    !isActivityOccurrence(value.id, instanceId) ||
    value.mode !== "sequential" ||
    !isSafe(value.plannedInstanceCount, 1) ||
    !isSafe(value.pendingItemCount, 0) ||
    !isSafe(value.numberOfInstances, 1) ||
    value.numberOfActiveInstances !== 1 ||
    !isSafe(value.numberOfCompletedInstances, 0) ||
    value.numberOfTerminatedInstances !== 0 ||
    !Array.isArray(value.activeIterations) ||
    value.activeIterations.length !== 1
  ) {
    return false;
  }
  const planned = Number(value.plannedInstanceCount);
  const pending = Number(value.pendingItemCount);
  const generated = Number(value.numberOfInstances);
  const completed = Number(value.numberOfCompletedInstances);
  if (
    generated !== 1 + completed ||
    planned !== pending + generated ||
    generated > planned
  ) {
    return false;
  }
  const iteration = value.activeIterations[0];
  return isIteration(
    iteration,
    value.id,
    completed,
    openUserTasks,
  );
}

function isIteration(
  value: unknown,
  activityId: Record<string, unknown>,
  completed: number,
  openUserTasks: readonly OpenUserTask[],
): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "loopCounter",
      "taskId",
      "taskInput",
      "completionBindingName",
    ]) ||
    value.loopCounter !== completed ||
    !isOccurrence(value.taskId) ||
    value.taskId.processInstanceId !== activityId.processInstanceId ||
    value.taskId.elementId !== activityId.activityElementId ||
    !openUserTasks.some(({ id }) => sameOccurrence(id, value.taskId)) ||
    !isRecord(value.taskInput) ||
    !hasOnlyKeys(value.taskInput, ["name", "value"]) ||
    !isNonEmptyWire(value.taskInput.name) ||
    !isRecord(value.taskInput.value) ||
    value.taskInput.value.kind !== VariableValueKind.String ||
    !isCanonicalPublicationVariablePatch([value.taskInput]) ||
    !isNonEmptyWire(value.completionBindingName)
  ) {
    return false;
  }
  return true;
}

function isActivityOccurrence(value: unknown, instanceId: string): value is Record<string, unknown> {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      "processInstanceId",
      "activityElementId",
      "activation",
    ]) &&
    value.processInstanceId === instanceId &&
    isNonEmptyWire(value.activityElementId) &&
    isSafe(value.activation, 1);
}

function isOccurrence(value: unknown): value is {
  processInstanceId: string;
  elementId: string;
  activation: number;
} {
  return isRecord(value) &&
    hasOnlyKeys(value, ["processInstanceId", "elementId", "activation"]) &&
    isNonEmptyWire(value.processInstanceId) &&
    isNonEmptyWire(value.elementId) &&
    isSafe(value.activation, 1);
}

function sameOccurrence(left: unknown, right: unknown): boolean {
  return isOccurrence(left) && isOccurrence(right) &&
    left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation;
}

function compareProgress(left: unknown, right: unknown): number {
  const a = (left as { id: Record<string, unknown> }).id;
  const b = (right as { id: Record<string, unknown> }).id;
  return compareCanonicalStrings(
    String(a.processInstanceId),
    String(b.processInstanceId),
  ) || compareCanonicalStrings(
    String(a.activityElementId),
    String(b.activityElementId),
  ) || compareNumber(Number(a.activation), Number(b.activation));
}

function canonical<T>(value: T[], compare: (left: T, right: T) => number): boolean {
  return value.every((item, index) =>
    index === 0 || compare(value[index - 1] as T, item) < 0
  );
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isNonEmptyWire(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    isWellFormedWireString(value);
}

function isSafe(value: unknown, minimum: number): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}
