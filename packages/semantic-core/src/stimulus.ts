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
    case StimulusKind.DeliverMessage:
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
    case StimulusKind.DeliverMessage:
      return (
        right.kind === StimulusKind.DeliverMessage &&
        left.commandId === right.commandId &&
        sameOccurrenceId(left.subscriptionId, right.subscriptionId) &&
        sameMessageChannel(left.channel, right.channel)
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
    case StimulusKind.DeliverMessage:
      return (
        hasOnlyKeys(value, [
          "kind",
          "commandId",
          "subscriptionId",
          "channel",
        ]) &&
        isNonEmptyString(value.commandId) &&
        isOccurrenceId(value.subscriptionId) &&
        isMessageChannel(value.channel)
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

function sameOccurrenceId(
  left: import("./contract.js").OccurrenceId,
  right: import("./contract.js").OccurrenceId,
): boolean {
  return left.processInstanceId === right.processInstanceId &&
    left.elementId === right.elementId &&
    left.activation === right.activation;
}

function sameMessageChannel(
  left: import("./semantic-process-contract.js").MessageChannel,
  right: import("./semantic-process-contract.js").MessageChannel,
): boolean {
  return left.interfaceId === right.interfaceId &&
    left.interfaceOperationId === right.interfaceOperationId &&
    left.messageId === right.messageId;
}

function isMessageChannel(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, [
      "interfaceId",
      "interfaceOperationId",
      "messageId",
    ]) &&
    isNonEmptyString(value.interfaceId) &&
    isNonEmptyString(value.interfaceOperationId) &&
    isNonEmptyString(value.messageId);
}

function sameEffectResult(
  left: import("./contract.js").EffectExecutionResult,
  right: import("./contract.js").EffectExecutionResult,
): boolean {
  if (left.kind !== right.kind || !samePatch(left.localPatch, right.localPatch)) {
    return false;
  }
  switch (left.kind) {
    case EffectExecutionResultKind.Success:
      return true;
    case EffectExecutionResultKind.BpmnError:
      return (
        right.kind === EffectExecutionResultKind.BpmnError &&
        left.code === right.code &&
        left.message === right.message
      );
    default:
      return assertNever(left);
  }
}

export function isWellFormedEffectExecutionResult(
  value: unknown,
): value is import("./contract.js").EffectExecutionResult {
  if (
    !isRecord(value) ||
    !Array.isArray(value.localPatch) ||
    !value.localPatch.every(isVariableBinding) ||
    !isCanonicallyOrderedPatch(value.localPatch)
  ) {
    return false;
  }
  switch (value.kind) {
    case EffectExecutionResultKind.Success:
      return hasOnlyKeys(value, ["kind", "localPatch"]);
    case EffectExecutionResultKind.BpmnError:
      return (
        hasOnlyKeys(value, [
          "kind",
          "code",
          "message",
          "localPatch",
        ]) &&
        isNonEmptyString(value.code) &&
        (value.message === null || isNonEmptyString(value.message))
      );
    default:
      return false;
  }
}

function isVariableBinding(
  value: unknown,
): value is import("./contract.js").VariableBinding {
  return isRecord(value) &&
    hasOnlyKeys(value, ["name", "value"]) &&
    isNonEmptyString(value.name) &&
    isRecord(value.value) &&
    isVariableValue(value.value);
}

function isVariableValue(value: Record<string, unknown>): boolean {
  switch (value.kind) {
    case VariableValueKind.String:
      return (
        hasOnlyKeys(value, ["kind", "value"]) &&
        isWellFormedWireString(value.value)
      );
    case VariableValueKind.Null:
      return hasOnlyKeys(value, ["kind"]);
    default:
      return false;
  }
}

function isCanonicallyOrderedPatch(
  value: ReadonlyArray<unknown>,
): boolean {
  const patch = value as ReadonlyArray<
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

function samePatch(
  left: ReadonlyArray<import("./contract.js").VariableBinding>,
  right: ReadonlyArray<import("./contract.js").VariableBinding>,
): boolean {
  return left.length === right.length &&
    left.every((binding, index) => {
      const candidate = right[index];
      return candidate !== undefined &&
        binding.name === candidate.name &&
        sameVariableValue(binding.value, candidate.value);
    });
}

function sameVariableValue(
  left: import("./contract.js").VariableValue,
  right: import("./contract.js").VariableValue,
): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case VariableValueKind.String:
      return (
        right.kind === VariableValueKind.String &&
        left.value === right.value
      );
    case VariableValueKind.Null:
      return true;
    default:
      return assertNever(left);
  }
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
