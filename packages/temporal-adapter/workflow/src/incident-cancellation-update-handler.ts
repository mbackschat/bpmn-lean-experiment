/** Workflow Update definition and strict payload validation for incident-gated Process cancellation. */
import {
  ApplicationFailure,
  defineUpdate,
} from "@temporalio/workflow";
import {
  StimulusKind,
  isWellFormedStimulus,
  sameStimulus,
  stimulusCommandId,
} from "@bpmn-lean/semantic-core";
import type {
  CancelIncidentProcessStimulus,
  CommandOutcome,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  bpmnCancelIncidentProcessUpdateName,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnCancelIncidentProcessUpdateArguments,
} from "@bpmn-lean/temporal-protocol";

export const bpmnCancelIncidentProcessUpdate: ReturnType<
  typeof defineUpdate<CommandOutcome, BpmnCancelIncidentProcessUpdateArguments>
> = defineUpdate<CommandOutcome, BpmnCancelIncidentProcessUpdateArguments>(
  bpmnCancelIncidentProcessUpdateName,
);

export function validateCancelIncidentProcessUpdate(
  acceptedStimuli: ReadonlyArray<Stimulus>,
  hostingProcessInstanceId: string,
  stimulus: CancelIncidentProcessStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isWellFormedStimulus(value) ||
    value.kind !== StimulusKind.CancelIncidentProcess ||
    value.processInstanceId !== hostingProcessInstanceId ||
    value.incidentId.effectId.processInstanceId !== hostingProcessInstanceId
  ) {
    throw new TypeError(
      "Incident cancellation Update must be exact and bind every Process identity to its host",
    );
  }
  const accepted = acceptedStimuli.find(
    (candidate) => stimulusCommandId(candidate) === value.commandId,
  );
  if (accepted !== undefined && !sameStimulus(accepted, value)) {
    throw ApplicationFailure.nonRetryable(
      `Command ID ${value.commandId} was reused with a different stimulus`,
      "BpmnCommandIdentityConflict",
    );
  }
}
