import {
  isWellFormedBoundaryTimerArm,
} from "./bounded-wait-admission.js";
import {
  ParallelMultiInstanceCompletionPolicy,
  parallelMultiInstanceCompletionPolicyBinding,
  parallelMultiInstanceLimits,
} from "./parallel-multi-instance-contract.js";
import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  AwaitParallelMultiInstanceUserTaskOperation,
  CompleteParallelMultiInstanceUserTaskOperation,
} from "./semantic-process-contract.js";
import { isWellFormedWireString } from "./wire.js";

export function isWellFormedAwaitParallelMultiInstanceUserTaskOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): value is AwaitParallelMultiInstanceUserTaskOperation {
  if (
    !hasOnlyKeys(value, [
      "id",
      "kind",
      "origin",
      "input",
      "task",
      "data",
      "completionCondition",
      "normalOutput",
      "boundaryTimer",
      "limits",
    ]) ||
    value.kind !== SemanticOperationKind.AwaitParallelMultiInstanceUserTask ||
    !isPlaceReference(value.input, placeIds) ||
    !isPlaceReference(value.normalOutput, placeIds) ||
    !isRecord(value.task) ||
    !hasOnlyKeys(value.task, ["elementId", "name"]) ||
    !isNonEmptyString(value.task.elementId) ||
    (value.task.name !== null && !isNonEmptyString(value.task.name)) ||
    !isRecord(value.origin) ||
    value.origin.elementId !== value.task.elementId ||
    !isWellFormedDataDefinition(value.data) ||
    !isExactCompletionCondition(value.completionCondition) ||
    !isWellFormedBoundaryTimerArm(
      value.boundaryTimer,
      placeIds,
      placeOrigins,
      5000,
    ) ||
    !hasExactLimits(value.limits)
  ) {
    return false;
  }
  const identities = [
    value.task.elementId,
    value.boundaryTimer.elementId,
    ...Object.values(value.data.input),
    ...Object.values(value.data.output),
  ];
  return value.input !== value.normalOutput &&
    value.input !== value.boundaryTimer.output &&
    value.normalOutput !== value.boundaryTimer.output &&
    new Set(identities).size === identities.length;
}

export function isWellFormedCompleteParallelMultiInstanceUserTaskOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
): value is CompleteParallelMultiInstanceUserTaskOperation {
  return hasOnlyKeys(value, [
    "id",
    "kind",
    "origin",
    "entryOperationId",
    "taskElementId",
    "normalOutput",
  ]) &&
    value.kind === SemanticOperationKind.CompleteParallelMultiInstanceUserTask &&
    isRecord(value.origin) &&
    value.origin.elementId === value.taskElementId &&
    isNonEmptyString(value.entryOperationId) &&
    isNonEmptyString(value.taskElementId) &&
    isPlaceReference(value.normalOutput, placeIds);
}

function isWellFormedDataDefinition(
  value: unknown,
): value is AwaitParallelMultiInstanceUserTaskOperation["data"] {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["input", "output"]) ||
    !isRecord(value.input) ||
    !hasOnlyKeys(value.input, [
      "collectionItemDefinitionId",
      "scalarItemDefinitionId",
      "dataObjectId",
      "dataObjectReferenceId",
      "loopDataInputId",
      "inputDataItemId",
      "taskDataInputId",
      "collectionAssociationId",
      "itemAssociationId",
    ]) ||
    !isRecord(value.output) ||
    !hasOnlyKeys(value.output, [
      "dataObjectId",
      "dataObjectReferenceId",
      "taskDataOutputId",
      "outputDataItemId",
      "loopDataOutputId",
      "itemAssociationId",
      "collectionAssociationId",
    ])
  ) {
    return false;
  }
  return Object.values(value.input).every(isNonEmptyString) &&
    Object.values(value.output).every(isNonEmptyString);
}

function isExactCompletionCondition(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, ["kind", "variable", "value"]) &&
    value.kind === "stringEquals" &&
    value.variable === parallelMultiInstanceCompletionPolicyBinding &&
    value.value === ParallelMultiInstanceCompletionPolicy.First;
}

function hasExactLimits(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      "maximumItems",
      "maximumItemUtf8Bytes",
      "maximumCanonicalCollectionUtf8Bytes",
    ]) &&
    value.maximumItems === parallelMultiInstanceLimits.maximumItems &&
    value.maximumItemUtf8Bytes === parallelMultiInstanceLimits.maximumItemUtf8Bytes &&
    value.maximumCanonicalCollectionUtf8Bytes ===
      parallelMultiInstanceLimits.maximumCanonicalCollectionUtf8Bytes;
}

function isPlaceReference(
  value: unknown,
  placeIds: ReadonlySet<string>,
): value is string {
  return isNonEmptyString(value) && placeIds.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return isWellFormedWireString(value) && value.length > 0;
}
