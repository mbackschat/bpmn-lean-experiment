import {
  EffectExecutionResultKind,
  StimulusKind,
} from "./contract.js";
import type {
  Stimulus,
} from "./contract.js";
import { isWellFormedWireString } from "./wire.js";
import {
  isMessageChannel,
  sameMessageChannel,
} from "./message-channel.js";
import { MessageChannelKind } from "./semantic-value-contract.js";
import {
  isVariablePatch,
  sameVariablePatch,
} from "./variable-value.js";

export function stimulusCommandId(stimulus: Stimulus): string {
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
    case StimulusKind.CompleteUserTaskInstance:
    case StimulusKind.DeliverMessage:
    case StimulusKind.FireTimer:
    case StimulusKind.CompleteEffect:
    case StimulusKind.ReportEffectFailure:
    case StimulusKind.RetryIncident:
    case StimulusKind.CancelIncidentProcess:
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
        left.instanceId === right.instanceId &&
        sameVariablePatch(left.initialVariables, right.initialVariables)
      );
    case StimulusKind.TriggerMessageStart:
      return (
        right.kind === StimulusKind.TriggerMessageStart &&
        left.commandId === right.commandId &&
        left.processId === right.processId &&
        left.instanceId === right.instanceId &&
        left.startEventId === right.startEventId &&
        sameMessageChannel(left.channel, right.channel)
      );
    case StimulusKind.TriggerTimerStart:
      return (
        right.kind === StimulusKind.TriggerTimerStart &&
        left.commandId === right.commandId &&
        left.processId === right.processId &&
        left.instanceId === right.instanceId &&
        left.startEventId === right.startEventId
      );
    case StimulusKind.CompleteUserTaskInstance:
      return (
        right.kind === StimulusKind.CompleteUserTaskInstance &&
        left.commandId === right.commandId &&
        left.taskId.processInstanceId === right.taskId.processInstanceId &&
        left.taskId.elementId === right.taskId.elementId &&
        left.taskId.activation === right.taskId.activation &&
        sameVariablePatch(left.submittedValues, right.submittedValues)
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
    case StimulusKind.ReportEffectFailure:
      return (
        right.kind === StimulusKind.ReportEffectFailure &&
        left.commandId === right.commandId &&
        sameOccurrenceId(left.effectId, right.effectId) &&
        left.generation === right.generation
      );
    case StimulusKind.RetryIncident:
      return (
        right.kind === StimulusKind.RetryIncident &&
        left.commandId === right.commandId &&
        sameEffectIncidentId(left.incidentId, right.incidentId)
      );
    case StimulusKind.CancelIncidentProcess:
      return (
        right.kind === StimulusKind.CancelIncidentProcess &&
        left.commandId === right.commandId &&
        left.processInstanceId === right.processInstanceId &&
        sameEffectIncidentId(left.incidentId, right.incidentId)
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
          "initialVariables",
        ]) &&
        isNonEmptyString(value.commandId) &&
        isNonEmptyString(value.processId) &&
        isNonEmptyString(value.instanceId) &&
        isVariablePatch(value.initialVariables)
      );
    case StimulusKind.TriggerMessageStart:
      return (
        hasOnlyKeys(value, [
          "kind",
          "commandId",
          "processId",
          "instanceId",
          "startEventId",
          "channel",
        ]) &&
        isNonEmptyString(value.commandId) &&
        isNonEmptyString(value.processId) &&
        isNonEmptyString(value.instanceId) &&
        isNonEmptyString(value.startEventId) &&
        isMessageChannel(value.channel) &&
        value.channel.kind === MessageChannelKind.OperationMessage
      );
    case StimulusKind.TriggerTimerStart:
      return (
        hasOnlyKeys(value, [
          "kind",
          "commandId",
          "processId",
          "instanceId",
          "startEventId",
        ]) &&
        isNonEmptyString(value.commandId) &&
        isNonEmptyString(value.processId) &&
        isNonEmptyString(value.instanceId) &&
        isNonEmptyString(value.startEventId)
      );
    case StimulusKind.CompleteUserTaskInstance:
      return (
        hasOnlyKeys(value, [
          "kind",
          "commandId",
          "taskId",
          "submittedValues",
        ]) &&
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
        Number(value.taskId.activation) >= 1 &&
        isVariablePatch(value.submittedValues)
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
    case StimulusKind.ReportEffectFailure:
      return (
        hasOnlyKeys(value, [
          "kind",
          "commandId",
          "effectId",
          "generation",
        ]) &&
        isNonEmptyString(value.commandId) &&
        isOccurrenceId(value.effectId) &&
        value.generation === 1
      );
    case StimulusKind.RetryIncident:
      return (
        hasOnlyKeys(value, ["kind", "commandId", "incidentId"]) &&
        isNonEmptyString(value.commandId) &&
        isEffectIncidentId(value.incidentId)
      );
    case StimulusKind.CancelIncidentProcess:
      return (
        hasOnlyKeys(value, [
          "kind",
          "commandId",
          "processInstanceId",
          "incidentId",
        ]) &&
        isNonEmptyString(value.commandId) &&
        isNonEmptyString(value.processInstanceId) &&
        isEffectIncidentId(value.incidentId)
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

function sameEffectIncidentId(
  left: import("./contract.js").EffectIncidentId,
  right: import("./contract.js").EffectIncidentId,
): boolean {
  return left.generation === right.generation &&
    sameOccurrenceId(left.effectId, right.effectId);
}

function sameEffectResult(
  left: import("./contract.js").EffectExecutionResult,
  right: import("./contract.js").EffectExecutionResult,
): boolean {
  if (
    left.kind !== right.kind ||
    !sameVariablePatch(left.localPatch, right.localPatch)
  ) {
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
    !isVariablePatch(value.localPatch)
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

function isEffectIncidentId(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, ["effectId", "generation"]) &&
    isOccurrenceId(value.effectId) &&
    value.generation === 1;
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
