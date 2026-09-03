import {
  EffectExecutionResultKind,
  StimulusKind,
  VariableValueKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteEffectStimulus,
  CompensationEffectTransportMaterial,
  EffectExecutionResult,
  EffectOccurrenceId,
  EffectTransportMaterial,
  OccurrenceId,
  VariableBinding,
} from "@bpmn-lean/semantic-core";

import {
  canonicalTypedTupleEncoding,
} from "./canonical-encoding.js";
import type {
  CanonicalTupleValue,
} from "./canonical-encoding.js";
import { deterministicSha256Hex } from "./deterministic-sha256.js";

export function canonicalEffectTransportEncoding(
  material: EffectTransportMaterial,
): string {
  return canonicalTypedTupleEncoding([
    "effectTransport",
    effectDefinitionTuple(material.definition),
    occurrenceTuple(material.occurrence),
    [
      material.descriptor.protocol,
      material.descriptor.operation,
    ],
    material.arguments.map(variableBindingTuple),
  ]);
}

export function effectTransportKey(
  material: EffectTransportMaterial,
): string {
  return `effect-transport-sha256:${
    deterministicSha256Hex(canonicalEffectTransportEncoding(material))
  }`;
}

export function canonicalCompensationEffectTransportEncoding(
  material: CompensationEffectTransportMaterial,
): string {
  return canonicalTypedTupleEncoding([
    "compensationEffectTransport",
    effectDefinitionTuple(material.definition),
    occurrenceTuple(material.triggerId),
    occurrenceTuple(material.handlerId),
    occurrenceTuple(material.effectId),
    [
      material.descriptor.protocol,
      material.descriptor.operation,
    ],
    material.arguments.map(variableBindingTuple),
  ]);
}

export function compensationEffectTransportKey(
  material: CompensationEffectTransportMaterial,
): string {
  return `effect-transport-sha256:${
    deterministicSha256Hex(
      canonicalCompensationEffectTransportEncoding(material),
    )
  }`;
}

export function canonicalCompleteEffectEncoding(
  effectId: EffectOccurrenceId,
  result: EffectExecutionResult,
): string {
  return canonicalTypedTupleEncoding([
    StimulusKind.CompleteEffect,
    [
      effectId.processInstanceId,
      effectId.elementId,
      effectId.activation,
    ],
    effectExecutionResultTuple(result),
  ]);
}

export function completeEffectCommandId(
  effectId: EffectOccurrenceId,
  result: EffectExecutionResult,
): string {
  return `complete-effect-sha256:${
    deterministicSha256Hex(
      canonicalCompleteEffectEncoding(effectId, result),
    )
  }`;
}

export function completeEffectStimulus(
  effectId: EffectOccurrenceId,
  result: EffectExecutionResult,
): CompleteEffectStimulus {
  return {
    kind: StimulusKind.CompleteEffect,
    commandId: completeEffectCommandId(effectId, result),
    effectId,
    result,
  };
}

function effectExecutionResultTuple(
  result: EffectExecutionResult,
): ReadonlyArray<CanonicalTupleValue> {
  switch (result.kind) {
    case EffectExecutionResultKind.Success:
      return [
        result.kind,
        result.localPatch.map(variableBindingTuple),
      ];
    case EffectExecutionResultKind.BpmnError:
      return [
        result.kind,
        result.code,
        result.message === null
          ? ["none"]
          : ["some", result.message],
        result.localPatch.map(variableBindingTuple),
      ];
    default:
      return assertNever(result);
  }
}

function variableBindingTuple(
  binding: VariableBinding,
): ReadonlyArray<CanonicalTupleValue> {
  return [
    binding.name,
    variableValueTuple(binding),
  ];
}

function effectDefinitionTuple(
  definition: EffectTransportMaterial["definition"],
): ReadonlyArray<CanonicalTupleValue> {
  return [
    definition.semanticProfile,
    definition.sourceId,
    definition.sourceSha256,
    definition.sourceOverlay === null
      ? ["none"]
      : [
          "some",
          definition.sourceOverlay.id,
          definition.sourceOverlay.sha256,
        ],
    definition.processId,
  ];
}

function occurrenceTuple(
  occurrence: OccurrenceId,
): ReadonlyArray<CanonicalTupleValue> {
  return [
    occurrence.processInstanceId,
    occurrence.elementId,
    occurrence.activation,
  ];
}

function variableValueTuple(
  binding: VariableBinding,
): ReadonlyArray<CanonicalTupleValue> {
  switch (binding.value.kind) {
    case VariableValueKind.Boolean:
      return [binding.value.kind, binding.value.value];
    case VariableValueKind.String:
      return [binding.value.kind, binding.value.value];
    case VariableValueKind.Integer:
    case VariableValueKind.StringList:
      throw new TypeError(
        `Unsupported effect transport variant: ${JSON.stringify(binding.value)}`,
      );
    case VariableValueKind.Null:
      return [binding.value.kind];
    default:
      return assertNever(binding.value);
  }
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported effect transport variant: ${JSON.stringify(value)}`,
  );
}
