import {
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteEffectStimulus,
  EffectOccurrenceId,
  EffectTransportMaterial,
} from "@bpmn-lean/semantic-core";

import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";
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
): string {
  return canonicalTypedTupleEncoding([
    StimulusKind.CompleteEffect,
    [
      effectId.processInstanceId,
      effectId.elementId,
      effectId.activation,
    ],
  ]);
}

export function completeEffectCommandId(
  effectId: EffectOccurrenceId,
): string {
  return `complete-effect-sha256:${
    deterministicSha256Hex(canonicalCompleteEffectEncoding(effectId))
  }`;
}

export function completeEffectStimulus(
  effectId: EffectOccurrenceId,
): CompleteEffectStimulus {
  return {
    kind: StimulusKind.CompleteEffect,
    commandId: completeEffectCommandId(effectId),
    effectId,
  };
}
