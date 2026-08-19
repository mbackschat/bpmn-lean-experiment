import {
  isWellFormedBoundaryTimerArm,
} from "./bounded-wait-admission.js";
import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  AwaitSequentialMultiInstanceUserTaskOperation,
} from "./semantic-process-contract.js";
import {
  sequentialMultiInstanceLimits,
} from "./sequential-multi-instance-contract.js";
import { isWellFormedWireString } from "./wire.js";

export function isWellFormedAwaitSequentialMultiInstanceUserTaskOperation(
  value: Record<string, unknown>,
  placeIds: ReadonlySet<string>,
  placeOrigins: ReadonlyMap<string, string>,
): value is AwaitSequentialMultiInstanceUserTaskOperation {
  if (
    !hasOnlyKeys(value, [
      "id",
      "kind",
      "origin",
      "input",
      "task",
      "data",
      "normalOutput",
      "boundaryTimer",
      "limits",
    ]) ||
    value.kind !== SemanticOperationKind.AwaitSequentialMultiInstanceUserTask ||
    !isPlaceReference(value.input, placeIds) ||
    !isPlaceReference(value.normalOutput, placeIds) ||
    !isRecord(value.task) ||
    !hasOnlyKeys(value.task, ["elementId", "name"]) ||
    !isNonEmptyString(value.task.elementId) ||
    (value.task.name !== null && !isNonEmptyString(value.task.name)) ||
    !isRecord(value.origin) ||
    value.origin.elementId !== value.task.elementId ||
    !isWellFormedDataDefinition(value.data) ||
    !isWellFormedBoundaryTimerArm(
      value.boundaryTimer,
      placeIds,
      placeOrigins,
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

function isWellFormedDataDefinition(
  value: unknown,
): value is AwaitSequentialMultiInstanceUserTaskOperation["data"] {
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

function hasExactLimits(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      "maximumItems",
      "maximumItemUtf8Bytes",
      "maximumCanonicalCollectionUtf8Bytes",
    ]) &&
    value.maximumItems === sequentialMultiInstanceLimits.maximumItems &&
    value.maximumItemUtf8Bytes ===
      sequentialMultiInstanceLimits.maximumItemUtf8Bytes &&
    value.maximumCanonicalCollectionUtf8Bytes ===
      sequentialMultiInstanceLimits.maximumCanonicalCollectionUtf8Bytes;
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
