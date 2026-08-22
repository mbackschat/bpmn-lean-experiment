/**
 * Executable transitions for one embedded Sub-Process occurrence that owns an interrupting deadline.
 *
 * The deadline is owned by the *parent* scope occurrence, and that is a correctness requirement rather
 * than a modelling preference: `isScopeOccurrenceQuiescent` treats an owned Timer wait as live work, so
 * a child-owned deadline would make the child permanently non-quiescent and its normal completion
 * unreachable. Under this profile that failure has no separating witness, because the deadline arm
 * would still behave correctly and only the quiescence arm would silently deadlock.
 *
 * The child occurrence and its deadline are read from the Activity occurrence record that arming
 * creates. They used to be recovered by requiring a child *scope* activation ordinal to equal a Timer
 * activation ordinal on the deadline arm, and by taking the first Timer of the right element owned by
 * the parent on the quiescence arm, which compared no ordinal at all. Neither agreement was asserted
 * anywhere, and repetition breaks both.
 */
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type {
  EnterBoundedScopeOperation,
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  ActivityBodyKind,
  activityOccurrenceForAttachedTimer,
  activityOccurrenceForScopeBody,
  compareActivityOccurrences,
  sameActivityOccurrence,
} from "./activity-occurrence.js";
import {
  removeScopeOccurrenceSubtree,
} from "./semantic-process-scope-cancellation.js";
import {
  completeScope,
  enterChildScope,
} from "./semantic-process-scope-runtime.js";
import {
  addToken,
  compareTimerWaits,
  ControlStateKind,
  sameOccurrence,
  sameScopeOccurrence,
  setActivationCount,
} from "./semantic-process-state.js";
import type {
  RuntimeScopeOccurrence,
  RuntimeState,
  ScopeOccurrenceId,
  SemanticTimerWait,
} from "./semantic-process-state.js";
import { StimulusKind } from "./contract.js";
import type { FireTimerStimulus, OccurrenceId } from "./contract.js";

type ArmedBoundedScope = Readonly<{
  definition: EnterBoundedScopeOperation;
  child: RuntimeScopeOccurrence;
  deadline: SemanticTimerWait;
}>;

/**
 * Atomically creates the child scope occurrence, its entry token, and the deadline.
 *
 * None of the three exists without the others. A state holding a live child scope with no deadline, or
 * a deadline with no child scope, is invalid rather than a resumption surface, which is why the
 * recovery joins below refuse such a state instead of repairing it.
 */
export function armBoundedScope(
  operation: EnterBoundedScopeOperation,
  state: RuntimeState,
  parent: ScopeOccurrenceId,
): RuntimeState | null {
  const entered = enterChildScope(state, parent, operation);
  if (entered === null) {
    return null;
  }
  const activation = nextActivation(
    entered.timerActivations,
    operation.boundaryTimer.elementId,
  );
  const deadlineMs = entered.logicalTimeMs + operation.boundaryTimer.durationMs;
  if (!Number.isSafeInteger(deadlineMs)) {
    throw new RangeError("Timer deadline exceeds the safe integer boundary");
  }
  const child = entered.scopeOccurrences.find(({ id, parent: owner }) =>
    id.definitionScopeId === operation.childScopeId &&
    owner !== null &&
    sameScopeOccurrence(owner, parent)
  );
  if (child === undefined) {
    return null;
  }
  const activityActivation = nextActivation(
    entered.activityActivations,
    operation.origin.elementId,
  );
  const deadlineId = {
    processInstanceId: parent.processInstanceId,
    elementId: operation.boundaryTimer.elementId,
    activation,
  } as const;
  return {
    ...entered,
    // The record is created in the same transition as the body and the deadline, because a state
    // holding any two of the three is invalid rather than a resumption surface.
    activityOccurrences: [
      ...entered.activityOccurrences,
      {
        id: {
          processInstanceId: parent.processInstanceId,
          activityElementId: operation.origin.elementId,
          activation: activityActivation,
        },
        owner: parent,
        operationId: operation.id,
        body: { kind: ActivityBodyKind.ChildScope, scope: child.id } as const,
        attachedTimers: [deadlineId],
      },
    ].sort(compareActivityOccurrences),
    activityActivations: setActivationCount(
      entered.activityActivations,
      operation.origin.elementId,
      activityActivation,
    ),
    timerWaits: [
      ...entered.timerWaits,
      { id: deadlineId, owner: parent, deadlineMs, output: operation.boundaryTimer.output },
    ].sort(compareTimerWaits),
    timerActivations: setActivationCount(
      entered.timerActivations,
      operation.boundaryTimer.elementId,
      activation,
    ),
  };
}

/**
 * Completes a scope and, when that scope was bounded, withdraws the deadline in the same transition.
 *
 * Withdrawal is a consequence of the child's completion rather than a transition of its own, and only
 * the scope owner decides quiescence, so this composes the two rather than reimplementing either. An
 * unpaired scope passes straight through; a paired scope whose deadline is absent refuses, because
 * arming made that state unreachable.
 */
