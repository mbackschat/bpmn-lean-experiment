/** Closed union validation for sequential and parallel Multi-Instance E1 progress. */
import {
  SemanticOperationKind,
  VariableValueKind,
  compareCanonicalStrings,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  OpenMultiInstance,
  OpenParallelMultiInstance,
  OpenUserTask,
  SemanticProcessProgram,
} from "@bpmn-lean/semantic-core";

import { isSequentialMultiInstanceProgress } from "./sequential-multi-instance-publication-validation.js";
import { isCanonicalPublicationVariablePatch } from "./semantic-publication-variable-validation.js";

export function isMultiInstanceProgress(
  value: unknown,
  instanceId: unknown,
  openUserTasks: readonly OpenUserTask[],
  program: SemanticProcessProgram | null,
): value is OpenMultiInstance[] {
  if (typeof instanceId !== "string" || !Array.isArray(value)) return false;
  const sequential = value.filter((item) => isRecord(item) && item.mode === "sequential");
  const parallel = value.filter((item) => isRecord(item) && item.mode === "parallel");
  if (sequential.length + parallel.length !== value.length) return false;
  const declaresSequential = program === null || program.operations.some(({ kind }) =>
    kind === SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
  );
  const declaresParallel = program === null || program.operations.some(({ kind }) =>
    kind === SemanticOperationKind.AwaitParallelMultiInstanceUserTask
  );
  if (
    (!declaresSequential && sequential.length > 0) ||
    (!declaresParallel && parallel.length > 0) ||
    !isSequentialMultiInstanceProgress(sequential, instanceId, openUserTasks) ||
    !isParallelMultiInstanceProgress(parallel, instanceId, openUserTasks)
  ) {
    return false;
  }
  const progress = value as OpenMultiInstance[];
  const taskIds = progress.flatMap(({ activeIterations }) =>
    activeIterations.map(({ taskId }) => taskId)
  );
  return canonical(progress, compareProgress) && taskIds.every((taskId, index) =>
    taskIds.findIndex((candidate) => sameOccurrence(candidate, taskId)) === index
  );
}

function isParallelMultiInstanceProgress(
  value: unknown,
  instanceId: string,
  openUserTasks: readonly OpenUserTask[],
): value is OpenParallelMultiInstance[] {
  return Array.isArray(value) && value.every((item) =>
    isParallelProgress(item, instanceId, openUserTasks)
  ) && canonical(value, compareProgress);
}

function isParallelProgress(
  value: unknown,
  instanceId: string,
  openUserTasks: readonly OpenUserTask[],
): value is OpenParallelMultiInstance {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id", "mode", "plannedInstanceCount", "pendingItemCount",
      "numberOfInstances", "numberOfActiveInstances",
      "numberOfCompletedInstances", "numberOfTerminatedInstances",
      "activeIterations",
    ]) ||
    !isActivityOccurrence(value.id, instanceId) ||
    value.mode !== "parallel" ||
    !isSafe(value.plannedInstanceCount, 1) ||
    value.pendingItemCount !== 0 ||
    !isSafe(value.numberOfInstances, 1) ||
    !isSafe(value.numberOfActiveInstances, 1) ||
    !isSafe(value.numberOfCompletedInstances, 0) ||
    value.numberOfTerminatedInstances !== 0 ||
    !Array.isArray(value.activeIterations)
  ) {
    return false;
  }
  const planned = Number(value.plannedInstanceCount);
  const generated = Number(value.numberOfInstances);
  const active = Number(value.numberOfActiveInstances);
  const completed = Number(value.numberOfCompletedInstances);
  const activationOffsets = new Set(value.activeIterations.map((iteration) =>
    isRecord(iteration) && isOccurrence(iteration.taskId) &&
      Number.isSafeInteger(iteration.loopCounter)
      ? iteration.taskId.activation - Number(iteration.loopCounter)
      : Number.NaN
  ));
  return generated === planned && active + completed === generated &&
    value.activeIterations.length === active &&
    activationOffsets.size === 1 && !activationOffsets.has(Number.NaN) &&
    canonical(value.activeIterations, (left, right) =>
      Number((left as Record<string, unknown>).loopCounter) -
      Number((right as Record<string, unknown>).loopCounter)
    ) && value.activeIterations.every((iteration) =>
      isIteration(
        iteration,
        value.id as Record<string, unknown>,
        planned,
        openUserTasks,
      )
    );
}

function isIteration(
  value: unknown,
  activityId: Record<string, unknown>,
  planned: number,
  openUserTasks: readonly OpenUserTask[],
): boolean {
  return isRecord(value) && hasOnlyKeys(value, [
    "loopCounter", "taskId", "taskInput", "completionBindingName",
  ]) && isSafe(value.loopCounter, 0) && Number(value.loopCounter) < planned &&
    isOccurrence(value.taskId) &&
    value.taskId.processInstanceId === activityId.processInstanceId &&
    value.taskId.elementId === activityId.activityElementId &&
    openUserTasks.some(({ id }) => sameOccurrence(id, value.taskId)) &&
    isRecord(value.taskInput) && hasOnlyKeys(value.taskInput, ["name", "value"]) &&
    isNonEmptyWire(value.taskInput.name) && isRecord(value.taskInput.value) &&
    value.taskInput.value.kind === VariableValueKind.String &&
    isCanonicalPublicationVariablePatch([value.taskInput]) &&
    isNonEmptyWire(value.completionBindingName);
}

function isActivityOccurrence(
  value: unknown,
  instanceId: string,
): value is Record<string, unknown> {
  return isRecord(value) && hasOnlyKeys(value, [
    "processInstanceId", "activityElementId", "activation",
  ]) && value.processInstanceId === instanceId &&
    isNonEmptyWire(value.activityElementId) && isSafe(value.activation, 1);
}

function isOccurrence(value: unknown): value is {
  processInstanceId: string;
  elementId: string;
  activation: number;
} {
  return isRecord(value) && hasOnlyKeys(value, [
    "processInstanceId", "elementId", "activation",
  ]) && isNonEmptyWire(value.processInstanceId) &&
    isNonEmptyWire(value.elementId) && isSafe(value.activation, 1);
}

function sameOccurrence(left: unknown, right: unknown): boolean {
  return isOccurrence(left) && isOccurrence(right) &&
    left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId && left.activation === right.activation;
}

function compareProgress(left: unknown, right: unknown): number {
  const a = (left as { id: Record<string, unknown> }).id;
  const b = (right as { id: Record<string, unknown> }).id;
  return compareCanonicalStrings(String(a.processInstanceId), String(b.processInstanceId)) ||
    compareCanonicalStrings(String(a.activityElementId), String(b.activityElementId)) ||
    Number(a.activation) - Number(b.activation);
}

function canonical<T>(value: T[], compare: (left: T, right: T) => number): boolean {
  return value.every((item, index) =>
    index === 0 || compare(value[index - 1] as T, item) < 0
  );
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
