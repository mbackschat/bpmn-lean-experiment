/**
 * Executable transitions for one embedded Sub-Process occurrence that owns an interrupting deadline.
 *
 * The deadline is owned by the *parent* scope occurrence, and that is a correctness requirement rather
 * than a modelling preference: `isScopeOccurrenceQuiescent` treats an owned Timer wait as live work, so
 * a child-owned deadline would make the child permanently non-quiescent and its normal completion
 * unreachable. Under this profile that failure has no separating witness, because the deadline arm
 * would still behave correctly and only the quiescence arm would silently deadlock.
 *
 * Like the bounded User Task family this keeps no hidden ownership record. The child occurrence and its
 * deadline are recovered by joining the committed operation to the live occurrence and Timer wait,
 * which is sound only because the profile admits exactly one such Sub-Process with exactly one boundary
 * Timer and because arming is atomic, so the two share one activation ordinal. A repeated or
 * Multi-Instance Sub-Process would break that recovery and requires an explicit occurrence record.
 */
import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  EnterBoundedScopeOperation,
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
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
  return {
    ...entered,
    timerWaits: [
      ...entered.timerWaits,
      {
        id: {
          processInstanceId: parent.processInstanceId,
          elementId: operation.boundaryTimer.elementId,
          activation,
        },
        owner: parent,
        deadlineMs,
        output: operation.boundaryTimer.output,
      },
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
  const parent = before.scopeOccurrences.find(
    ({ id }) => id.definitionScopeId === completedScopeId,
  )?.parent;
  const deadline = parent === undefined || parent === null
    ? undefined
    : after.timerWaits.find((candidate) =>
      candidate.id.elementId === definition.boundaryTimer.elementId &&
      sameScopeOccurrence(candidate.owner, parent)
    );
  return deadline === undefined ? null : {
    ...after,
    timerWaits: after.timerWaits.filter((candidate) => candidate !== deadline),
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
  const cancelled = removeScopeOccurrenceSubtree(state, armed.child);
  return {
    ...cancelled,
    controlTokens: addToken(
      cancelled.controlTokens,
      armed.definition.boundaryTimer.output,
      parent,
    ),
    timerWaits: cancelled.timerWaits.filter(
      (candidate) => candidate !== armed.deadline,
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
  const deadline = state.timerWaits.find((candidate) =>
    sameOccurrence(candidate.id, timerId)
  );
  const definition = deadline === undefined ? undefined : boundedScopeOperations(
    program,
  ).find(
    (operation) =>
      operation.boundaryTimer.elementId === deadline.id.elementId,
  );
  const child = definition === undefined || deadline === undefined
    ? undefined
    : state.scopeOccurrences.find(({ id, parent }) =>
      id.definitionScopeId === definition.childScopeId &&
      id.activation === deadline.id.activation &&
      parent !== null &&
      sameScopeOccurrence(parent, deadline.owner)
    );
  return definition === undefined || deadline === undefined || child === undefined
    ? undefined
    : { definition, child, deadline };
}

function nextActivation(
  counts: ReadonlyArray<{ readonly elementId: string; readonly count: number }>,
  elementId: string,
): number {
  return (counts.find((entry) => entry.elementId === elementId)?.count ?? 0) + 1;
}
