/** Stable transport names and deterministic identities for the incident report/retry host seam. */
import { StimulusKind } from "@bpmn-lean/semantic-core";
import type {
  CommandOutcome,
  CancelIncidentProcessStimulus,
  EffectOccurrenceId,
  ReportEffectFailureStimulus,
  RetryIncidentStimulus,
} from "@bpmn-lean/semantic-core";

import { canonicalTypedTupleEncoding } from "./canonical-encoding.js";
import { deterministicSha256Hex } from "./deterministic-sha256.js";

export const bpmnRetryEffectIncidentUpdateName =
  "bpmn-retry-effect-incident";
export const bpmnCancelIncidentProcessUpdateName =
  "bpmn-cancel-incident-process";

export type BpmnRetryEffectIncidentUpdateArguments = [
  stimulus: RetryIncidentStimulus,
];

export type BpmnRetryEffectIncidentUpdateResult = CommandOutcome;

export type BpmnCancelIncidentProcessUpdateArguments = [
  stimulus: CancelIncidentProcessStimulus,
];

export type BpmnCancelIncidentProcessUpdateResult = CommandOutcome;

export function reportEffectFailureCommandId(
  effectId: EffectOccurrenceId,
): string {
  const encoded = canonicalTypedTupleEncoding([
    StimulusKind.ReportEffectFailure,
    [
      effectId.processInstanceId,
      effectId.elementId,
      effectId.activation,
    ],
    1,
  ]);
  return `report-effect-failure-sha256:${deterministicSha256Hex(encoded)}`;
}

export function reportEffectFailureStimulus(
  effectId: EffectOccurrenceId,
): ReportEffectFailureStimulus {
  return {
    kind: StimulusKind.ReportEffectFailure,
    commandId: reportEffectFailureCommandId(effectId),
    effectId,
    generation: 1,
  };
}