export function completeScopeWithdrawingDeadline(
  program: SemanticProcessProgram,
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.CompleteScope }
  >,
  state: RuntimeState,
): RuntimeState | null {
  const completed = completeScope(operation, state);
  return completed === null
    ? null
    : withdrawBoundedScopeDeadline(program, operation.scopeId, state, completed);
}

function withdrawBoundedScopeDeadline(
  program: SemanticProcessProgram,
  completedScopeId: string,
  before: RuntimeState,
  after: RuntimeState,
): RuntimeState | null {
  const definition = boundedScopeOperations(program).find(
    (operation) => operation.childScopeId === completedScopeId,
  );
  if (definition === undefined) {
    return after;
  }
  // Read from the record rather than matching the Timer element under the parent scope. The previous
  // form compared no activation at all, so it took whichever deadline of that element the collection
  // held first; under any repetition that is the wrong one.
  const child = before.scopeOccurrences.find(
    ({ id }) => id.definitionScopeId === completedScopeId,
  );
  const record = child === undefined
    ? undefined
    : activityOccurrenceForScopeBody(before.activityOccurrences, child.id);
  if (record === undefined) {
    return null;
  }
  return {
    ...after,
    timerWaits: after.timerWaits.filter(({ id }) =>
      !record.attachedTimers.some((attached) => sameOccurrence(attached, id))
    ),
    activityOccurrences: after.activityOccurrences.filter(
      (candidate) => !sameActivityOccurrence(candidate.id, record.id),
    ),
  };
}

/**
 * Commits the deadline arm at its exact deadline, cancelling the live child region.
 *
 * Clause 13.5.3's order — consume the Timer occurrence, cancel every non-final owner in the child
 * region, remove the child occurrence, then produce the boundary token in the parent scope — is one
 * atomic transition with no observable intermediate state. The deadline itself is owned by the parent
 * and therefore survives regional cancellation, so it is consumed explicitly here.
 */
export function interruptBoundedScope(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: FireTimerStimulus,
): RuntimeState | null {
  if (
    stimulus.kind !== StimulusKind.FireTimer ||
    state.control.kind !== ControlStateKind.Running
  ) {
    return null;
  }
  const armed = armedBoundedScopeForDeadline(program, state, stimulus.timerId);
  const parent = armed?.child.parent;
  if (
    armed === undefined ||
    parent === undefined ||
    parent === null ||
    stimulus.logicalTimeMs !== armed.deadline.deadlineMs
  ) {
    return null;
  }
  // Regional cancellation now withdraws the deadline with the region, because the Activity
  // occurrence record names it. It used to be consumed explicitly here, which was the only reason
  // an owner-filtered removal did not strand it.
  const cancelled = removeScopeOccurrenceSubtree(state, armed.child);
  return {
    ...cancelled,
    controlTokens: addToken(
      cancelled.controlTokens,
      armed.definition.boundaryTimer.output,
      parent,
    ),
    logicalTimeMs: armed.deadline.deadlineMs,
  };
}

/** True when the occurrence names the boundary Timer of a committed bounded-scope operation. */
export function isBoundedScopeDeadlineDefinition(
  program: SemanticProcessProgram,
  timerId: OccurrenceId,
): boolean {
  return boundedScopeOperations(program).some(
    (operation) => operation.boundaryTimer.elementId === timerId.elementId,
  );
}

function boundedScopeOperations(
  program: SemanticProcessProgram,
): ReadonlyArray<EnterBoundedScopeOperation> {
  return program.operations.filter(
    (operation): operation is EnterBoundedScopeOperation =>
      operation.kind === SemanticOperationKind.EnterBoundedScope,
  );
}

/**
 * Joins one live deadline to its committed definition and the child occurrence it bounds.
 *
 * The child is matched on the deadline's own activation ordinal, which atomic arming keeps equal, so a
 * deadline left over from an earlier activation cannot claim a later child region.
 */
function armedBoundedScopeForDeadline(
  program: SemanticProcessProgram,
  state: RuntimeState,
  timerId: OccurrenceId,
): ArmedBoundedScope | undefined {
  const record = activityOccurrenceForAttachedTimer(state.activityOccurrences, timerId);
  if (record === undefined || record.body.kind !== ActivityBodyKind.ChildScope) {
    return undefined;
  }
  const body = record.body.scope;
  const definition = boundedScopeOperations(program).find(
    (operation) => operation.id === record.operationId,
  );
  const child = state.scopeOccurrences.find(({ id }) => sameScopeOccurrence(id, body));
  const deadline = state.timerWaits.find(({ id }) => sameOccurrence(id, timerId));
  return definition === undefined || child === undefined || deadline === undefined
    ? undefined
    : { definition, child, deadline };
}

function nextActivation(
  counts: ReadonlyArray<{ readonly elementId: string; readonly count: number }>,
  elementId: string,
): number {
  return (counts.find((entry) => entry.elementId === elementId)?.count ?? 0) + 1;
}
