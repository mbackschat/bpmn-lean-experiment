/**
 * Derives what a host should have observed, from the semantic core's result and the neutral
 * schedule alone.
 *
 * These are expectations rather than evidence: every value here is computed from the scenario's own
 * stimuli and the semantic-core trace, never from a target's answer, so comparing a host against
 * them stays a differential check. They live apart from canonical comparison because they answer a
 * different question: comparison asks whether targets agree, and this asks which state each host
 * interaction should have been taken in.
 */
import {
  CanonicalObservationKind,
  StimulusKind,
} from "@bpmn-lean/semantic-core";
import type {
  CommandOutcome,
  OpenUserTask,
  ScenarioResult,
  Scenario,
} from "@bpmn-lean/semantic-core";

export type HostInteractionExpectations = Readonly<{
  completionOutcomes: ReadonlyArray<CommandOutcome>;
  openUserTasksAfterCompletions: ReadonlyArray<ReadonlyArray<OpenUserTask>>;
  openUserTasksAtFirstCompletionWait: ReadonlyArray<OpenUserTask>;
}>;

/**
 * @param dropFinalCompletionOutcome drops the last completion's outcome, for a post-terminal
 * schedule whose final command is refused by a closed Process rather than answered semantically.
 */
export function hostInteractionExpectations(
  scenario: Scenario,
  semanticCoreResult: ScenarioResult,
  dropFinalCompletionOutcome: boolean,
): HostInteractionExpectations {
  const completions = scenario.stimuli.slice(1).filter(
    (stimulus) => stimulus.kind === StimulusKind.CompleteUserTaskInstance,
  );
  const commandIds = new Set(completions.map(({ commandId }) => commandId));
  const completionOutcomes = semanticCoreResult.trace.flatMap((observation) =>
    observation.kind === CanonicalObservationKind.Command &&
      commandIds.has(observation.commandId)
      ? [observation.outcome]
      : []
  );
  if (dropFinalCompletionOutcome) {
    completionOutcomes.pop();
  }
  return {
    completionOutcomes,
    openUserTasksAfterCompletions: completions
      .slice(0, -1)
      .map(({ commandId }) => openUserTasksAfter(semanticCoreResult, commandId)),
    openUserTasksAtFirstCompletionWait: openUserTasksWhenElementOpens(
      semanticCoreResult,
      completions[0]?.taskId.elementId,
    ),
  };
}

function openUserTasksAfter(
  semanticCoreResult: ScenarioResult,
  commandId: string,
): ReadonlyArray<OpenUserTask> {
  const commandIndex = semanticCoreResult.trace.findIndex(
    (observation) =>
      observation.kind === CanonicalObservationKind.Command &&
      observation.commandId === commandId,
  );
  const state = semanticCoreResult.trace[commandIndex + 1];
  if (commandIndex < 0 || state?.kind !== CanonicalObservationKind.State) {
    throw new Error(`No stable state follows completion ${commandId}`);
  }
  return state.openUserTasks;
}

/**
 * The tasks open in the state where `elementId` first has one.
 *
 * The runner queries its open tasks once it has waited for the first completion's element, so this
 * is the state that interaction was taken in. Deriving it from the element rather than from trace
 * position keeps families with different progress shapes on one rule: host-driven progress may open
 * the awaited task beside a task that stays open, replace an already open one, or precede any task.
 *
 * The occurrence's activation is deliberately not matched. A schedule whose completion names a
 * stale activation is refused by design, and the runner still waits for that element's live task
 * before sending it, so matching the occurrence would find no state for exactly the schedules
 * written to exercise a refusal.
 */
function openUserTasksWhenElementOpens(
  semanticCoreResult: ScenarioResult,
  elementId: string | undefined,
): ReadonlyArray<OpenUserTask> {
  const state = semanticCoreResult.trace.find(
    (observation) =>
      observation.kind === CanonicalObservationKind.State &&
      observation.openUserTasks.some(({ id }) => id.elementId === elementId),
  );
  return state?.kind === CanonicalObservationKind.State
    ? state.openUserTasks
    : [];
}
