import {
  ActivityBodyKind, ActivityHandlerKind, sameActivityOccurrence,
} from "./activity-occurrence.js";
import type { ActivityHandlerOccurrence, ActivityOccurrence } from "./activity-occurrence.js";
import type { InternalRegionalSelection } from "./internal-transition-regional-preparation.js";
import {
  LocalDataOwnerKind, localDataOwnerProcessInstanceId,
  matchesActivityLocalDataOwner, matchesEffectLocalDataOwner,
} from "./local-data-owner.js";
import { ScopeCompletionWithdrawalKind } from "./semantic-process-bounded-scope-runtime.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import {
  scopeCancellationWithdrawnActivities,
  scopeOccurrenceSubtree,
} from "./semantic-process-scope-cancellation.js";
import { ScopeCompletionSelectionKind } from "./semantic-process-scope-runtime.js";
import { sameOccurrence, sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";

export type RegionalReferenceRetention = Readonly<{
  scope: (value: RuntimeState["scopeOccurrences"][number]) => boolean;
  activity: (value: ActivityOccurrence) => boolean;
  task: (value: RuntimeState["userTaskWaits"][number]) => boolean;
  message: (value: RuntimeState["messageWaits"][number]) => boolean;
  timer: (value: RuntimeState["timerWaits"][number]) => boolean;
  race: (value: RuntimeState["eventRaces"][number]) => boolean;
  localData: (value: RuntimeState["variables"]["activities"][number]) => boolean;
}>;

/** REG-OWN-CLOSE-01 checks selected deletion against retained references before any state mutation. */
export function regionalOwnershipIsClosed(state: RuntimeState, selection: InternalRegionalSelection): boolean {
  const keep = deriveRegionalReferenceRetention(state, selection);
  const handlerSurvives = (handler: ActivityHandlerOccurrence): boolean => {
    switch (handler.kind) {
      case ActivityHandlerKind.Message:
        return state.messageWaits.every((wait) =>
          !sameOccurrence(wait.id, handler.occurrence) || keep.message(wait));
      case ActivityHandlerKind.Timer:
        return state.timerWaits.every((wait) =>
          !sameOccurrence(wait.id, handler.occurrence) || keep.timer(wait));
    }
  };
  const bodySurvives = ({ body }: ActivityOccurrence): boolean => {
    switch (body.kind) {
      case ActivityBodyKind.ChildScope:
        return state.scopeOccurrences.every((scope) =>
          !sameScopeOccurrence(scope.id, body.scope) || keep.scope(scope));
      case ActivityBodyKind.UserTask:
        return state.userTaskWaits.every((wait) =>
          !sameOccurrence(wait.id, body.task) || keep.task(wait));
      case ActivityBodyKind.ParallelUserTasks:
        return body.tasks.every((task) => state.userTaskWaits.every((wait) =>
          !sameOccurrence(wait.id, task) || keep.task(wait)));
    }
  };
  // RSI-OWN-01 covers the record's owner independently of its body and attached handlers.
  const ownerSurvives = ({ owner }: ActivityOccurrence): boolean =>
    state.scopeOccurrences.every((scope) => !sameScopeOccurrence(scope.id, owner) || keep.scope(scope));
  // ADINPUT-SCOPE-01 / ADIO-SCOPE-01 require the retained local scope's exact live Activity owner.
  const localOwnersSurvive = state.variables.activities.every((local) => {
    if (!keep.localData(local) || local.owner.kind === LocalDataOwnerKind.EffectOccurrence) return true;
    const owners = state.activityOccurrences.filter(({ id }) => matchesActivityLocalDataOwner(local.owner, id));
    return owners.length === 1 && owners.every(keep.activity);
  });
  return localOwnersSurvive && state.activityOccurrences.every((record) => !keep.activity(record) ||
    (ownerSurvives(record) && bodySurvives(record) && record.attachedHandlers.every(handlerSurvives))) &&
    state.eventRaces.every((race) => !keep.race(race) ||
      (state.messageWaits.every((wait) =>
        !sameOccurrence(wait.id, race.messageSubscriptionId) || keep.message(wait)) &&
      state.timerWaits.every((wait) =>
        !sameOccurrence(wait.id, race.timerOccurrenceId) || keep.timer(wait))));
}

export function deriveRegionalReferenceRetention(
  state: RuntimeState, selection: InternalRegionalSelection,
): RegionalReferenceRetention {
  switch (selection.kind) {
    case SemanticOperationKind.ReturnProcess: {
      const removed = calledInstances(state, [selection.selected.record.calledRoot.processInstanceId]);
      const keepOwner = ({ owner }: { owner: ScopeOccurrenceId }) => !removed.has(owner.processInstanceId);
      return { scope: ({ id }) => !removed.has(id.processInstanceId), activity: keepOwner,
        task: keepOwner, message: keepOwner, timer: keepOwner, race: keepOwner,
        localData: ({ owner }) => !removed.has(localDataOwnerProcessInstanceId(owner)) };
    }
    case SemanticOperationKind.CompleteScope: {
      const { selected, withdrawal } = selection;
      return {
        scope: (scope) => selected.kind !== ScopeCompletionSelectionKind.Root && scope !== selected.occurrence,
        activity: (record) => withdrawal.kind !== ScopeCompletionWithdrawalKind.Bounded ||
          !sameActivityOccurrence(record.id, withdrawal.record.id),
        timer: (wait) => withdrawal.kind !== ScopeCompletionWithdrawalKind.Bounded ||
          !withdrawal.record.attachedHandlers.some((handler) =>
            handler.kind === ActivityHandlerKind.Timer && sameOccurrence(handler.occurrence, wait.id)),
        task: () => true, message: () => true, race: () => true, localData: () => true,
      };
    }
    case SemanticOperationKind.ThrowError:
    case SemanticOperationKind.TerminateScope: {
      const root = selection.kind === SemanticOperationKind.ThrowError
        ? selection.selected.attached : selection.selected.occurrence;
      const subtree = scopeOccurrenceSubtree(state.scopeOccurrences, root);
      const interrupted = (owner: ScopeOccurrenceId) =>
        subtree.some(({ id }) => sameScopeOccurrence(id, owner));
      const removed = calledInstances(state, state.calledProcessOccurrences
        .filter(({ caller }) => interrupted(caller)).map(({ calledRoot }) => calledRoot.processInstanceId));
      // The raw TypeScript cancellation selects body/handler withdrawal from the parent subtree;
      // called-instance cleanup independently filters owner instances (REG-OWN-CLOSE-01 mask agreement).
      const withdrawn = scopeCancellationWithdrawnActivities(
        state, root, selection.kind === SemanticOperationKind.TerminateScope,
      );
      const interruptedEffects = state.effectWaits.filter(({ owner }) => interrupted(owner)).map(({ id }) => id)
        .concat(state.effectIncidents.filter(({ wait }) => interrupted(wait.owner)).map(({ id }) => id.effectId));
      const keepOwner = ({ owner }: { owner: ScopeOccurrenceId }) =>
        !removed.has(owner.processInstanceId) && !interrupted(owner);
      const attached = (kind: ActivityHandlerKind, id: RuntimeState["timerWaits"][number]["id"]) =>
        withdrawn.some((record) => record.attachedHandlers.some((handler) =>
          handler.kind === kind && sameOccurrence(handler.occurrence, id)));
      return {
        scope: ({ id }) => !removed.has(id.processInstanceId) &&
          ((selection.kind === SemanticOperationKind.TerminateScope && sameScopeOccurrence(id, root.id)) ||
            !interrupted(id)),
        activity: (record) => !removed.has(record.owner.processInstanceId) && !withdrawn.includes(record),
        task: keepOwner, message: (wait) => keepOwner(wait) && !attached(ActivityHandlerKind.Message, wait.id),
        timer: (wait) => keepOwner(wait) && !attached(ActivityHandlerKind.Timer, wait.id), race: keepOwner,
        localData: ({ owner }) => !removed.has(localDataOwnerProcessInstanceId(owner)) &&
          !interruptedEffects.some((id) => matchesEffectLocalDataOwner(owner, id)) &&
          !withdrawn.some(({ id }) => matchesActivityLocalDataOwner(owner, id)),
      };
    }
  }
}

function calledInstances(state: RuntimeState, seeds: ReadonlyArray<string>): ReadonlySet<string> {
  const removed = new Set(seeds);
  let previousSize = -1;
  while (previousSize !== removed.size) {
    previousSize = removed.size;
    for (const { caller, calledRoot } of state.calledProcessOccurrences) {
      if (removed.has(caller.processInstanceId)) removed.add(calledRoot.processInstanceId);
    }
  }
  return removed;
}
