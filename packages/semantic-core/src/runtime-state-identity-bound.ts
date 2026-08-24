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
 * A live User Task, Timer, or Activity occurrence cannot be numbered above the recorded count for
 * its own element. An absent counter reads as zero. The approved account also identifies Message,
 * Effect, event-race, Call, and ordinary Scope families, but the pre-existing aggregate fixture
 * target already exhausted the required 3 GiB Lean bound before this rule was added. Those
 * consumer-free branches remain explicit open work rather than being claimed here.
 */
export function runtimeStateIdentityBound(state: RuntimeState): boolean {
  return state.userTaskWaits.every(({ id }) =>
    id.activation <= countFor(state.taskActivations, id.elementId)
  ) &&
    state.timerWaits.every(({ id }) =>
      id.activation <= countFor(state.timerActivations, id.elementId)
    ) &&
    state.activityOccurrences.every(({ id }) =>
      id.activation <= countFor(state.activityActivations, id.activityElementId)
    );
}
