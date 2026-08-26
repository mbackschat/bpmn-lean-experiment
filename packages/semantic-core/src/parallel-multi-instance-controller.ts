import type { UserTaskInstanceId } from "./contract.js";
import type { ActivityOccurrenceId } from "./activity-occurrence.js";
import { sameActivityOccurrence } from "./activity-occurrence.js";
import type { DeepReadonly } from "./deep-readonly.js";
import { compareCanonicalStrings } from "./wire.js";

export enum ParallelMultiInstanceSlotKind {
  Pending = "pending",
  Completed = "completed",
}

export type ParallelMultiInstanceSlot =
  | DeepReadonly<{
      kind: ParallelMultiInstanceSlotKind.Pending;
      taskId: UserTaskInstanceId;
    }>
  | DeepReadonly<{
      kind: ParallelMultiInstanceSlotKind.Completed;
      taskId: UserTaskInstanceId;
      result: string;
    }>;

/** One outer parallel Activity, with immutable input order and fixed index-owned slots. */
export type ParallelMultiInstanceController = DeepReadonly<{
  id: ActivityOccurrenceId;
  snapshot: string[];
  slots: ParallelMultiInstanceSlot[];
}>;

export function plannedParallelInstanceCount(
  controller: ParallelMultiInstanceController,
): number {
  return controller.slots.length;
}

export function activeParallelInstanceCount(
  controller: ParallelMultiInstanceController,
): number {
  return controller.slots.filter(({ kind }) =>
    kind === ParallelMultiInstanceSlotKind.Pending
  ).length;
}

export function completedParallelInstanceCount(
  controller: ParallelMultiInstanceController,
): number {
  return controller.slots.filter(({ kind }) =>
    kind === ParallelMultiInstanceSlotKind.Completed
  ).length;
}

export function parallelMultiInstanceControllerFor(
  controllers: ReadonlyArray<ParallelMultiInstanceController>,
  id: ActivityOccurrenceId,
): ParallelMultiInstanceController | undefined {
  const matches = controllers.filter((controller) =>
    sameActivityOccurrence(controller.id, id)
  );
  const [only] = matches;
  return matches.length === 1 ? only : undefined;
}

export function compareParallelMultiInstanceControllers(
  left: ParallelMultiInstanceController,
  right: ParallelMultiInstanceController,
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
