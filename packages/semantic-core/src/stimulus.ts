import {
  StimulusKind,
} from "./contract.js";
import type {
  Stimulus,
} from "./contract.js";

export function stimulusCommandId(stimulus: Stimulus): string {
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
    case StimulusKind.CompleteUserTaskInstance:
    case StimulusKind.FireTimer:
      return stimulus.commandId;
    default:
      return assertNever(stimulus);
  }
}

export function sameStimulus(left: Stimulus, right: Stimulus): boolean {
  switch (left.kind) {
    case StimulusKind.StartProcess:
      return (
        right.kind === StimulusKind.StartProcess &&
        left.commandId === right.commandId &&
        left.processId === right.processId &&
        left.instanceId === right.instanceId
      );
    case StimulusKind.CompleteUserTaskInstance:
      return (
        right.kind === StimulusKind.CompleteUserTaskInstance &&
        left.commandId === right.commandId &&
        left.taskId.processInstanceId === right.taskId.processInstanceId &&
        left.taskId.elementId === right.taskId.elementId &&
        left.taskId.activation === right.taskId.activation
      );
    case StimulusKind.FireTimer:
      return (
        right.kind === StimulusKind.FireTimer &&
        left.commandId === right.commandId &&
        left.timerId.processInstanceId === right.timerId.processInstanceId &&
        left.timerId.elementId === right.timerId.elementId &&
        left.timerId.activation === right.timerId.activation &&
        left.logicalTimeMs === right.logicalTimeMs
      );
    default:
      return assertNever(left);
  }
}

export function isWellFormedStimulus(value: unknown): value is Stimulus {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  switch (value.kind) {
    case StimulusKind.StartProcess:
      return (
        hasOnlyKeys(value, [
          "kind",
          "commandId",
          "processId",
          "instanceId",
        ]) &&
        isNonEmptyString(value.commandId) &&
        isNonEmptyString(value.processId) &&
        isNonEmptyString(value.instanceId)
      );
    case StimulusKind.CompleteUserTaskInstance:
      return (
        hasOnlyKeys(value, ["kind", "commandId", "taskId"]) &&
        isNonEmptyString(value.commandId) &&
        isRecord(value.taskId) &&
        hasOnlyKeys(value.taskId, [
          "processInstanceId",
          "elementId",
          "activation",
        ]) &&
        isNonEmptyString(value.taskId.processInstanceId) &&
        isNonEmptyString(value.taskId.elementId) &&
        Number.isSafeInteger(value.taskId.activation) &&
        Number(value.taskId.activation) >= 1
      );
    case StimulusKind.FireTimer:
      return (
        hasOnlyKeys(value, [
          "kind",
          "commandId",
          "timerId",
          "logicalTimeMs",
        ]) &&
        isNonEmptyString(value.commandId) &&
        isRecord(value.timerId) &&
        hasOnlyKeys(value.timerId, [
          "processInstanceId",
          "elementId",
          "activation",
        ]) &&
        isNonEmptyString(value.timerId.processInstanceId) &&
        isNonEmptyString(value.timerId.elementId) &&
        Number.isSafeInteger(value.timerId.activation) &&
        Number(value.timerId.activation) >= 1 &&
        Number.isSafeInteger(value.logicalTimeMs) &&
        Number(value.logicalTimeMs) >= 0
      );
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const allowed = new Set(keys);
  return (
    Object.keys(value).length === allowed.size &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic stimulus: ${JSON.stringify(value)}`);
}
