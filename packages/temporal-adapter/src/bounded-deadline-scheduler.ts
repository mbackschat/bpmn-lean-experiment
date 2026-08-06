/**
 * Durable readiness scheduling for one boundary deadline and the wait it accompanies.
 *
 * One mechanism serves every boundary-deadline host kind, because what they share is exactly the
 * hazard: a deadline racing a completion Update, where an activation carrying both callbacks would
 * otherwise let raw job order pick a winner the profile leaves undefined. Interruption is not what
 * decides membership — the non-interrupting family faces the same undefined order, between spawning
 * a branch and withdrawing the deadline. What differs per family is which committed state counts as
 * one pair and which identity the refusal carries, and both live in the descriptors below. Those
 * identities stay distinct on purpose: a bounded Activity loses one task completion, a bounded scope
 * loses a whole child region reaching quiescence, and a monitored Activity loses a handler branch
 * that never starts, so a shared identity would report an unavailable scheduler without saying which
 * semantic outcome is unreachable. Activation-tagged batching and durable deadline ownership are the
 * shared mechanisms and keep their own owners.
 */
import { StimulusKind } from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  FireTimerStimulus,
  OccurrenceId,
  RuntimeState,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  isBoundaryTimerDefinition,
  isBoundedScopeDeadlineDefinition,
  isMonitoredBoundaryTimerDefinition,
} from "@bpmn-lean/semantic-core";
import { ApplicationFailure } from "@temporalio/workflow";

import {
  ActivationDrain,
  createActivationTaggedReadiness,
} from "./activation-tagged-readiness.js";
import {
  bpmnBoundedActivitySchedulerUnavailableFailureType,
  bpmnBoundedScopeSchedulerUnavailableFailureType,
  bpmnMonitoredActivitySchedulerUnavailableFailureType,
} from "./contracts.js";
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

/**
 * The per-host-kind facts this scheduler cannot derive from the shared mechanism.
 *
 * `ownsDeadline` decides membership from the committed program, so a state holding another family's
 * deadline is left to that family's scheduler rather than mis-scheduled here.
 */
export type BoundedDeadlineFamily = Readonly<{
  ownsDeadline: (
    semanticProcess: SemanticProcessProgram,
    timerId: OccurrenceId,
  ) => boolean;
  schedulerUnavailableFailureType: string;
  sharedActivationMessage: string;
  invariantMessage: string;
  replacedRefusal: string;
  identityChangedRefusal: string;
}>;

export const boundedActivityDeadlineFamily: BoundedDeadlineFamily = Object
  .freeze({
    ownsDeadline: isBoundaryTimerDefinition,
    schedulerUnavailableFailureType:
      bpmnBoundedActivitySchedulerUnavailableFailureType,
    sharedActivationMessage:
      "Bounded Activity completion and its boundary deadline shared one Workflow activation with no defined winner",
    invariantMessage:
      "Managed bounded Activity is not one task with an exact PT1S boundary deadline",
    replacedRefusal:
      "Bounded Activity attempted to replace its live durable deadline",
    identityChangedRefusal:
      "Committed bounded Activity changed its durable deadline identity",
  });

export const boundedScopeDeadlineFamily: BoundedDeadlineFamily = Object.freeze({
  ownsDeadline: isBoundedScopeDeadlineDefinition,
  schedulerUnavailableFailureType:
    bpmnBoundedScopeSchedulerUnavailableFailureType,
  sharedActivationMessage:
    "Bounded scope child completion and its boundary deadline shared one Workflow activation with no defined winner",
  invariantMessage:
    "Managed bounded scope is not one live child task with an exact PT1S boundary deadline",
  replacedRefusal: "Bounded scope attempted to replace its live durable deadline",
  identityChangedRefusal:
    "Committed bounded scope changed its durable deadline identity",
});

/**
 * The non-interrupting family.
 *
 * The coalescing hazard is not weaker for being non-interrupting, and it is the reason this family
 * uses the same barrier rather than the generic durable-timer path: firing then completing yields
 * both branches, while completing then firing withdraws the deadline and yields only the normal
 * branch. The profile defines no portable winner between them, so an activation carrying both
 * callbacks must fail closed here exactly as it does for the two bounded families.
 */
export const monitoredActivityDeadlineFamily: BoundedDeadlineFamily = Object
  .freeze({
    ownsDeadline: isMonitoredBoundaryTimerDefinition,
    schedulerUnavailableFailureType:
      bpmnMonitoredActivitySchedulerUnavailableFailureType,
    sharedActivationMessage:
      "Monitored Activity completion and its non-interrupting deadline shared one Workflow activation with no defined winner",
    invariantMessage:
      "Managed monitored Activity is not one task with an exact PT1S non-interrupting boundary deadline",
    replacedRefusal:
      "Monitored Activity attempted to replace its live durable deadline",
    identityChangedRefusal:
      "Committed monitored Activity changed its durable deadline identity",
  });

