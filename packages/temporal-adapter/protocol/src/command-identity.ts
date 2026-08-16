import {
  EffectExecutionResultKind,
  MessageChannelKind,
  StimulusKind,
  VariableValueKind,
  isWellFormedStimulus,
  utf8ByteLength,
} from "@bpmn-lean/semantic-core";
import type {
  MessageChannel,
  Stimulus,
  VariableBinding,
} from "@bpmn-lean/semantic-core";
import type {
  CanonicalTupleValue,
} from "./canonical-encoding.js";

import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";
import { deterministicSha256Hex } from "./deterministic-sha256.js";

export function canonicalStimulusEncoding(stimulus: unknown): string {
  if (!isWellFormedStimulus(stimulus)) {
    throw new TypeError(
      "Update identity requires one well-formed semantic stimulus",
    );
  }
  switch (stimulus.kind) {
    case StimulusKind.StartProcess:
      return encodeCommandTuple([
        stimulus.kind,
        stimulus.commandId,
        stimulus.processId,
        stimulus.instanceId,
        variablePatchTuple(stimulus.initialVariables),
      ]);
    case StimulusKind.TriggerMessageStart:
      return encodeCommandTuple([
        stimulus.kind,
        stimulus.commandId,
        stimulus.processId,
        stimulus.instanceId,
        stimulus.startEventId,
        messageChannelTuple(stimulus.channel),
      ]);
    case StimulusKind.TriggerTimerStart:
      return encodeCommandTuple([
        stimulus.kind,
        stimulus.commandId,
        stimulus.processId,
        stimulus.instanceId,
        stimulus.startEventId,
      ]);
    case StimulusKind.CompleteUserTaskInstance:
      return encodeCommandTuple([
        stimulus.kind,
        stimulus.commandId,
        [
          stimulus.taskId.processInstanceId,
          stimulus.taskId.elementId,
          stimulus.taskId.activation,
        ],
        variablePatchTuple(stimulus.submittedValues),
      ]);
    case StimulusKind.DeliverMessage:
      return encodeCommandTuple([
        stimulus.kind,
        stimulus.commandId,
        [
          stimulus.subscriptionId.processInstanceId,
          stimulus.subscriptionId.elementId,
          stimulus.subscriptionId.activation,
        ],
        messageChannelTuple(stimulus.channel),
      ]);
    case StimulusKind.FireTimer:
      return encodeCommandTuple([
        stimulus.kind,
        stimulus.commandId,
        [
          stimulus.timerId.processInstanceId,
          stimulus.timerId.elementId,
          stimulus.timerId.activation,
        ],
        stimulus.logicalTimeMs,
      ]);
    case StimulusKind.CompleteEffect:
      return encodeCommandTuple([
        stimulus.kind,
        stimulus.commandId,
        [
          stimulus.effectId.processInstanceId,
          stimulus.effectId.elementId,
          stimulus.effectId.activation,
        ],
        effectResultTuple(stimulus.result),
      ]);
    case StimulusKind.ReportEffectFailure:
      return encodeCommandTuple([
        stimulus.kind,
        stimulus.commandId,
        [
          stimulus.effectId.processInstanceId,
          stimulus.effectId.elementId,
          stimulus.effectId.activation,
        ],
        stimulus.generation,
      ]);
    case StimulusKind.RetryIncident:
      return encodeCommandTuple([
        stimulus.kind,
        stimulus.commandId,
        [
          stimulus.incidentId.effectId.processInstanceId,
          stimulus.incidentId.effectId.elementId,
          stimulus.incidentId.effectId.activation,
        ],
        stimulus.incidentId.generation,
      ]);
    case StimulusKind.CancelIncidentProcess:
      return encodeCommandTuple([
        stimulus.kind,
        stimulus.commandId,
        stimulus.processInstanceId,
        [
          stimulus.incidentId.effectId.processInstanceId,
          stimulus.incidentId.effectId.elementId,
          stimulus.incidentId.effectId.activation,
        ],
        stimulus.incidentId.generation,
      ]);
    default:
      return assertNever(stimulus);
  }
}

function messageChannelTuple(
  channel: MessageChannel,
): ReadonlyArray<CanonicalTupleValue> {
  switch (channel.kind) {
    case MessageChannelKind.OperationMessage:
      return [
        channel.kind,
        channel.interfaceId,
        channel.interfaceOperationId,
        channel.messageId,
      ];
    case MessageChannelKind.DirectMessage:
      return [channel.kind, channel.messageId];
    default:
      return assertNever(channel);
  }
}

function effectResultTuple(
  result: Extract<
    Stimulus,
    { kind: StimulusKind.CompleteEffect }
  >["result"],
): ReadonlyArray<import("./canonical-encoding.js").CanonicalTupleValue> {
  const patch = variablePatchTuple(result.localPatch);
  switch (result.kind) {
    case EffectExecutionResultKind.Success:
      return [result.kind, patch];
    case EffectExecutionResultKind.BpmnError:
      return [
        result.kind,
        result.code,
        result.message === null
          ? ["none"]
          : ["some", result.message],
        patch,
      ];
    default:
      return assertNever(result);
  }
}

function variableBindingTuple(
  binding: VariableBinding,
): ReadonlyArray<import("./canonical-encoding.js").CanonicalTupleValue> {
  switch (binding.value.kind) {
    case VariableValueKind.Boolean:
      return [
        binding.name,
        [binding.value.kind, binding.value.value],
      ];
    case VariableValueKind.String:
      return [
        binding.name,
        [binding.value.kind, binding.value.value],
      ];
    case VariableValueKind.Integer:
      return [
        binding.name,
        [binding.value.kind, binding.value.value],
      ];
    case VariableValueKind.StringList:
      return [
        binding.name,
        [binding.value.kind, [...binding.value.value]],
      ];
    case VariableValueKind.Null:
      return [binding.name, [binding.value.kind]];
    default:
      return assertNever(binding.value);
  }
}

function variablePatchTuple(
  bindings: ReadonlyArray<VariableBinding>,
): ReadonlyArray<CanonicalTupleValue> {
  const patch = bindings.map((binding) => {
    const tuple = variableBindingTuple(binding);
    if (utf8ByteLength(canonicalTypedTupleEncoding(tuple)) > 20_480) {
      throw new RangeError("Variable binding exceeds 20480 canonical UTF-8 bytes");
    }
    return tuple;
  });
  if (utf8ByteLength(canonicalTypedTupleEncoding(patch)) > 65_536) {
    throw new RangeError("Variable patch exceeds 65536 canonical UTF-8 bytes");
  }
  return patch;
}

function encodeCommandTuple(tuple: ReadonlyArray<CanonicalTupleValue>): string {
  const encoded = canonicalTypedTupleEncoding(tuple);
  if (utf8ByteLength(encoded) > 131_072) {
    throw new RangeError("Content-bound command exceeds 131072 canonical UTF-8 bytes");
  }
  return encoded;
}

export function contentBoundUpdateId(stimulus: Stimulus): string {
  const digest = deterministicSha256Hex(canonicalStimulusEncoding(stimulus));
  return `bpmn-command-sha256:${digest}`;
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported semantic stimulus for Update identity: ${JSON.stringify(value)}`,
  );
}
