import {
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  Scenario,
} from "@bpmn-lean/semantic-core";

/**
 * Reports whether a retained scenario must let the host advance before it
 * submits a later User Task completion.
 *
 * Timer and effect stimuli are host-driven. Their successors may not be
 * visible when the initial stable state is observed, so the conformance
 * harness waits for the exact User Task occurrence before submitting its
 * completion. A User Task-only negative scenario remains immediate so it can
 * deliberately submit a non-enabled occurrence.
 */
export function requiresHostProgressBeforeCompletion(
  scenario: Scenario,
  completion: CompleteUserTaskInstanceStimulus,
): boolean {
  const completionIndex = scenario.stimuli.indexOf(completion);
  if (completionIndex < 0) {
    throw new TypeError(
      "User Task completion is not part of the admitted scenario",
    );
  }
  return scenario.stimuli
    .slice(1, completionIndex)
    .some((stimulus) => {
      switch (stimulus.kind) {
        case StimulusKind.FireTimer:
        case StimulusKind.CompleteEffect:
        case StimulusKind.DeliverMessage:
          return true;
        case StimulusKind.StartProcess:
        case StimulusKind.CompleteUserTaskInstance:
          return false;
      }
    });
}
