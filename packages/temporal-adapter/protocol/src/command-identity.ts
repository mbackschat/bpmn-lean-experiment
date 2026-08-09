import {
  EffectExecutionResultKind,
  MessageChannelKind,
  StimulusKind,
  VariableValueKind,
  isWellFormedStimulus,
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
      return canonicalTypedTupleEncoding([
        stimulus.kind,
        stimulus.commandId,
        stimulus.processId,
        stimulus.instanceId,
        stimulus.initialVariables.map(variableBindingTuple),
      ]);
    case StimulusKind.CompleteUserTaskInstance:
      return canonicalTypedTupleEncoding([
        stimulus.kind,
        stimulus.commandId,
        [
          stimulus.taskId.processInstanceId,
          stimulus.taskId.elementId,
          stimulus.taskId.activation,
        ],
        stimulus.submittedValues.map(variableBindingTuple),
      ]);
    case StimulusKind.DeliverMessage:
      return canonicalTypedTupleEncoding([
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
      return canonicalTypedTupleEncoding([
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
      return canonicalTypedTupleEncoding([
        stimulus.kind,
        stimulus.commandId,
        [
          stimulus.effectId.processInstanceId,
          stimulus.effectId.elementId,
          stimulus.effectId.activation,
        ],
        effectResultTuple(stimulus.result),
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
  const patch = result.localPatch.map(variableBindingTuple);
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
    case VariableValueKind.String:
      return [
        binding.name,
        [binding.value.kind, binding.value.value],
      ];
    case VariableValueKind.Null:
      return [binding.name, [binding.value.kind]];
    default:
      return assertNever(binding.value);
  }
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
