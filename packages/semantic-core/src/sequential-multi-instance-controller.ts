/**
 * The outer controller of one sequential Multi-Instance Activity occurrence.
 *
 * Stores generators, not counters. The capsule's public contract projects a planned count, a
 * generated count, a completed count, a terminated count, a pending count, and the active loop
 * counter; every one of those is a function of the immutable snapshot and the dense output slots, so
 * storing them would install exactly the second-disagreeing-fact defect the owning account rejects
 * for the active count. The projection recovers them at the observation boundary:
 *
 * - planned is `snapshot.length`, which is "the snapshot length evaluated once" made structural,
 *   because the snapshot never changes;
 * - completed is `outputSlots.length`, dense by construction rather than by conjunct;
 * - the active loop counter is `outputSlots.length`, the next slot to fill;
 * - generated is `outputSlots.length + 1` while a body is open, since this profile keeps exactly one
 *   active inner instance; the count the projection *publishes* is instead the sum of the completed
 *   and active counts published beside it, because the active count is read from the Activity
 *   occurrence record rather than from here and Table 10.30's identity has to hold arithmetically;
 * - pending is `snapshot.length - generated`, truncated at zero;
 * - terminated is `0`, and no stable state can show otherwise: interruption removes the controller in
 *   the same transition that terminates the active instance.
 *
 * The active *task* identity is not here either. It lives in the Activity occurrence record's body,
 * which this controller binds to by identity, so turnover changes one fact in one place.
 */
import { sameActivityOccurrence } from "./activity-occurrence.js";
import type { ActivityOccurrenceId } from "./activity-occurrence.js";
import type { DeepReadonly } from "./deep-readonly.js";
import { compareCanonicalStrings } from "./wire.js";

/**
 * One open outer controller.
 *
 * `snapshot` is the input collection copied once in declared array order with duplicates preserved.
 * `outputSlots` holds accepted scalar results for loop counters `0 .. outputSlots.length - 1`, so its
 * length is both the completed count and the active loop counter, and index order is aggregation
 * order rather than completion order.
 */
export type SequentialMultiInstanceController = DeepReadonly<{
  id: ActivityOccurrenceId;
  snapshot: string[];
  outputSlots: string[];
}>;

/** Completed instances, which is also the loop counter of the active iteration. */
export function completedInstanceCount(
  controller: SequentialMultiInstanceController,
): number {
  return controller.outputSlots.length;
}

/** The snapshot item the active iteration carries as its task input. */
export function activeSnapshotItem(
  controller: SequentialMultiInstanceController,
): string | undefined {
  return controller.snapshot[completedInstanceCount(controller)];
}

/** Instances generated so far, which is the completed ones plus the one still open. */
export function generatedInstanceCount(
  controller: SequentialMultiInstanceController,
): number {
  return completedInstanceCount(controller) + 1;
}

/**
 * Snapshot items not yet generated, truncated at zero.
 *
 * The truncation is the deliberate choice rather than a guard against a reachable value: Lean computes
 * the same difference as `Nat` subtraction, so an untruncated result here would be the two targets
 * disagreeing. It is reachable only on a controller whose slots exhaust its snapshot, which the
 * exhaustion conjunct refuses before evaluation.
 */
export function pendingItemCount(
  controller: SequentialMultiInstanceController,
): number {
  return Math.max(
    0,
    controller.snapshot.length - generatedInstanceCount(controller),
  );
}

/** The controller an Activity occurrence identity owns, or `undefined`. */
export function sequentialMultiInstanceControllerFor(
  controllers: ReadonlyArray<SequentialMultiInstanceController>,
  id: ActivityOccurrenceId,
): SequentialMultiInstanceController | undefined {
  const matches = controllers.filter((controller) =>
    sameActivityOccurrence(controller.id, id)
  );
  const [only] = matches;
  return matches.length === 1 ? only : undefined;
}

/**
 * Canonical order, by the owning Activity occurrence identity.
 *
 * One controller per open Multi-Instance Activity occurrence, so the identity is a total key.
 *
 * Ordered by code point, through the same comparator `compareActivityOccurrences` uses over the same
 * three fields. A locale comparison would have been a second canonical order for one identity,
 * disagreeing with the record collection's order on case-varying or non-ASCII element ids and with the
 * Lean account, which orders by code point; every current element id is ASCII lowercase, so no fixture
 * would have separated them.
 */
export function compareSequentialMultiInstanceControllers(
  left: SequentialMultiInstanceController,
  right: SequentialMultiInstanceController,
): number {
  return compareCanonicalStrings(
      left.id.processInstanceId,
      right.id.processInstanceId,
    ) ||
    compareCanonicalStrings(
      left.id.activityElementId,
      right.id.activityElementId,
    ) ||
    left.id.activation - right.id.activation;
}
