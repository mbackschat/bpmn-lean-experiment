/**
 * Removing occurrences and the scope contents they own, transcribed from `Kernel/State/Removal.lean`: clearing a scope,
 * leaving it, cancelling an occurrence, and withdrawing the open items a cancellation will remove. Part of the State
 * layer, above `state.ts`, whose callers import it directly.
 */
import {
  closeOwnItems, disarm, idle, keyOf, occurrenceOf, subtree, type Occurrence, type State,
} from "../state.js";
import { Terminal } from "./journal.js";
import { featureSlotsClear, type ScopeOccurrenceId } from "./slots.js";

/** The journal facts of removing the begun `occurrences`, cancelled. */
function recordCancelled(state: State, occurrences: readonly Occurrence[]): State {
  const begun = occurrences.filter((occurrence) => occurrence.begun);
  const ended = begun.map((occurrence) => [keyOf(state, occurrence), Terminal.Cancelled] as const);
  return {
    ...state,
    draft: { ...state.draft, ended: [...state.draft.ended, ...ended], cancelled: [...state.draft.cancelled, ...begun] },
  };
}

/**
 * Remove every token, item, occurrence, slot entry, variable set and child scope occurrence inside `scope`, keeping
 * `scope` itself and the occurrences `keep` names. Each begun occurrence is journalled cancelled, deepest scope first,
 * then by id; `Hooks.cancelled` tells the owning features afterwards.
 */
export function clearInside(state: State, scope: ScopeOccurrenceId, keep: readonly number[] = []): State {
  const inside = subtree(state, scope);
  const nested = inside.filter((id) => id !== scope);
  const removed = [...inside].reverse().flatMap((current) =>
    state.occurrences.filter((occurrence) => occurrence.scope === current && !keep.includes(occurrence.id)));
  const journalled = recordCancelled(state, removed);
  return {
    ...journalled,
    tokens: journalled.tokens.filter((token) => !inside.includes(token.scope)),
    openItems: journalled.openItems.filter((item) => !inside.includes(item.scope) || keep.includes(item.occurrence)),
    occurrences: journalled.occurrences.filter((occurrence) =>
      !inside.includes(occurrence.scope) || keep.includes(occurrence.id)),
    scopes: journalled.scopes.filter((candidate) => !nested.includes(candidate.id)),
    variables: journalled.variables.filter((entry) => !nested.includes(entry.scope)),
    slots: featureSlotsClear(journalled.slots, inside, nested),
  };
}

/**
 * Leave `scope`: clear it and remove the occurrence, its variables and the compensation records it retains, so the
 * Activities completed in a Sub-Process left before its own completion are never compensated: compensation is for
 * completed Activities only (BPMN 2.0.2 §13.5.5, "presumed abort").
 */
export function leaveScope(state: State, scope: ScopeOccurrenceId): State {
  const cleared = clearInside(state, scope);
  return {
    ...cleared,
    scopes: cleared.scopes.filter((candidate) => candidate.id !== scope),
    variables: cleared.variables.filter((entry) => entry.scope !== scope),
    slots: {
      ...cleared.slots,
      compensation: {
        ...cleared.slots.compensation,
        retained: cleared.slots.compensation.retained.filter((record) => record.scope !== scope),
      },
    },
  };
}

/**
 * Remove the occurrence record `id` and the scope occurrences it owns, if any. The record goes first, so that leaving
 * a scope does not cancel the occurrence that owns it.
 */
export function removeOccurrence(state: State, id: number): State {
  const removed: State = { ...state, occurrences: state.occurrences.filter((occurrence) => occurrence.id !== id) };
  return removed.scopes.filter((scope) => scope.occurrence === id)
    .reduce((current, scope) => leaveScope(current, scope.id), removed);
}

/**
 * Cancel the occurrence `id` wherever it stands: its items and subscriptions go, the scope occurrence it owns is left,
 * and it is journalled cancelled.
 */
export function cancelOccurrence(state: State, id: number): State {
  const occurrence = occurrenceOf(state, id);
  if (occurrence === null) return state;
  return recordCancelled(removeOccurrence(withdrawOccurrence(state, id), id), [occurrence]);
}

/** Close the open items inside `scope`, its own included; the occurrences they reserved go when the scope is cleared. */
export function withdrawInside(state: State, scope: ScopeOccurrenceId): State {
  const inside = subtree(state, scope);
  return { ...state, openItems: state.openItems.filter((item) => !inside.includes(item.scope)) };
}

/**
 * Close the open items `cancelOccurrence` removes with the occurrence `id`: its own, those attached to it with their
 * reservations, and those inside the scope occurrences it owns. A firing that interrupts withdraws them at once, while
 * the cancellation itself is still queued, so that no firing queued before it finds them open.
 */
export function withdrawOccurrence(state: State, id: number): State {
  const closed = disarm(closeOwnItems(state, id), id);
  return closed.scopes.filter((scope) => scope.occurrence === id).reduce((current, scope) => withdrawInside(current, scope.id), closed);
}

/**
 * Whether `scope` would be idle once the occurrence `id`, its items, what is attached to it and the scope occurrence it
 * owns were gone: nothing else remains there.
 */
export function idleWithout(state: State, scope: ScopeOccurrenceId, id: number): boolean {
  return idle(removeOccurrence(disarm(closeOwnItems(state, id), id), id), scope);
}
