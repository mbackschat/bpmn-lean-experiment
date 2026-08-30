/**
 * Durable readiness scheduling for one boundary deadline and the wait it accompanies.
 *
 * One mechanism serves every boundary-deadline host kind, because what they share is exactly the
 * hazard: a deadline racing a completion Update, where an activation carrying both callbacks would
 * otherwise let raw job order pick a winner the profile leaves undefined. Interruption is not what
 * decides membership — the non-interrupting family faces the same undefined order, between spawning
 * a branch and withdrawing the deadline. What differs per family is which committed state counts as
 * one pair and which identity the refusal carries, and both live in the descriptors below. Those
 * identities stay distinct on purpose: each descriptor reports which semantic outcome its unavailable
 * scheduler would make unreachable. Activation-tagged batching and durable deadline ownership are the
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
  activityBodyScope,
  activityBodyParallelTasks,
  activityBodyTaskWait,
  attachedTimerOccurrences,
  attachedTimerWaits,
  isBoundaryTimerDefinition,
  isBoundedScopeDeadlineDefinition,
  isMonitoredBoundaryTimerDefinition,
  isParallelMultiInstanceBoundaryDefinition,
  isSequentialMultiInstanceBoundaryDefinition,
  parallelMultiInstanceBindingForController,
  parallelMultiInstanceControllerFor,
  sameOccurrenceId,
  sequentialMultiInstanceBindingForController,
  sequentialMultiInstanceControllerFor,
} from "@bpmn-lean/semantic-core";
import type { ActivityOccurrence } from "@bpmn-lean/semantic-core";
import { ApplicationFailure } from "@temporalio/workflow";

import {
  ActivationDrain,
  createActivationTaggedReadiness,
} from "./activation-tagged-readiness.js";
import {
  bpmnBoundedActivitySchedulerUnavailableFailureType,
  bpmnBoundedScopeSchedulerUnavailableFailureType,
  bpmnMonitoredActivitySchedulerUnavailableFailureType,
  bpmnParallelMultiInstanceSchedulerUnavailableFailureType,
  bpmnSequentialMultiInstanceSchedulerUnavailableFailureType,
} from "@bpmn-lean/temporal-protocol";
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
  /**
   * The one remaining duration this family's committed deadline may carry.
   *
   * Each family admits one exact source lexeme, so its host deadline is one exact number. It belongs
   * beside the invariant message that names it: a value shared across families reads as a host-wide
   * constant, and raising one family's lexeme then leaves the checker refusing the model the profile
   * admits, with a message still naming the old duration.
   */
  admittedRemainingMs: number;
  schedulerUnavailableFailureType: string;
  sharedActivationMessage: string;
  invariantMessage: string;
  replacedRefusal: string;
  identityChangedRefusal: string;
  /** Extra committed join that only this family owns, beyond the shared Activity/body/Timer record. */
  pairIsValid?: (
    semanticProcess: SemanticProcessProgram,
    state: RuntimeState,
    record: ActivityOccurrence,
  ) => boolean;
}>;

