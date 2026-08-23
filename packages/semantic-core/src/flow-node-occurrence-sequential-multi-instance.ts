/**
 * E2 flow-node occurrence accounting for the sequential Multi-Instance User Task.
 *
 * `SMI-OCCURRENCE-01`. Each generated inner User Task is one occurrence keyed by its own activation, the
 * outer Activity occurrence and the synthetic controller are no occurrence at all, and the active task
 * closes as completed or cancelled according to which transition won.
 *
 * A dedicated owner because this is one mechanism reached from four evaluator sites: outer entry, inner
 * completion, lifetime interruption, and the private-boundary resolution that keeps the outer deadline
 * out of the open set. Each of those sites keeps only the call.
 *
 * The two enum members named here are declared by the sibling lifecycle owner, which imports this
 * module. Rebuilding them as local literal casts keeps that sibling import type-only, exactly as the
 * other two occurrence modules already do.
 */
import {
  activityBodyTask,
  activityOccurrenceForTaskBody,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import type { ActivityOccurrence } from "./activity-occurrence.js";
import type {
  CompleteUserTaskInstanceStimulus,
  OccurrenceId,
} from "./contract.js";
import type {
  AwaitSequentialMultiInstanceUserTaskOperation,
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
  generatedInstanceCount,
  sequentialMultiInstanceControllerFor,
} from "./sequential-multi-instance-controller.js";
import { sequentialMultiInstanceOperationFor } from "./semantic-process-sequential-multi-instance-runtime.js";
import { candidateOperationOccurrence } from "./flow-node-occurrence-candidates.js";
import type {
  FlowNodeOccurrenceTerminalKind,
  SemanticFlowNodeOccurrenceAnchorKind,
  UnnumberedFlowNodeOccurrenceEnd,
  UnnumberedFlowNodeOccurrenceStart,
} from "./flow-node-occurrence-lifecycle.js";
import type { BoundaryTimerBinding } from "./flow-node-occurrence-open-set.js";

const WaitAnchorKind = "wait" as SemanticFlowNodeOccurrenceAnchorKind.Wait;
const CompletedTerminal = "completed" as FlowNodeOccurrenceTerminalKind.Completed;
const CancelledTerminal = "cancelled" as FlowNodeOccurrenceTerminalKind.Cancelled;

/** The occurrence starts and ends one sequential Multi-Instance transition contributes. */
export type SequentialMultiInstanceOccurrenceChange = Readonly<{
  started: UnnumberedFlowNodeOccurrenceStart[];
  ended: UnnumberedFlowNodeOccurrenceEnd[];
}>;

/**
 * The inner task occurrence one record's body currently is, or `null`.
 *
 * This is the definition of *generated inner instance* the whole file rests on, which is why it is one
 * predicate rather than four similar reads. The identity must be the record's own body, an open wait,
 * and this operation's task element in the record's Process instance, and the controller must exist
 * beside the record: without it the same wait is an ordinary User Task of the same element, which
 * belongs to a different occurrence account.
 */
function activeIterationTask(
  state: RuntimeState,
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  record: ActivityOccurrence,
): OccurrenceId | null {
  const body = activityBodyTask(record);
  const wait = body === undefined
    ? undefined
    : only(state.userTaskWaits.filter(({ id }) => sameOccurrence(id, body)));
  const controller = sequentialMultiInstanceControllerFor(
    state.sequentialMultiInstanceControllers ?? [],
    record.id,
  );
  return wait === undefined || controller === undefined ||
      wait.id.elementId !== operation.task.elementId ||
      wait.id.processInstanceId !== record.owner.processInstanceId
    ? null
    : wait.id;
}

function iterationStart(
  taskId: OccurrenceId,
  owner: ScopeOccurrenceId,
  processId: string,
): UnnumberedFlowNodeOccurrenceStart {
  return {
    anchor: { kind: WaitAnchorKind, id: taskId },
    processId,
    elementId: taskId.elementId,
    owner,
  };
}

/**
 * `SMI-ENTER-01` as occurrence accounting: one start, or none at all.
 *
 * Both arms are read from the successor state rather than from the input collection, because what the
 * transition committed is the fact E2 publishes and the snapshot is private. The empty arm is not
 * "no record found": an entry that left a controller without its record is a defect, and answering `[]`
 * there would publish a silent absence instead of refusing the projection.
 */
export function sequentialMultiInstanceEntryStarts(
  after: RuntimeState,
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  owner: ScopeOccurrenceId,
  processId: string,
): UnnumberedFlowNodeOccurrenceStart[] | null {
  const records = after.activityOccurrences.filter((record) =>
    record.operationId === operation.id &&
    sameScopeOccurrence(record.owner, owner)
  );
  const controllers = (after.sequentialMultiInstanceControllers ?? []).filter(
    ({ id }) =>
      id.processInstanceId === owner.processInstanceId &&
      id.activityElementId === operation.task.elementId,
  );
  const [record] = records;
  if (records.length !== controllers.length || records.length > 1) {
    return null;
  }
  if (record === undefined) {
    return [];
  }
  const taskId = activeIterationTask(after, operation, record);
  return taskId === null ? null : [iterationStart(taskId, owner, processId)];
}

/**
 * `SMI-ITERATE-01` and `SMI-COMPLETE-01` as occurrence accounting.
 *
 * The completing occurrence always ends as completed. Whether a next one starts is decided twice from
 * independent facts that must agree: the pre-state controller says whether this completion fills the
 * last slot, and the post-state says whether a record with a live body survived. Reading only the
 * post-state would make this delta agree with it by construction, and the post-state is also what the
 * lifecycle fold compares the delta against, so the two checks would share one failure mode.
 *
 * The generated task must differ from the completing one. That is the turnover this rule exists to
 * count: a body swap that kept the identity would publish one occurrence for two instances while every
 * count still balanced.
 */
export function sequentialMultiInstanceIterationOccurrences(
  program: SemanticProcessProgram,
  before: RuntimeState,
  after: RuntimeState,
  stimulus: CompleteUserTaskInstanceStimulus,
): SequentialMultiInstanceOccurrenceChange | null {
  const operation = sequentialMultiInstanceOperationFor(program, stimulus.taskId);
  const record = activityOccurrenceForTaskBody(
    before.activityOccurrences,
    stimulus.taskId,
  );
  if (
    operation === undefined || record === undefined ||
    record.operationId !== operation.id
  ) {
    return null;
  }
  const controller = sequentialMultiInstanceControllerFor(
    before.sequentialMultiInstanceControllers ?? [],
    record.id,
  );
  const origin = candidateOperationOccurrence(
    program,
    before,
    operation,
    record.owner,
  );
  if (
    controller === undefined || origin === null ||
    origin.elementId !== operation.task.elementId
  ) {
    return null;
  }
  const ended = [{
    anchor: { kind: WaitAnchorKind, id: stimulus.taskId },
    terminal: CompletedTerminal,
  }];
  const survivor = only(after.activityOccurrences.filter(({ id }) =>
    sameActivityOccurrence(id, record.id)
  ));
  if (generatedInstanceCount(controller) === controller.snapshot.length) {
    return survivor === undefined ? { started: [], ended } : null;
  }
  const next = survivor === undefined
    ? null
    : activeIterationTask(after, operation, survivor);
  return next === null || sameOccurrence(next, stimulus.taskId)
    ? null
    : { started: [iterationStart(next, record.owner, origin.processId)], ended };
}

/**
 * `SMI-CANCEL-01` as occurrence accounting: the abandoned iteration is cancelled, never completed.
 *
 * The terminal kind is the whole content of this function, and it is the one public fact interruption
 * and final completion disagree about. Reusing the completion path would state that work nobody
 * finished did finish. The boundary Event's own instantaneous occurrence is added by the caller, which
 * already derives it the same way for every other interrupting boundary-Timer family.
 */
export function sequentialMultiInstanceInterruptionOccurrences(
  boundary: BoundaryTimerBinding,
): SequentialMultiInstanceOccurrenceChange | null {
  return "activeTask" in boundary
    ? {
      started: [],
      ended: [{
        anchor: { kind: WaitAnchorKind, id: boundary.activeTask },
        terminal: CancelledTerminal,
      }],
    }
    : null;
}

/**
 * The lifetime deadline of one open sequential Multi-Instance Activity, bound to its active task.
 *
 * Resolved from the Activity occurrence record that owns the deadline, exactly as the other
 * boundary-Timer families are, so task turnover cannot detach the still-live deadline or attach it to a
 * stale iteration. Refusing the binding is not neutral here: an unresolved deadline is classified as an
 * ordinary flow node and published as an occurrence of its own.
 */
export function sequentialMultiInstanceBoundaryTimerBinding(
  state: RuntimeState,
  record: ActivityOccurrence,
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  wait: RuntimeState["timerWaits"][number],
): BoundaryTimerBinding | null {
  const activeTask = activeIterationTask(state, operation, record);
  return activeTask === null || operation.boundaryTimer.output !== wait.output
    ? null
    : { operation, activeTask };
}

/**
 * Whether one open User Task wait is a generated inner instance of this operation.
 *
 * Definition shape plus the generating record. The element, the normal output a completion enables, the
 * task name, and the absence of configured metadata must match the operation, and the wait must be the
 * current body of exactly one live record bound to it. The record half is what stops a stale inner task
 * from projecting a second open occurrence for one repetition.
 */
export function sequentialMultiInstanceTaskWaitMatches(
  state: RuntimeState,
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  wait: RuntimeState["userTaskWaits"][number],
): boolean {
  const record = activityOccurrenceForTaskBody(
    state.activityOccurrences,
    wait.id,
  );
  return operation.task.elementId === wait.id.elementId &&
    operation.normalOutput === wait.output &&
    operation.task.name === wait.name &&
    wait.metadata === undefined &&
    record !== undefined &&
    record.operationId === operation.id &&
    sameScopeOccurrence(record.owner, wait.owner) &&
    activeIterationTask(state, operation, record) !== null;
}

function only<T>(values: ReadonlyArray<T>): T | undefined {
  return values.length === 1 ? values[0] : undefined;
}
