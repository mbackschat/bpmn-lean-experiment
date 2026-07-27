import { StimulusKind } from "@bpmn-lean/semantic-core";
import type {
  CompleteEffectStimulus,
  EffectExecutionResult,
  EffectOccurrenceId,
  EffectTransportMaterial,
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
    [
      material.definition.semanticProfile,
      material.definition.sourceId,
      material.definition.sourceSha256,
      material.definition.processId,
    ],
    [
      material.occurrence.processInstanceId,
      material.occurrence.elementId,
      material.occurrence.activation,
    ],
    [
      material.descriptor.protocol,
      material.descriptor.handler,
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
  return [
    result.kind,
    result.localPatch.map(variableBindingTuple),
  ];
}

function variableBindingTuple(
  binding: VariableBinding,
): ReadonlyArray<CanonicalTupleValue> {
  return [
    binding.name,
    [binding.value.kind, binding.value.value],
  ];
}