export const boundedActivityDeadlineFamily: BoundedDeadlineFamily = Object
  .freeze({
    ownsDeadline: isBoundaryTimerDefinition,
    admittedRemainingMs: 1_000,
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
  admittedRemainingMs: 1_000,
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
    admittedRemainingMs: 1_000,
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

/** One outer lifetime deadline that remains armed while the inner task body turns over. */
export const sequentialMultiInstanceDeadlineFamily: BoundedDeadlineFamily =
  Object.freeze({
    ownsDeadline: isSequentialMultiInstanceBoundaryDefinition,
    admittedRemainingMs: 5_000,
    schedulerUnavailableFailureType:
      bpmnSequentialMultiInstanceSchedulerUnavailableFailureType,
    sharedActivationMessage:
      "Sequential Multi-Instance completion and its outer lifetime deadline shared one Workflow activation with no defined winner",
    invariantMessage:
      "Managed sequential Multi-Instance Activity is not one controller, one active task, and one exact PT5S outer-lifetime boundary deadline",
    replacedRefusal:
      "Sequential Multi-Instance Activity attempted to replace its live outer deadline",
    identityChangedRefusal:
      "Committed sequential Multi-Instance Activity changed its outer deadline identity",
    pairIsValid: (semanticProcess, state, record) => {
      const controller = sequentialMultiInstanceControllerFor(
        state.sequentialMultiInstanceControllers ?? [],
        record.id,
      );
      return controller !== undefined &&
        sequentialMultiInstanceBindingForController(
          semanticProcess,
          state,
          controller,
        )?.record === record;
    },
  });

/** One outer lifetime deadline joined to the complete active parallel child set. */
export const parallelMultiInstanceDeadlineFamily: BoundedDeadlineFamily =
  Object.freeze({
    ownsDeadline: isParallelMultiInstanceBoundaryDefinition,
    admittedRemainingMs: 5_000,
    schedulerUnavailableFailureType:
      bpmnParallelMultiInstanceSchedulerUnavailableFailureType,
    sharedActivationMessage:
      "Parallel Multi-Instance completion and its outer lifetime deadline shared one Workflow activation with no defined winner",
    invariantMessage:
      "Managed parallel Multi-Instance Activity is not one controller, its complete active task set, and one exact PT5S outer-lifetime boundary deadline",
    replacedRefusal:
      "Parallel Multi-Instance Activity attempted to replace its live outer deadline",
    identityChangedRefusal:
      "Committed parallel Multi-Instance Activity changed its outer deadline identity",
    pairIsValid: (semanticProcess, state, record) => {
      const controller = parallelMultiInstanceControllerFor(
        state.parallelMultiInstanceControllers ?? [],
        record.id,
      );
      return controller !== undefined &&
        parallelMultiInstanceBindingForController(
          semanticProcess,
          state,
          controller,
        )?.record === record;
    },
  });

export type BoundedDeadlineScheduler = Readonly<{
  /** True only after this Run has emitted the family's native Timer command. */
  hasArmedDeadline: () => boolean;
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

/** One scheduler instance for every managed boundary-deadline family. */
export function createBoundedDeadlineSchedulers(
  semanticProcess: SemanticProcessProgram,
  waitForTimer: (durationMs: number) => Promise<void>,
): ReadonlyArray<BoundedDeadlineScheduler> {
  return [
    boundedActivityDeadlineFamily,
    boundedScopeDeadlineFamily,
    monitoredActivityDeadlineFamily,
    sequentialMultiInstanceDeadlineFamily,
    parallelMultiInstanceDeadlineFamily,
  ].map((family) =>
    createBoundedDeadlineScheduler(semanticProcess, waitForTimer, family)
  );
}

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
    hasArmedDeadline: deadline.hasArmedTimer,

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
 * Read from the Activity occurrence record. The previous form paired by whole-state wait cardinality,
 * requiring `timerWaits.length === 1` here and `userTaskWaits.length === 1` below, which is an
 * assumption about the entire runtime state rather than a statement about one Activity. It held only
 * because every profile admitting a boundary deadline admits nothing concurrent with it, and it was
 * weaker than the core's own join, which at least compared ordinals.
 */
function managedPair(
  semanticProcess: SemanticProcessProgram,
  state: RuntimeState,
  family: BoundedDeadlineFamily,
): Readonly<{ deadline: DurableTimer; record: ActivityOccurrence }> | undefined {
  const owned = state.activityOccurrences.flatMap((record) =>
    attachedTimerOccurrences(record).flatMap((attached) =>
      family.ownsDeadline(semanticProcess, attached) ? [{ record, attached }] : []
    )
  );
  const [only] = owned;
  if (owned.length !== 1 || only === undefined) {
    return undefined;
  }
  const [timer] = attachedTimerWaits(only.record, state.timerWaits);
  return timer === undefined ? undefined : {
    deadline: {
      id: timer.id,
      deadlineMs: timer.deadlineMs,
      remainingMs: timer.deadlineMs - state.logicalTimeMs,
    },
    record: only.record,
  };
}

function managedDeadline(
  semanticProcess: SemanticProcessProgram,
  state: RuntimeState,
  family: BoundedDeadlineFamily,
): DurableTimer | undefined {
  return managedPair(semanticProcess, state, family)?.deadline;
}

/**
 * The deadline plus the invariant that its Activity's body is live.
 *
 * The body differs by family and that is the point: the bounded Activity's body is its own task, while
 * the bounded scope's body is its child scope occurrence. The previous form checked
 * `userTaskWaits.length === 1`, which held for both only because the bounded scope profile admits
 * exactly one child task — a coincidence of the whole state, not a fact about either Activity.
 */
function requireManagedDeadline(
  semanticProcess: SemanticProcessProgram,
  state: RuntimeState,
  family: BoundedDeadlineFamily,
): DurableTimer {
  const pair = managedPair(semanticProcess, state, family);
  const bodyLive = pair === undefined ? false : bodyIsLive(pair.record, state);
  const familyPairValid = pair === undefined
    ? false
    : family.pairIsValid?.(semanticProcess, state, pair.record) ?? true;
  if (
    pair === undefined ||
    !bodyLive ||
    !familyPairValid ||
    pair.deadline.remainingMs !== family.admittedRemainingMs
  ) {
    throw hostInvariantFailure(family.invariantMessage);
  }
  return pair.deadline;
}

/** Whether the record's own body is live, resolved by the arm the record carries. */
function bodyIsLive(record: ActivityOccurrence, state: RuntimeState): boolean {
  const task = activityBodyTaskWait(record, state.userTaskWaits);
  if (task !== undefined) {
    return task.id.processInstanceId === record.id.processInstanceId;
  }
  const parallelTasks = activityBodyParallelTasks(record);
  if (parallelTasks !== undefined) {
    return parallelTasks.length > 0 && parallelTasks.every((taskId) =>
      state.userTaskWaits.filter(({ id }) => sameOccurrenceId(id, taskId)).length === 1
    );
  }
  const scope = activityBodyScope(record);
  return scope !== undefined &&
    state.scopeOccurrences.some(({ id }) =>
      id.processInstanceId === scope.processInstanceId &&
      id.definitionScopeId === scope.definitionScopeId &&
      id.activation === scope.activation
    );
}