export type BoundedDeadlineScheduler = Readonly<{
  /** True when this family owns the state's committed deadline, so one scheduler can be selected. */
  ownsCommittedDeadline: (state: RuntimeState) => boolean;
  /**
   * Records a completion for activation-tagged classification.
   *
   * @returns `false` when the state holds no bounded wait of this family, so the caller keeps its
   * ordinary path or tries the other family.
   */
  recordCompletionCallback: (
    state: RuntimeState,
    stimulus: CompleteUserTaskInstanceStimulus,
  ) => boolean;
  waitForReadiness: (state: RuntimeState) => Promise<ReadonlyArray<Stimulus>>;
  reconcileCommittedState: (state: RuntimeState) => void;
}>;

export function createBoundedDeadlineScheduler(
  semanticProcess: SemanticProcessProgram,
  waitForTimer: (durationMs: number) => Promise<void>,
  family: BoundedDeadlineFamily,
): BoundedDeadlineScheduler {
  const readiness = createActivationTaggedReadiness<BoundedReadiness>(
    ActivationDrain.Required,
    "Bounded deadline scheduler woke without one classified callback",
  );
  const deadline = createDurableTimerOwner({
    waitForTimer,
    refusals: {
      replaced: family.replacedRefusal,
      identityChanged: family.identityChangedRefusal,
    },
    onFiring: (stimulus) =>
      readiness.record({ kind: StimulusKind.FireTimer, stimulus }),
    onFailure: readiness.recordFailure,
  });

  return {
    ownsCommittedDeadline(state) {
      return managedDeadline(semanticProcess, state, family) !== undefined;
    },

    recordCompletionCallback(state, stimulus) {
      if (managedDeadline(semanticProcess, state, family) === undefined) {
        return false;
      }
      readiness.record({
        kind: StimulusKind.CompleteUserTaskInstance,
        stimulus,
      });
      return true;
    },

    async waitForReadiness(state) {
      deadline.ensureArmed(
        requireManagedDeadline(semanticProcess, state, family),
      );
      const batch = await readiness.takeBatch();
      if (
        batch.some(
          ({ kind }) => kind === StimulusKind.CompleteUserTaskInstance,
        ) &&
        batch.some(({ kind }) => kind === StimulusKind.FireTimer)
      ) {
        throw ApplicationFailure.nonRetryable(
          family.sharedActivationMessage,
          family.schedulerUnavailableFailureType,
        );
      }
      return batch.map(({ stimulus }) => stimulus);
    },

    reconcileCommittedState(state) {
      deadline.reconcile(
        managedDeadline(semanticProcess, state, family) === undefined
          ? undefined
          : requireManagedDeadline(semanticProcess, state, family),
      );
    },
  };
}

/**
 * The bounded pair, or `undefined` when this state holds no boundary deadline of this family.
 *
 * Pre-start host admission already restricts the program to one isolated bounded wait with an exact
 * `PT1S` deadline, so this reads the committed state rather than re-deciding admission.
 */
function managedDeadline(
  semanticProcess: SemanticProcessProgram,
  state: RuntimeState,
  family: BoundedDeadlineFamily,
): DurableTimer | undefined {
  const [timer] = state.timerWaits;
  if (
    state.timerWaits.length !== 1 ||
    timer === undefined ||
    !family.ownsDeadline(semanticProcess, timer.id)
  ) {
    return undefined;
  }
  return {
    id: timer.id,
    deadlineMs: timer.deadlineMs,
    remainingMs: timer.deadlineMs - state.logicalTimeMs,
  };
}

/**
 * Both admitted profiles hold exactly one live bounded wait while the deadline runs — the bounded
 * Activity's own task, or the bounded scope's single child task — so this shape check is shared even
 * though the semantic outcome each family protects is not.
 */
function requireManagedDeadline(
  semanticProcess: SemanticProcessProgram,
  state: RuntimeState,
  family: BoundedDeadlineFamily,
): DurableTimer {
  const deadline = managedDeadline(semanticProcess, state, family);
  const [task] = state.userTaskWaits;
  if (
    deadline === undefined ||
    state.userTaskWaits.length !== 1 ||
    task === undefined ||
    task.id.processInstanceId !== deadline.id.processInstanceId ||
    deadline.remainingMs !== 1_000
  ) {
    throw hostInvariantFailure(family.invariantMessage);
  }
  return deadline;
}
