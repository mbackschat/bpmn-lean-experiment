/**
 * Regional cancellation classifies one scope occurrence and every occurrence descended from it.
 *
 * One owner because interruption and Terminate End must agree on which runtime collections a live
 * region owns. What each family does with the selected occurrence stays distinct: Error and boundary
 * Timer interruption remove it, while Terminate End retains it quiescent for ordinary completion.
 *
 * Activation counters and `endOccurrences` are monotonic historical facts and are never rewound, so a
 * cancelled region's counts survive it. This function removes live owners only.
 */
import {
  removeCalledProcessSubtreesForCallers,
} from "./semantic-process-call-runtime.js";
import {
  ActivityBodyKind,
  ActivityHandlerKind,
  attachedTimerOccurrences,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import {
  sameOccurrence,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeScopeOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import {
  matchesActivityLocalDataOwner,
  matchesEffectLocalDataOwner,
} from "./local-data-owner.js";

/**
 * Removes every live runtime owner belonging to `attached` or one of its descendant occurrences.
 *
 * Effect-produced Activity variable bindings are keyed by the effect occurrence rather than by a scope
 * occurrence, so they are matched through open or incident-suspended effect waits rather than by owner.
 */
export function removeScopeOccurrenceSubtree(
  state: RuntimeState,
  attached: RuntimeScopeOccurrence,
): RuntimeState {
  return removeScopeOccurrenceRegion(state, attached, false);
}

/** Removes every live owner below one occurrence while retaining that occurrence for completion. */
export function removeScopeOccurrenceContents(
  state: RuntimeState,
  attached: RuntimeScopeOccurrence,
): RuntimeState {
  return removeScopeOccurrenceRegion(state, attached, true);
}

function removeScopeOccurrenceRegion(
  state: RuntimeState,
  attached: RuntimeScopeOccurrence,
  retainRoot: boolean,
): RuntimeState {
  const interrupted = scopeOccurrenceSubtree(state.scopeOccurrences, attached);
  const isInterrupted = (owner: ScopeOccurrenceId): boolean =>
    interrupted.some(({ id }) => sameScopeOccurrence(id, owner));
  const isRemovedSnapshotOwner = (owner: ScopeOccurrenceId): boolean =>
    isInterrupted(owner) &&
    !(retainRoot && sameScopeOccurrence(owner, attached.id));
  const withdrawnRecords = scopeCancellationWithdrawnActivities(state, attached, retainRoot);
  const withdrawnTimers = withdrawnRecords.flatMap(attachedTimerOccurrences);

  const interruptedEffects = state.effectWaits
    .filter(({ owner }) => isInterrupted(owner))
    .map(({ id }) => id)
    .concat(
      state.effectIncidents
        .filter(({ wait }) => isInterrupted(wait.owner))
        .map(({ id }) => id.effectId),
    );
  const interruptedCompensationTriggers = state.compensationTriggers?.filter(
    ({ owner }) => isInterrupted(owner),
  ) ?? [];
  const withoutCalledProcesses = removeCalledProcessSubtreesForCallers(
    state,
    interrupted.map(({ id }) => id),
  );
  return {
    ...withoutCalledProcesses,
    controlTokens: withoutCalledProcesses.controlTokens.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    scopeOccurrences: withoutCalledProcesses.scopeOccurrences.filter(
      ({ id }) =>
        (retainRoot && sameScopeOccurrence(id, attached.id)) ||
        !isInterrupted(id),
    ),
    userTaskWaits: withoutCalledProcesses.userTaskWaits.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    messageWaits: withoutCalledProcesses.messageWaits.filter(
      ({ id, owner }) => !isInterrupted(owner) && !withdrawnRecords.some(
        ({ attachedHandlers }) => attachedHandlers.some((handler) =>
          handler.kind === ActivityHandlerKind.Message &&
          sameOccurrence(handler.occurrence, id)
        ),
      ),
    ),
    timerWaits: withoutCalledProcesses.timerWaits.filter(({ id, owner }) =>
      !isInterrupted(owner) &&
      !withdrawnTimers.some((withdrawn) => sameOccurrence(withdrawn, id))
    ),
    activityOccurrences: withoutCalledProcesses.activityOccurrences.filter((record) =>
      !withdrawnRecords.includes(record)
    ),
    ...(withoutCalledProcesses.sequentialMultiInstanceControllers === undefined
      ? {}
      : {
        sequentialMultiInstanceControllers:
          withoutCalledProcesses.sequentialMultiInstanceControllers.filter(
            (controller) => !withdrawnRecords.some((record) =>
              sameActivityOccurrence(record.id, controller.id)
            ),
          ),
      }),
    ...(withoutCalledProcesses.parallelMultiInstanceControllers === undefined
      ? {}
      : {
        parallelMultiInstanceControllers:
          withoutCalledProcesses.parallelMultiInstanceControllers.filter(
            (controller) => !withdrawnRecords.some((record) =>
              sameActivityOccurrence(record.id, controller.id)
            ),
          ),
      }),
    ...(withoutCalledProcesses.compensationActivityRetentions === undefined
      ? {}
      : {
        compensationActivityRetentions:
          withoutCalledProcesses.compensationActivityRetentions.filter(
            ({ owner }) => !isInterrupted(owner),
          ),
      }),
    ...(withoutCalledProcesses.compensationParentContextRetentions === undefined
      ? {}
      : {
        compensationParentContextRetentions:
          withoutCalledProcesses.compensationParentContextRetentions.filter(({ parent }) =>
            !isRemovedSnapshotOwner(parent.id) &&
            (parent.parent === null || !isRemovedSnapshotOwner(parent.parent))
          ),
      }),
    ...(withoutCalledProcesses.compensationTriggers === undefined
      ? {}
      : {
        compensationTriggers: withoutCalledProcesses.compensationTriggers.filter(
          ({ owner }) => !isInterrupted(owner),
        ),
      }),
    ...(withoutCalledProcesses.compensationHandlerEffectWaits === undefined
      ? {}
      : {
        compensationHandlerEffectWaits:
          withoutCalledProcesses.compensationHandlerEffectWaits.filter(
            ({ triggerId }) => !interruptedCompensationTriggers.some(
              ({ id }) => sameOccurrence(id, triggerId),
            ),
          ),
      }),
    effectWaits: withoutCalledProcesses.effectWaits.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    effectIncidents: withoutCalledProcesses.effectIncidents.filter(
      ({ wait }) => !isInterrupted(wait.owner),
    ),
    selectedBranchSets: withoutCalledProcesses.selectedBranchSets.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    eventRaces: withoutCalledProcesses.eventRaces.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    variables: {
      ...withoutCalledProcesses.variables,
      activities: withoutCalledProcesses.variables.activities.filter(
        ({ owner }) =>
          !interruptedEffects.some((effectId) =>
            matchesEffectLocalDataOwner(owner, effectId)
          ) &&
          !withdrawnRecords.some((record) =>
            matchesActivityLocalDataOwner(owner, record.id)
          ),
      ),
    },
  };
}

/** ESL-RETAIN-01 keeps a parent-owned Activity while its exact child body survives for completion. */
export function scopeCancellationWithdrawnActivities(
  state: RuntimeState,
  root: RuntimeScopeOccurrence,
  retainRoot: boolean,
): ReadonlyArray<ActivityOccurrence> {
  const region = scopeOccurrenceSubtree(state.scopeOccurrences, root);
  const contains = (owner: ScopeOccurrenceId): boolean =>
    region.some(({ id }) => sameScopeOccurrence(id, owner));
  return state.activityOccurrences.filter(({ owner, body }) =>
    contains(owner) ||
    (body.kind === ActivityBodyKind.ChildScope && contains(body.scope) &&
      !(retainRoot && sameScopeOccurrence(body.scope, root.id)))
  );
}

/** Classifies one runtime occurrence and every occurrence descended through parent ownership. */
export function scopeOccurrenceSubtree(
  occurrences: ReadonlyArray<RuntimeScopeOccurrence>,
  root: RuntimeScopeOccurrence,
): ReadonlyArray<RuntimeScopeOccurrence> {
  const interrupted = [root];
  for (let index = 0; index < interrupted.length; index += 1) {
    const parent = interrupted[index];
    if (parent === undefined) {
      continue;
    }
    for (const candidate of occurrences) {
      if (
        candidate.parent !== null &&
        sameScopeOccurrence(candidate.parent, parent.id) &&
        !interrupted.some(({ id }) => sameScopeOccurrence(id, candidate.id))
      ) {
        interrupted.push(candidate);
      }
    }
  }
  return interrupted;
}
