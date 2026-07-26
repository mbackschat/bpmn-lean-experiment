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
