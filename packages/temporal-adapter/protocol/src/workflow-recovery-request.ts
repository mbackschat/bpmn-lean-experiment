import {
  StimulusKind,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  Stimulus,
} from "@bpmn-lean/semantic-core";

import { canonicalStimulusEncoding } from "./command-identity.js";
import { deterministicSha256Hex } from "./deterministic-sha256.js";
import type {
  WorkflowChainCommandRecoveryRequest,
} from "./workflow-chain.js";
import { bpmnWorkflowChainProtocolV1 } from "./workflow-chain.js";

export type ExternallyRetryableStimulus = Extract<Stimulus, {
  kind:
    | StimulusKind.CompleteUserTaskInstance
    | StimulusKind.DeliverMessage
    | StimulusKind.DeliverPayloadMessage
    | StimulusKind.DeliverCorrelatedPayloadMessage
    | StimulusKind.RetryIncident
    | StimulusKind.CancelIncidentProcess;
}>;

/** Builds the exact chain-relative identity for one externally retryable command. */
export function buildWorkflowChainRecoveryRequest(
  processInstanceId: string,
  stimulus: ExternallyRetryableStimulus,
): WorkflowChainCommandRecoveryRequest;
export function buildWorkflowChainRecoveryRequest(
  processInstanceId: string,
  stimulus: Stimulus,
): WorkflowChainCommandRecoveryRequest {
  if (!isWellFormedWireString(processInstanceId) || processInstanceId.length === 0) {
    throw new TypeError("Process-instance ID must be one non-empty wire string");
  }
  const encoded = canonicalStimulusEncoding(stimulus);
  switch (stimulus.kind) {
    case StimulusKind.CompleteUserTaskInstance:
      // A root-hosted Call Activity may expose a User Task owned by its called Process. The Query
      // stays addressed to the hosting Workflow while the complete called-task identity remains in
      // the canonical stimulus digest.
      break;
    case StimulusKind.DeliverMessage:
    case StimulusKind.DeliverPayloadMessage:
    case StimulusKind.DeliverCorrelatedPayloadMessage:
      requireProcessInstanceIdentity(
        processInstanceId,
        stimulus.subscriptionId.processInstanceId,
      );
      break;
    case StimulusKind.RetryIncident:
      requireProcessInstanceIdentity(
        processInstanceId,
        stimulus.incidentId.effectId.processInstanceId,
      );
      break;
    case StimulusKind.CancelIncidentProcess:
      requireProcessInstanceIdentity(processInstanceId, stimulus.processInstanceId);
      requireProcessInstanceIdentity(
        processInstanceId,
        stimulus.incidentId.effectId.processInstanceId,
      );
      break;
    case StimulusKind.StartProcess:
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
    case StimulusKind.FireTimer:
    case StimulusKind.CompleteEffect:
    case StimulusKind.ReportEffectFailure:
      throw new TypeError(
        "Workflow-chain recovery requires an externally retryable stimulus",
      );
    default:
      return assertNever(stimulus);
  }
  return {
    protocol: bpmnWorkflowChainProtocolV1,
    processInstanceId,
    commandId: stimulus.commandId,
    stimulusSha256: deterministicSha256Hex(encoded),
  };
}

function requireProcessInstanceIdentity(
  expected: string,
  observed: string,
): void {
  if (observed !== expected) {
    throw new TypeError("Recovery stimulus has a mismatched Process-instance ID");
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported externally retryable stimulus: ${String(value)}`);
}
