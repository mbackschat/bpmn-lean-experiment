/**
 * Removing occurrences and the scope contents they own, transcribed from `Kernel/State/Removal.lean`: disarming an
 * occurrence's attached items, clearing a scope,
 * leaving it, cancelling an occurrence, and withdrawing the open items a cancellation will remove. Part of the State
 * layer, above `state.ts`, whose callers import it directly.
 */
import {
  closeOwnItems, idle, type Issue, keyOf, type OccurrenceId, occurrenceOf, type Occurrence, type State,
} from "../state.js";
import { orderedFilter } from "./map.js";
import { inside, subtree } from "./tree.js";
import { Terminal } from "./journal.js";
import { featureSlotsClear, type ScopeOccurrenceId } from "./slots.js";

/** The closure's order of positions (`ctxPositionLe`), which orders the scope occurrences a removal leaves (DC25). */
type PositionLe = (left: Issue, right: Issue) => boolean;

/** Remove the items attached to the occurrence `host`, with the reservations they hold, listed once (`State.disarm`). */
export function disarm(state: State, host: OccurrenceId): State {
  const attached = new Set(state.openItems.flatMap((item) => item.attachedTo === host ? [item.id.occurrence] : []));
  const dropped = new Set(state.occurrences.flatMap((occurrence) =>
    !occurrence.begun && attached.has(occurrence.id) ? [occurrence.id] : []));
  return {
    ...state,
    openItems: state.openItems.filter((item) => item.attachedTo !== host),
    occurrences: state.occurrences.filter((occurrence) => occurrence.begun || !attached.has(occurrence.id)),
    itemOrdinals: state.itemOrdinals.filter(([id]) => !dropped.has(id)),
  };
}

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
 * Remove every token, item, occurrence, slot entry, variable set and child scope occurrence inside `scope`, with the
 * ordinal counters of the removed scope occurrences and occurrences, keeping `scope` itself and the occurrences `keep`
 * names. Each begun occurrence is journalled cancelled, deepest scope first, each level by the order positions of its
 * scope occurrences under `le` (`subtree`), then in the order the state holds them; `Hooks.cancelled` tells the owning
 * features afterwards.
 */
export function clearInside(state: State, le: PositionLe, scope: ScopeOccurrenceId, keep: readonly OccurrenceId[] = []): State {
  const inside = subtree(state, le, scope);
  const nested = inside.filter((id) => id !== scope);
  const removed = [...inside].reverse().flatMap((current) =>
    state.occurrences.filter((occurrence) => occurrence.scope === current && !keep.includes(occurrence.id)));
  const journalled = recordCancelled(state, removed);
  return {
    ...journalled,
    batchTokens: journalled.batchTokens.filter((token) => !inside.includes(token.scope)),
    queuedTokens: orderedFilter(journalled.queuedTokens, (token) => !inside.includes(token.scope)),
    openItems: journalled.openItems.filter((item) => !inside.includes(item.scope) || keep.includes(item.id.occurrence)),
    itemOrdinals: journalled.itemOrdinals.filter(([id]) => !removed.some((occurrence) => occurrence.id === id)),
    occurrences: journalled.occurrences.filter((occurrence) =>
      !inside.includes(occurrence.scope) || keep.includes(occurrence.id)),
    scopes: journalled.scopes.filter((candidate) => !nested.includes(candidate.id)),
    scopeOrdinals: journalled.scopeOrdinals.filter(([slot]) => !nested.includes(slot.parent)),
    occurrenceOrdinals: journalled.occurrenceOrdinals.filter(([slot]) => !nested.includes(slot.parent)),
    variables: journalled.variables.filter(([scope]) => !nested.includes(scope)),
    slots: featureSlotsClear(journalled.slots, inside, nested),
  };
}

/**
 * Leave `scope`: clear it and remove the occurrence, its variables and the compensation records it retains, so the
 * Activities completed in a Sub-Process left before its own completion are never compensated: compensation is for
 * completed Activities only (BPMN 2.0.2 §13.5.5, "presumed abort"). A called instance's root takes its instance entry
 * with it, which every reader finds only through a standing root (`instanceRoot`), so a completed call retains nothing
 * (DC24, #169).
 */
export function leaveScope(state: State, le: PositionLe, scope: ScopeOccurrenceId): State {
  const cleared = clearInside(state, le, scope);
  return {
    ...cleared,
    scopes: cleared.scopes.filter((candidate) => candidate.id !== scope),
    scopeOrdinals: cleared.scopeOrdinals.filter(([slot]) => slot.parent !== scope),
    occurrenceOrdinals: cleared.occurrenceOrdinals.filter(([slot]) => slot.parent !== scope),
    variables: cleared.variables.filter(([key]) => key !== scope),
    slots: {
      ...cleared.slots,
      compensation: {
        ...cleared.slots.compensation,
        retained: cleared.slots.compensation.retained.filter((record) => record.scope !== scope),
      },
      instances: cleared.slots.instances.filter((instance) => instance.root !== scope),
    },
  };
}

/**
 * Remove the occurrence record `id` and the scope occurrences it owns, if any, in the order of their positions under
 * `le`. The record goes first, so that leaving a scope does not cancel the occurrence that owns it.
 */
export function removeOccurrence(state: State, le: PositionLe, id: OccurrenceId): State {
  const removed: State = {
    ...state,
    occurrences: state.occurrences.filter((occurrence) => occurrence.id !== id),
    itemOrdinals: state.itemOrdinals.filter(([occurrence]) => occurrence !== id),
  };
  return removed.scopes.filter((scope) => scope.occurrence === id)
    .sort((left, right) => le(left.position, right.position) ? (le(right.position, left.position) ? 0 : -1) : 1)
    .reduce((current, scope) => leaveScope(current, le, scope.id), removed);
}

/**
 * Cancel the occurrence `id` wherever it stands: its items and subscriptions go, the scope occurrence it owns is left,
 * and it is journalled cancelled.
 */
export function cancelOccurrence(state: State, le: PositionLe, id: OccurrenceId): State {
  const occurrence = occurrenceOf(state, id);
  if (occurrence === null) return state;
  return recordCancelled(removeOccurrence(withdrawOccurrence(state, id), le, id), [occurrence]);
}

/** Close the open items inside `scope`, its own included; the occurrences they reserved go when the scope is cleared. */
export function withdrawInside(state: State, scope: ScopeOccurrenceId): State {
  const within = inside(state, scope);
  return { ...state, openItems: state.openItems.filter((item) => !within.includes(item.scope)) };
}

/**
 * Close the open items `cancelOccurrence` removes with the occurrence `id`: its own, those attached to it with their
 * reservations, and those inside the scope occurrences it owns. A firing that interrupts withdraws them at once, while
 * the cancellation itself is still queued, so that no firing queued before it finds them open.
 */
export function withdrawOccurrence(state: State, id: OccurrenceId): State {
  const closed = disarm(closeOwnItems(state, id), id);
  return closed.scopes.filter((scope) => scope.occurrence === id).reduce((current, scope) => withdrawInside(current, scope.id), closed);
}

/**
 * Whether `scope` would be idle once the occurrence `id`, its items, what is attached to it and the scope occurrence it
 * owns were gone: nothing else remains there.
 */
export function idleWithout(state: State, le: PositionLe, scope: ScopeOccurrenceId, id: OccurrenceId): boolean {
  return idle(removeOccurrence(disarm(closeOwnItems(state, id), id), le, id), scope);
}
