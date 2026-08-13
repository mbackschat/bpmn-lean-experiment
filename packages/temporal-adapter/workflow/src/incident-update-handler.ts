/** Workflow Update definition and strict payload validation for one incident retry. */
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
  CommandOutcome,
  RetryIncidentStimulus,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  bpmnRetryEffectIncidentUpdateName,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnRetryEffectIncidentUpdateArguments,
} from "@bpmn-lean/temporal-protocol";

export const bpmnRetryEffectIncidentUpdate: ReturnType<
  typeof defineUpdate<CommandOutcome, BpmnRetryEffectIncidentUpdateArguments>
> = defineUpdate<CommandOutcome, BpmnRetryEffectIncidentUpdateArguments>(
  bpmnRetryEffectIncidentUpdateName,
);

export function validateRetryEffectIncidentUpdate(
  acceptedStimuli: ReadonlyArray<Stimulus>,
  stimulus: RetryIncidentStimulus,
): void {
  const value = stimulus as unknown;
  if (
    !isWellFormedStimulus(value) ||
    value.kind !== StimulusKind.RetryIncident
  ) {
    throw new TypeError(
      "Incident retry Update must contain one well-formed retry stimulus",
    );
  }
  const accepted = acceptedStimuli.find(
    (candidate) => stimulusCommandId(candidate) === stimulus.commandId,
  );
  if (accepted !== undefined && !sameStimulus(accepted, stimulus)) {
    throw ApplicationFailure.nonRetryable(
      `Command ID ${stimulus.commandId} was reused with a different stimulus`,
      "BpmnCommandIdentityConflict",
    );
  }
}
