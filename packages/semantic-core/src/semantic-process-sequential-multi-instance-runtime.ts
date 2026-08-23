/**
 * The sequential Multi-Instance transitions, starting with outer entry.
 *
 * A separate owner because the dispatcher has no room for a transition and because these transitions
 * share one representation: the outer Activity occurrence record holds the body and the lifetime
 * deadline, and the controller beside it holds the snapshot and the accepted results. Neither is a
 * resumable state without the other, which is why one operation owns the controller, the repeated
 * inner task, and the single boundary Timer.
 */
import {
  ActivityBodyKind,
  activityBodyTask,
  activityOccurrenceForAttachedTimer,
  activityOccurrenceForTaskBody,
  compareActivityOccurrences,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import { replaceActivityBodyTask } from "./activity-body-turnover.js";
import { VariableValueKind } from "./contract.js";
import type {
  CompleteUserTaskInstanceStimulus,
  FireTimerStimulus,
  VariableBinding,
} from "./contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitSequentialMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import { mergeProcessVariableBindings } from "./semantic-process-data.js";

import {
  ControlStateKind,
  addToken,
  compareTimerWaits,
  compareUserTaskWaits,
  nextActivation,
  removeToken,
  sameOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type { RuntimeState, ScopeOccurrenceId } from "./semantic-process-state.js";
import {
  compareSequentialMultiInstanceControllers,
  sequentialMultiInstanceControllerFor,
} from "./sequential-multi-instance-controller.js";
import { utf8ByteLength } from "./wire.js";

/**
 * The collection this entry snapshots, or `undefined` when the definition's input is not a usable one.
 *
 * Located by the exact DataObject identity the operation carries, never by value kind: the output
 * collection is a second `StringList` in the same scope, so a kind-based lookup would be ambiguous
 * from the first natural completion onward and would silently pick the wrong binding.
 */
function inputCollection(
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  bindings: ReadonlyArray<VariableBinding>,
): ReadonlyArray<string> | undefined {
  const matches = bindings.filter(({ name }) =>
    name === operation.data.input.dataObjectId
  );
  const [binding] = matches;
  if (matches.length !== 1 || binding === undefined) {
    return undefined;
  }
  return binding.value.kind === VariableValueKind.StringList
    ? binding.value.value
    : undefined;
}

/**
 * Whether a collection fits the profile's declared bounds.
 *
 * Both boundaries that see a runtime collection measure it here: entry, with the input collection the
 * host supplied, and inner completion, with the candidate output collection that completion would
 * store. The bounds cannot be decided at admission, which admits the shape rather than the values.
 * Exceeding any of them leaves the transition undefined, so the command is refused rather than
 * truncated.
 *
 * A candidate output collection re-measures the cardinality bound and the already accepted items
 * instead of skipping them. Both hold by construction there, since the candidate is at most the
 * snapshot entry already bounded; what the call decides on that side is the submitted result's own size
 * and the candidate collection's canonical size. One owner for the measure is what keeps the two sides
 * from drifting into two byte counts that agree only by luck.
 *
 * The canonical byte bound is measured over `JSON.stringify` of the array, which is already canonical
 * for a list of strings: there are no object keys to order, and the wire encoder produces the same
 * bytes for the same items in the same order. That measure is escape-aware, so a string of characters
 * JSON escapes counts twice toward the collection bound.
 */
function withinLimits(
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  collection: ReadonlyArray<string>,
): boolean {
  const { maximumItems, maximumItemUtf8Bytes, maximumCanonicalCollectionUtf8Bytes } =
    operation.limits;
  return collection.length <= maximumItems &&
    collection.every((item) => utf8ByteLength(item) <= maximumItemUtf8Bytes) &&
    utf8ByteLength(JSON.stringify(collection)) <=
      maximumCanonicalCollectionUtf8Bytes;
}

/**
 * The exact ordered output collection, published once and never before natural completion.
 *
 * Delegates to the core's one create-or-replace merge, which Lean's `publishProcessCollection` also
 * calls, so every Process publication in both targets carries one canonical binding order. Sorting
 * here instead would install a second canonical order: it can disagree with the shared code-point
 * comparator on any two DataObject IDs differing in case or across `_`, and a locale comparison also
 * varies with the host's ICU data.
 */
function publishedCollection(
  bindings: ReadonlyArray<VariableBinding>,
  name: string,
  items: ReadonlyArray<string>,
): ReadonlyArray<VariableBinding> {
  return mergeProcessVariableBindings(bindings, [
    {
      name,
      value: { kind: VariableValueKind.StringList, value: [...items] },
    },
  ]);
}

/**
 * `SMI-ENTER-01`. Evaluates and snapshots the collection once, then takes one of two arms.
 *
 * The empty arm is not a degenerate case of the other. A zero-item collection generates no inner
 * instance, so there is no body for a record to own and no iteration for a deadline to bound; the
 * transition publishes the empty output collection and follows normal control in one step. Arming a
 * deadline and withdrawing it again in the same transition would be the same observable outcome
 * reached through a state the profile says never becomes stable.
 *
 * The non-empty arm mints three identities from three independent counter families: the inner task's,
 * the outer Timer's, and the outer Activity's. The Activity's is advanced here and never again for
 * this occurrence, which is what makes the body's activation diverge from the handler's on the first
 * iteration boundary.
 */
export function enterSequentialMultiInstanceUserTask(
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  state: RuntimeState,
  owner: ScopeOccurrenceId,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const collection = inputCollection(operation, state.variables.process.bindings);
  if (collection === undefined || !withinLimits(operation, collection)) {
    return null;
  }
  const consumed = removeToken(state.controlTokens, operation.input, owner);

  if (collection.length === 0) {
    return {
      ...state,
      controlTokens: addToken(consumed, operation.normalOutput, owner),
      sequentialMultiInstanceControllers: [
        ...(state.sequentialMultiInstanceControllers ?? []),
      ],
      variables: {
        ...state.variables,
        process: {
          bindings: publishedCollection(
            state.variables.process.bindings,
            operation.data.output.dataObjectId,
            [],
          ),
        },
      },
    };
  }

  const taskActivation = nextActivation(state.taskActivations, operation.task.elementId);
  const timerActivation = nextActivation(
    state.timerActivations,
    operation.boundaryTimer.elementId,
  );
  const activityActivation = nextActivation(
    state.activityActivations,
    operation.task.elementId,
  );
  const deadlineMs = state.logicalTimeMs + operation.boundaryTimer.durationMs;
  if (!Number.isSafeInteger(deadlineMs)) {
    throw new RangeError("Timer deadline exceeds the safe integer boundary");
  }
  const taskId = {
    processInstanceId: owner.processInstanceId,
    elementId: operation.task.elementId,
    activation: taskActivation,
  } as const;
  const timerId = {
    processInstanceId: owner.processInstanceId,
    elementId: operation.boundaryTimer.elementId,
    activation: timerActivation,
  } as const;
  const activityId = {
    processInstanceId: owner.processInstanceId,
    activityElementId: operation.task.elementId,
    activation: activityActivation,
  } as const;

  return {
    ...state,
    controlTokens: consumed,
    activityOccurrences: [
      ...state.activityOccurrences,
      {
        id: activityId,
        owner,
        operationId: operation.id,
        body: { kind: ActivityBodyKind.UserTask, task: taskId } as const,
        attachedTimers: [timerId],
      },
    ].sort(compareActivityOccurrences),
    sequentialMultiInstanceControllers: [
      ...(state.sequentialMultiInstanceControllers ?? []),
      { id: activityId, snapshot: [...collection], outputSlots: [] },
    ].sort(compareSequentialMultiInstanceControllers),
    activityActivations: setActivationCount(
      state.activityActivations,
      operation.task.elementId,
      activityActivation,
    ),
    userTaskWaits: [
      ...state.userTaskWaits,
      {
        id: taskId,
        owner,
        name: operation.task.name,
        output: operation.normalOutput,
      },
    ].sort(compareUserTaskWaits),
    timerWaits: [
      ...state.timerWaits,
      { id: timerId, owner, deadlineMs, output: operation.boundaryTimer.output },
    ].sort(compareTimerWaits),
    taskActivations: setActivationCount(
      state.taskActivations,
      operation.task.elementId,
      taskActivation,
    ),
    timerActivations: setActivationCount(
      state.timerActivations,
      operation.boundaryTimer.elementId,
      timerActivation,
    ),
  };
}

/**
 * The exact scalar result this profile accepts, or `undefined`.
 *
 * One binding, named by the task's own DataOutput, carrying a String. Anything else leaves the
 * transition undefined rather than partially applied: an accepted completion writes one output slot,
 * so a submission this account cannot place in a slot must not commit.
 */
function acceptedResult(
  operation: AwaitSequentialMultiInstanceUserTaskOperation,
  submitted: ReadonlyArray<VariableBinding>,
): string | undefined {
  const [binding] = submitted;
  if (submitted.length !== 1 || binding === undefined) {
    return undefined;
  }
  return binding.name === operation.data.output.taskDataOutputId &&
      binding.value.kind === VariableValueKind.String
    ? binding.value.value
    : undefined;
}

/**
 * `SMI-ITERATE-01` and `SMI-COMPLETE-01`, which are one transition with two arms.
 *
 * They are one function because the deciding fact is the same read: whether this completion filled
 * the last slot. Splitting them would mean asking that question twice, and the intermediate state
 * between "output stored" and "next instance generated" is exactly the state `SMI-ITERATE-01` forbids
 * from becoming stable.
 *
 * The non-final arm delegates the body swap to the Activity occurrence account's replacement
 * operation, which is what keeps the outer identity, the owner, the operation ID, and the attached
 * lifetime deadline exactly as they were while the inner task identity advances. That is the whole
 * reason this capsule needed the turnover amendment: resetting the deadline per iteration, or
 * re-arming the outer Activity, would both be visible here as a changed handler occurrence.
 *
 * The final arm publishes the ordered collection once, in index order rather than completion order,
 * and removes the controller, the record, and the deadline in the same step.
 */
export function completeSequentialMultiInstanceIteration(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: CompleteUserTaskInstanceStimulus,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const operation = sequentialMultiInstanceOperationFor(program, stimulus.taskId);
  if (operation === undefined) {
    return null;
  }
  const record = activityOccurrenceForTaskBody(
    state.activityOccurrences,
    stimulus.taskId,
  );
  if (record === undefined) {
    return null;
  }
  const controller = sequentialMultiInstanceControllerFor(
    state.sequentialMultiInstanceControllers ?? [],
    record.id,
  );
  const result = acceptedResult(operation, stimulus.submittedValues);
  if (controller === undefined || result === undefined) {
    return null;
  }
  const outputSlots = [...controller.outputSlots, result];
  // Measured before either arm, because the result that crosses the collection bound is the final one
  // and a check placed on the non-final arm alone would never see it. Refusing here commits nothing:
  // no slot is stored, no body is replaced, and no collection is published.
  if (!withinLimits(operation, outputSlots)) {
    return null;
  }
  const others = (state.sequentialMultiInstanceControllers ?? []).filter(
    (candidate) => candidate !== controller,
  );

  if (outputSlots.length < controller.snapshot.length) {
    const replaced = replaceActivityBodyTask(state, record);
    if (replaced === null) {
      return null;
    }
    return {
      ...replaced,
      sequentialMultiInstanceControllers: [
        ...others,
        { ...controller, outputSlots },
      ].sort(compareSequentialMultiInstanceControllers),
    };
  }

  return {
    ...state,
    controlTokens: addToken(
      state.controlTokens,
      operation.normalOutput,
      record.owner,
    ),
    userTaskWaits: state.userTaskWaits.filter(({ id }) =>
      !sameOccurrence(id, stimulus.taskId)
    ),
    // Every Timer the record lists leaves with it. The record's attached-wait conjuncts admit more
    // than one live attached Timer, and a deadline whose Activity occurrence is gone has nothing left
    // that identifies it, so a head-only withdrawal would strand it; Lean's `finalCompletionState`
    // filters this same whole list.
    timerWaits: state.timerWaits.filter(({ id }) =>
      !record.attachedTimers.some((timerId) => sameOccurrence(id, timerId))
    ),
    activityOccurrences: state.activityOccurrences.filter((candidate) =>
      !sameActivityOccurrence(candidate.id, record.id)
    ),
    sequentialMultiInstanceControllers: others,
    variables: {
      ...state.variables,
      process: {
        bindings: publishedCollection(
          state.variables.process.bindings,
          operation.data.output.dataObjectId,
          outputSlots,
        ),
      },
    },
  };
}

/** The Multi-Instance operation that declares this task element, or `undefined`. */
export function sequentialMultiInstanceOperationFor(
  program: SemanticProcessProgram,
  taskId: { elementId: string },
): AwaitSequentialMultiInstanceUserTaskOperation | undefined {
  const matches = program.operations.filter((operation) =>
    operation.kind ===
      SemanticOperationKind.AwaitSequentialMultiInstanceUserTask &&
    operation.task.elementId === taskId.elementId
  );
  const [operation] = matches;
  return matches.length === 1 &&
      operation !== undefined &&
      operation.kind ===
        SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
    ? operation
    : undefined;
}

/** Whether this task occurrence belongs to a sequential Multi-Instance Activity. */
export function isSequentialMultiInstanceTaskDefinition(
  program: SemanticProcessProgram,
  taskId: { elementId: string },
): boolean {
  return sequentialMultiInstanceOperationFor(program, taskId) !== undefined;
}
/**
 * `SMI-CANCEL-01`. The exact outer deadline interrupts the whole repetition.
 *
 * Interruption is not a completion with a different output. It withdraws the one active inner task,
 * generates no pending item, discards every accepted result, removes the controller and the record,
 * and enables only the boundary path. Nothing is published to Process scope, which is the resolution
 * this profile selected: a partial collection would be observable state that no clause defines, and
 * BPMN's own caution against exposing the output collection before every item is written applies most
 * sharply to the case where the remaining items never will be.
 *
 * The counters this discards are the reason the controller stores none. There is no stable state in
 * which a terminated count is nonzero, so nothing has to be decremented, transitioned, or projected:
 * the record and the controller leave together in the transition that terminates the active instance.
 */
export function interruptSequentialMultiInstance(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: FireTimerStimulus,
): RuntimeState | null {
  if (state.control.kind !== ControlStateKind.Running) {
    return null;
  }
  const operation = sequentialMultiInstanceBoundaryOperationFor(
    program,
    stimulus.timerId,
  );
  if (operation === undefined) {
    return null;
  }
  const deadline = state.timerWaits.find(({ id }) =>
    sameOccurrence(id, stimulus.timerId)
  );
  const record = activityOccurrenceForAttachedTimer(
    state.activityOccurrences,
    stimulus.timerId,
  );
  if (deadline === undefined || record === undefined) {
    return null;
  }
  const controller = sequentialMultiInstanceControllerFor(
    state.sequentialMultiInstanceControllers ?? [],
    record.id,
  );
  const activeTask = activityBodyTask(record);
  if (controller === undefined || activeTask === undefined) {
    return null;
  }
  // The firing instant is the deadline, never the submitted logical time: the host derives the instant
  // from committed state, so a stimulus naming a different time is describing a different transition.
  if (stimulus.logicalTimeMs !== deadline.deadlineMs) {
    return null;
  }
  return {
    ...state,
    logicalTimeMs: deadline.deadlineMs,
    controlTokens: addToken(
      state.controlTokens,
      operation.boundaryTimer.output,
      record.owner,
    ),
    userTaskWaits: state.userTaskWaits.filter(({ id }) =>
      !sameOccurrence(id, activeTask)
    ),
    // Every Timer the record lists leaves with it, the fired one included: removing an Activity
    // occurrence record must leave no wait that record named still live, and the record's conjuncts
    // admit more than one live attached Timer. The fired deadline is a member of this list by
    // construction, since the record was located through it.
    timerWaits: state.timerWaits.filter(({ id }) =>
      !record.attachedTimers.some((timerId) => sameOccurrence(id, timerId))
    ),
    activityOccurrences: state.activityOccurrences.filter((candidate) =>
      !sameActivityOccurrence(candidate.id, record.id)
    ),
    sequentialMultiInstanceControllers:
      (state.sequentialMultiInstanceControllers ?? []).filter(
        (candidate) => candidate !== controller,
      ),
  };
}

/** The Multi-Instance operation whose lifetime deadline this Timer occurrence is, or `undefined`. */
export function sequentialMultiInstanceBoundaryOperationFor(
  program: SemanticProcessProgram,
  timerId: { elementId: string },
): AwaitSequentialMultiInstanceUserTaskOperation | undefined {
  const matches = program.operations.filter((operation) =>
    operation.kind ===
      SemanticOperationKind.AwaitSequentialMultiInstanceUserTask &&
    operation.boundaryTimer.elementId === timerId.elementId
  );
  const [operation] = matches;
  return matches.length === 1 &&
      operation !== undefined &&
      operation.kind ===
        SemanticOperationKind.AwaitSequentialMultiInstanceUserTask
    ? operation
    : undefined;
}

/** Whether this Timer occurrence is a sequential Multi-Instance Activity's lifetime deadline. */
export function isSequentialMultiInstanceBoundaryDefinition(
  program: SemanticProcessProgram,
  timerId: { elementId: string },
): boolean {
  return sequentialMultiInstanceBoundaryOperationFor(program, timerId) !==
    undefined;
}
