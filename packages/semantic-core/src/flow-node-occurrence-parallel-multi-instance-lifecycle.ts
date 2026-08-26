import {
  ActivityBodyKind,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import type {
  CompleteUserTaskInstanceStimulus,
  OccurrenceId,
} from "./contract.js";
import type { BoundaryTimerBinding } from "./flow-node-occurrence-open-set.js";
import type {
  AwaitParallelMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  sameOccurrence,
  sameScopeOccurrence,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import {
  ParallelMultiInstanceSlotKind,
} from "./parallel-multi-instance-controller.js";
import {
  parallelMultiInstanceBindingsForState,
} from "./parallel-multi-instance-binding.js";
import type {
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  UnnumberedFlowNodeOccurrenceEnd,
  UnnumberedFlowNodeOccurrenceStart,
} from "./flow-node-occurrence-lifecycle.js";

const WaitAnchorKind = "wait" as SemanticFlowNodeOccurrenceAnchorKind.Wait;
const CompletedTerminal = "completed" as FlowNodeOccurrenceTerminalKind.Completed;
const CancelledTerminal = "cancelled" as FlowNodeOccurrenceTerminalKind.Cancelled;

export type ParallelMultiInstanceOccurrenceChange = Readonly<{
  started: UnnumberedFlowNodeOccurrenceStart[];
  ended: UnnumberedFlowNodeOccurrenceEnd[];
}>;

/** Exact E2 starts created by one atomic parallel entry transition. */
export function parallelMultiInstanceEntryStarts(
  after: RuntimeState,
  operation: AwaitParallelMultiInstanceUserTaskOperation,
  owner: ScopeOccurrenceId,
  processId: string,
): UnnumberedFlowNodeOccurrenceStart[] | null {
  const records = after.activityOccurrences.filter((record) =>
    record.operationId === operation.id &&
    sameScopeOccurrence(record.owner, owner) &&
    record.body.kind === ActivityBodyKind.ParallelUserTasks
  );
  const [record] = records;
  if (records.length === 0) {
    return after.parallelMultiInstanceControllers?.length === 0 ? [] : null;
  }
  if (records.length !== 1 || record?.body.kind !== ActivityBodyKind.ParallelUserTasks) {
    return null;
  }
  const body = record.body;
  const controllers = (after.parallelMultiInstanceControllers ?? []).filter((candidate) =>
    sameActivityOccurrence(candidate.id, record.id)
  );
  const [controller] = controllers;
  if (
    controllers.length !== 1 ||
    controller === undefined ||
    controller.slots.length !== body.tasks.length ||
    controller.slots.some((slot, index) =>
      slot.kind !== ParallelMultiInstanceSlotKind.Pending ||
      !sameOccurrence(slot.taskId, body.tasks[index] as typeof slot.taskId)
    )
  ) {
    return null;
  }
  const starts = body.tasks.map((taskId) => {
    const waits = after.userTaskWaits.filter(({ id, owner: waitOwner }) =>
      sameOccurrence(id, taskId) && sameScopeOccurrence(waitOwner, owner)
    );
    const [wait] = waits;
    return waits.length !== 1 || wait === undefined ||
        wait.id.processInstanceId !== owner.processInstanceId ||
        wait.id.elementId !== operation.task.elementId
      ? null
      : {
        anchor: { kind: WaitAnchorKind, id: wait.id },
        processId,
        elementId: operation.task.elementId,
        owner,
      };
  });
  return starts.some((start) => start === null)
    ? null
    : starts as UnnumberedFlowNodeOccurrenceStart[];
}

/** Ends the selected child and, for first-completion closure, every withdrawn sibling. */
export function parallelMultiInstanceCompletionOccurrences(
  program: SemanticProcessProgram,
  before: RuntimeState,
  after: RuntimeState,
  stimulus: CompleteUserTaskInstanceStimulus,
): ParallelMultiInstanceOccurrenceChange | null {
  const beforeBindings = parallelMultiInstanceBindingsForState(program, before);
  const afterBindings = parallelMultiInstanceBindingsForState(program, after);
  if (beforeBindings === undefined || afterBindings === undefined) return null;
  const selected = beforeBindings.filter(({ taskWaits }) =>
    taskWaits.some(({ id }) => sameOccurrence(id, stimulus.taskId))
  );
  const [binding] = selected;
  if (selected.length !== 1 || binding === undefined) return null;
  const survivors = afterBindings.filter(({ controller }) =>
    sameActivityOccurrence(controller.id, binding.controller.id)
  );
  if (survivors.length > 1) return null;
  const otherTasks = binding.taskWaits
    .map(({ id }) => id)
    .filter((id) => !sameOccurrence(id, stimulus.taskId));
  if (survivors.length === 1) {
    const survivorTasks = survivors[0]!.taskWaits.map(({ id }) => id);
    if (!sameOccurrences(otherTasks, survivorTasks)) return null;
  }
  const ended = [completion(stimulus.taskId)];
  if (survivors.length === 0) {
    ended.push(...otherTasks.map(cancellation));
  }
  return { started: [], ended };
}

/** Cancels every still-open child when the shared boundary Timer wins. */
export function parallelMultiInstanceInterruptionOccurrences(
  boundary: BoundaryTimerBinding,
): ParallelMultiInstanceOccurrenceChange | null {
  return "activeTasks" in boundary
    ? { started: [], ended: boundary.activeTasks.map(cancellation) }
    : null;
}

function completion(id: OccurrenceId): UnnumberedFlowNodeOccurrenceEnd {
  return {
    anchor: { kind: WaitAnchorKind, id },
    terminal: CompletedTerminal,
  };
}

function cancellation(id: OccurrenceId): UnnumberedFlowNodeOccurrenceEnd {
  return {
    anchor: { kind: WaitAnchorKind, id },
    terminal: CancelledTerminal,
  };
}

function sameOccurrences(
  left: ReadonlyArray<OccurrenceId>,
  right: ReadonlyArray<OccurrenceId>,
): boolean {
  return left.length === right.length && left.every((id, index) =>
    right[index] !== undefined && sameOccurrence(id, right[index]!)
  );
}
