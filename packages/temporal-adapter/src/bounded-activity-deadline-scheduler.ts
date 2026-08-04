/**
 * Durable readiness scheduling for one bounded User Task and its interrupting boundary deadline.
 *
 * This module owns what is specific to the family: which committed state counts as one bounded pair,
 * and that a completion and its deadline sharing one activation is refused under this family's own
 * identity. That identity is deliberately distinct from the Event-race one: the host mechanisms
 * coincide, but the semantic claims do not, and an operator must be able to tell which contract is
 * unavailable. The activation-tagged batching and the durable deadline ownership are those shared
 * mechanisms and live with their own owners.
 */
import { StimulusKind } from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  FireTimerStimulus,
  RuntimeState,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import { isBoundaryTimerDefinition } from "@bpmn-lean/semantic-core";
import { ApplicationFailure } from "@temporalio/workflow";

import {
  ActivationDrain,
  createActivationTaggedReadiness,
} from "./activation-tagged-readiness.js";
import { bpmnBoundedActivitySchedulerUnavailableFailureType } from "./contracts.js";
import { createDurableTimerOwner } from "./durable-timer-owner.js";
import type { DurableTimer } from "./durable-timer-owner.js";
import { hostInvariantFailure } from "./host-invariant.js";

type BoundedReadiness =
  | Readonly<{
    kind: typeof StimulusKind.CompleteUserTaskInstance;
    stimulus: CompleteUserTaskInstanceStimulus;
  }>
  | Readonly<{
    kind: typeof StimulusKind.FireTimer;
    stimulus: FireTimerStimulus;
  }>;

export type BoundedActivityDeadlineScheduler = Readonly<{
  /**
   * Records a completion for activation-tagged classification.
   *
   * @returns `false` when the state holds no bounded wait, so the caller keeps its ordinary path.
   */
  recordCompletionCallback: (
    state: RuntimeState,
    stimulus: CompleteUserTaskInstanceStimulus,
  ) => boolean;
  waitForReadiness: (state: RuntimeState) => Promise<ReadonlyArray<Stimulus>>;
  reconcileCommittedState: (state: RuntimeState) => void;
}>;

export function createBoundedActivityDeadlineScheduler(
  semanticProcess: SemanticProcessProgram,
  waitForTimer: (durationMs: number) => Promise<void>,
): BoundedActivityDeadlineScheduler {
  const readiness = createActivationTaggedReadiness<BoundedReadiness>(
    ActivationDrain.Required,
    "Bounded deadline scheduler woke without one classified callback",
  );
  const deadline = createDurableTimerOwner({
    waitForTimer,
    refusals: {
      replaced: "Bounded Activity attempted to replace its live durable deadline",
      identityChanged:
        "Committed bounded Activity changed its durable deadline identity",
    },
    onFiring: (stimulus) =>
      readiness.record({ kind: StimulusKind.FireTimer, stimulus }),
    onFailure: readiness.recordFailure,
  });

  return {
    recordCompletionCallback(state, stimulus) {
      if (managedDeadline(semanticProcess, state) === undefined) {
        return false;
      }
      readiness.record({
        kind: StimulusKind.CompleteUserTaskInstance,
        stimulus,
      });
      return true;
    },

    async waitForReadiness(state) {
      deadline.ensureArmed(requireManagedDeadline(semanticProcess, state));
      const batch = await readiness.takeBatch();
      if (
        batch.some(
          ({ kind }) => kind === StimulusKind.CompleteUserTaskInstance,
        ) &&
        batch.some(({ kind }) => kind === StimulusKind.FireTimer)
      ) {
        throw ApplicationFailure.nonRetryable(
          "Bounded Activity completion and its boundary deadline shared one Workflow activation with no defined winner",
          bpmnBoundedActivitySchedulerUnavailableFailureType,
        );
      }
      return batch.map(({ stimulus }) => stimulus);
    },

    reconcileCommittedState(state) {
      deadline.reconcile(
        managedDeadline(semanticProcess, state) === undefined
          ? undefined
          : requireManagedDeadline(semanticProcess, state),
      );
    },
  };
}

/**
 * The bounded pair, or `undefined` when this state holds no boundary deadline.
 *
 * Pre-start host admission already restricts the program to one isolated bounded task with an exact
 * `PT1S` deadline, so this reads the committed state rather than re-deciding admission.
 */
function managedDeadline(
  semanticProcess: SemanticProcessProgram,
  state: RuntimeState,
): DurableTimer | undefined {
  const [timer] = state.timerWaits;
  if (
    state.timerWaits.length !== 1 ||
    timer === undefined ||
    !isBoundaryTimerDefinition(semanticProcess, timer.id)
  ) {
    return undefined;
  }
  return {
    id: timer.id,
    deadlineMs: timer.deadlineMs,
    remainingMs: timer.deadlineMs - state.logicalTimeMs,
  };
}

function requireManagedDeadline(
  semanticProcess: SemanticProcessProgram,
  state: RuntimeState,
): DurableTimer {
  const deadline = managedDeadline(semanticProcess, state);
  const [task] = state.userTaskWaits;
  if (
    deadline === undefined ||
    state.userTaskWaits.length !== 1 ||
    task === undefined ||
    task.id.processInstanceId !== deadline.id.processInstanceId ||
    deadline.remainingMs !== 1_000
  ) {
    throw hostInvariantFailure(
      "Managed bounded Activity is not one task with an exact PT1S boundary deadline",
    );
  }
  return deadline;
}
