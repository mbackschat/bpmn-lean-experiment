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
  activityOccurrenceForTaskBody,
  compareActivityOccurrences,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import { replaceActivityBodyTask } from "./activity-body-turnover.js";
import { VariableValueKind } from "./contract.js";
import type {
  CompleteUserTaskInstanceStimulus,
  VariableBinding,
  VariableValue,
} from "./contract.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  AwaitSequentialMultiInstanceUserTaskOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";

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
 * Whether the collection fits the profile's declared bounds.
 *
 * The bounds are checked here rather than at admission because they constrain a runtime value: the
 * definition admits the shape, and only entry sees the collection the host supplied. Exceeding any of
 * them leaves the transition undefined, so the command is refused rather than truncated.
 *
 * The canonical byte bound is measured over `JSON.stringify` of the array, which is already canonical
 * for a list of strings: there are no object keys to order, and the wire encoder produces the same
 * bytes for the same items in the same order.
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

/** The exact ordered output collection, published once and never before natural completion. */
function publishedCollection(
  bindings: ReadonlyArray<VariableBinding>,
  name: string,
  items: ReadonlyArray<string>,
): ReadonlyArray<VariableBinding> {
  const value: VariableValue = {
    kind: VariableValueKind.StringList,
    value: [...items],
  };
  return [
    ...bindings.filter((binding) => binding.name !== name),
    { name, value },
  ].sort((left, right) => left.name.localeCompare(right.name));
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

  const [timerId] = record.attachedTimers;
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
    timerWaits: timerId === undefined
      ? state.timerWaits
      : state.timerWaits.filter(({ id }) => !sameOccurrence(id, timerId)),
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
