/** ESL-TIMER-01 consumes one deadline and optionally replaces its exact Activity attachment. */
import { ActivityHandlerKind, sameActivityOccurrence } from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import type { BoundaryTimerArm } from "./semantic-process-contract.js";
import {
  addToken, compareTimerWaits, nextActivation, sameOccurrence, setActivationCount,
} from "./semantic-process-state.js";
import type { RuntimeState, SemanticTimerWait } from "./semantic-process-state.js";

/** ESL-TIMER-01 treats unrepresentable replacement arithmetic as a whole-command refusal. */
export class RecurringBoundaryTimerCapacityRefusal extends RangeError {}

/** Called only after the family has joined the live host, attachment, and exact due stimulus. */
export function fireNonInterruptingBoundaryTimer(
  state: RuntimeState, record: ActivityOccurrence, timer: SemanticTimerWait, arm: BoundaryTimerArm<1000>,
): RuntimeState {
  const repeating = arm.recurrence === "repeating";
  const next = repeating ? {
    ...timer,
    id: { ...timer.id, activation: nextActivation(state.timerActivations, timer.id.elementId) },
    deadlineMs: timer.deadlineMs + arm.durationMs,
  } : undefined;
  if (next !== undefined &&
      (!Number.isSafeInteger(next.deadlineMs) || !Number.isSafeInteger(next.id.activation))) {
    throw new RecurringBoundaryTimerCapacityRefusal("Recurring Timer replacement exceeds the safe integer boundary");
  }
  return {
    ...state,
    controlTokens: addToken(state.controlTokens, arm.output, record.owner),
    timerWaits: [...state.timerWaits.filter(({ id }) => !sameOccurrence(id, timer.id)),
      ...(next === undefined ? [] : [next])].sort(compareTimerWaits),
    timerActivations: next === undefined ? state.timerActivations : setActivationCount(
      state.timerActivations, next.id.elementId, next.id.activation),
    activityOccurrences: state.activityOccurrences.map((candidate) =>
      !sameActivityOccurrence(candidate.id, record.id) ? candidate : {
        ...candidate,
        attachedHandlers: candidate.attachedHandlers.flatMap((handler) =>
          handler.kind !== ActivityHandlerKind.Timer || !sameOccurrence(handler.occurrence, timer.id)
            ? [handler] : next === undefined ? [] : [{ kind: ActivityHandlerKind.Timer, occurrence: next.id }]),
      }),
    logicalTimeMs: timer.deadlineMs,
  };
}
