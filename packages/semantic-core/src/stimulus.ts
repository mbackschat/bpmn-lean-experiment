import {
  EffectExecutionResultKind,
  StimulusKind,
  VariableValueKind,
} from "./contract.js";
import type {
  Stimulus,
} from "./contract.js";
import {
  compareCanonicalStrings,
  isWellFormedWireString,
} from "./wire.js";

export function stimulusCommandId(stimulus: Stimulus): string {
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
    case StimulusKind.CompleteUserTaskInstance:
    case StimulusKind.FireTimer:
    case StimulusKind.CompleteEffect:
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
    case StimulusKind.CompleteEffect:
      return (
        right.kind === StimulusKind.CompleteEffect &&
        left.commandId === right.commandId &&
        left.effectId.processInstanceId ===
          right.effectId.processInstanceId &&
        left.effectId.elementId === right.effectId.elementId &&
        left.effectId.activation === right.effectId.activation &&
        sameEffectResult(left.result, right.result)
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
    case StimulusKind.CompleteEffect:
      return (
        hasOnlyKeys(value, ["kind", "commandId", "effectId", "result"]) &&
        isNonEmptyString(value.commandId) &&
        isOccurrenceId(value.effectId) &&
        isWellFormedEffectExecutionResult(value.result)
      );
    default:
      return false;
  }
}

function sameEffectResult(
  left: import("./contract.js").EffectExecutionResult,
  right: import("./contract.js").EffectExecutionResult,
): boolean {
  return left.kind === right.kind &&
    left.localPatch.length === right.localPatch.length &&
    left.localPatch.every((binding, index) => {
      const candidate = right.localPatch[index];
      return candidate !== undefined &&
        binding.name === candidate.name &&
        binding.value.kind === candidate.value.kind &&
        binding.value.value === candidate.value.value;
    });
}

export function isWellFormedEffectExecutionResult(
  value: unknown,
): value is import("./contract.js").EffectExecutionResult {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["kind", "localPatch"]) ||
    value.kind !== EffectExecutionResultKind.Success ||
    !Array.isArray(value.localPatch) ||
    !value.localPatch.every(isVariableBinding)
  ) {
    return false;
  }
  const patch = value.localPatch as ReadonlyArray<
    import("./contract.js").VariableBinding
  >;
  return patch.every((binding, index) =>
      index === 0 ||
      compareCanonicalStrings(
        String(patch[index - 1]?.name),
        binding.name,
      ) < 0
    );
}

function isVariableBinding(
  value: unknown,
): value is import("./contract.js").VariableBinding {
  return isRecord(value) &&
    hasOnlyKeys(value, ["name", "value"]) &&
    isNonEmptyString(value.name) &&
    isRecord(value.value) &&
    hasOnlyKeys(value.value, ["kind", "value"]) &&
    value.value.kind === VariableValueKind.String &&
    isWellFormedWireString(value.value.value);
}

function isOccurrenceId(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "processInstanceId",
      "elementId",
      "activation",
    ]) &&
    isNonEmptyString(value.processInstanceId) &&
    isNonEmptyString(value.elementId) &&
    Number.isSafeInteger(value.activation) &&
    Number(value.activation) >= 1
  );
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
  return isWellFormedWireString(value) && value.length > 0;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic stimulus: ${JSON.stringify(value)}`);
}
