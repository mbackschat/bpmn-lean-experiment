/**
 * Regional cancellation of one scope occurrence and every occurrence descended from it.
 *
 * One owner because two semantic families cancel a live child region on exactly the same terms —
 * an interrupting Error caught at the scope boundary and an interrupting boundary Timer deadline —
 * and a per-family copy would let them drift on which runtime collections a region owns. What each
 * family does afterwards stays with that family and is deliberately different: the Error produces its
 * handler token, while the deadline additionally consumes its own parent-owned Timer wait.
 *
 * Activation counters and `endOccurrences` are monotonic historical facts and are never rewound, so a
 * cancelled region's counts survive it. This function removes live owners only.
 */
import {
  removeCalledProcessSubtreesForCallers,
} from "./semantic-process-call-runtime.js";
import {
  sameOccurrence,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeScopeOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";

/**
 * Removes every live runtime owner belonging to `attached` or one of its descendant occurrences.
 *
 * Effect-produced Activity variable bindings are keyed by the effect occurrence rather than by a scope
 * occurrence, so they are matched through the interrupted effect waits rather than by owner.
 */
export function removeScopeOccurrenceSubtree(
  state: RuntimeState,
  attached: RuntimeScopeOccurrence,
): RuntimeState {
  const interrupted = interruptedOccurrences(state.scopeOccurrences, attached);
  const isInterrupted = (owner: ScopeOccurrenceId): boolean =>
    interrupted.some(({ id }) => sameScopeOccurrence(id, owner));
  const interruptedEffects = state.effectWaits
    .filter(({ owner }) => isInterrupted(owner))
    .map(({ id }) => id);
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
      ({ id }) => !isInterrupted(id),
    ),
    userTaskWaits: withoutCalledProcesses.userTaskWaits.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    messageWaits: withoutCalledProcesses.messageWaits.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    timerWaits: withoutCalledProcesses.timerWaits.filter(
      ({ owner }) => !isInterrupted(owner),
    ),
    effectWaits: withoutCalledProcesses.effectWaits.filter(
      ({ owner }) => !isInterrupted(owner),
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
          !interruptedEffects.some((effectId) => sameOccurrence(owner, effectId)),
      ),
    },
  };
}

function interruptedOccurrences(
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
