import { sameScopeOccurrence } from "./semantic-process-state.js";
import type { RuntimeState } from "./semantic-process-state.js";

type ActivationCounter = Readonly<{
  elementId: string;
  count: number;
}>;

function countFor(
  counters: ReadonlyArray<ActivationCounter>,
  elementId: string,
): number {
  return counters.find((counter) => counter.elementId === elementId)?.count ?? 0;
}

/**
 * The implemented, consumer-required part of `RSI-BOUND-01`.
 *
 * A live User Task, Timer, Activity or Scope occurrence cannot be numbered above the recorded count
 * for its own element or definition. An absent counter reads as zero. Called roots stay outside the
 * Scope family, because their issuance is owned by the call record rather than the scope counter.
 * The approved account also identifies Message, Effect, event-race and Call families, but the
 * pre-existing aggregate fixture target already exhausted the required 3 GiB Lean bound before this
 * rule was added. Those consumer-free branches remain explicit open work rather than being claimed
 * here. The Scope branch checks, on executed states, the premise of CEA-OCCUR-01's freshness law, which Lean
 * states as the separate predicate `scopeIdentityBound`.
 */
export function runtimeStateIdentityBound(state: RuntimeState): boolean {
  const calledRoots = state.calledProcessOccurrences.map(({ calledRoot }) => calledRoot);
  return state.userTaskWaits.every(({ id }) =>
    id.activation <= countFor(state.taskActivations, id.elementId)
  ) &&
    state.scopeOccurrences.every(({ id }) =>
      calledRoots.some((root) => sameScopeOccurrence(root, id)) ||
      id.activation <= countFor(state.scopeActivations, id.definitionScopeId)
    ) &&
    state.timerWaits.every(({ id }) =>
      id.activation <= countFor(state.timerActivations, id.elementId)
    ) &&
    state.activityOccurrences.every(({ id }) =>
      id.activation <= countFor(state.activityActivations, id.activityElementId)
    );
}
