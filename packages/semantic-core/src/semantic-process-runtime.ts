import { CommandOutcome } from "./contract.js";
import type { Stimulus } from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import { admit } from "./semantic-command-admission.js";
import type { SemanticCommandOutcome } from "./semantic-command-admission.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import {
  calledProcessAssociationsAreValid,
  invokeCalledProcess,
  returnCalledProcess,
} from "./semantic-process-call-runtime.js";
import {
  choose,
  duplicate,
  reachNoneEnd,
  synchronize,
} from "./semantic-process-control-flow-runtime.js";
import { mergeExclusive } from "./semantic-process-cyclic-control-flow-runtime.js";
import {
  armBoundedScope,
  completeScopeWithdrawingDeadline,
} from "./semantic-process-bounded-scope-runtime.js";
import { armBoundedUserTask } from "./semantic-process-bounded-task-runtime.js";
import { armMonitoredUserTask } from "./semantic-process-monitored-task-runtime.js";
import {
  throwError,
} from "./semantic-process-error-runtime.js";
import {
  selectMany,
  synchronizeSelected,
} from "./semantic-process-inclusive-gateway-runtime.js";
import {
  armEventRace,
  eventRaceAssociationsAreValid,
} from "./semantic-process-event-race-runtime.js";
import { createMessageWait } from "./semantic-process-message.js";
import { applyMessageInitiation } from "./semantic-process-message-start.js";
import {
  commonTokenOwner,
  enterScope,
  onlyTokenOwner,
} from "./semantic-process-scope-runtime.js";
import {
  addToken,
  ControlStateKind,
  removeToken,
} from "./semantic-process-state.js";
import type {
  RuntimeState,
  ScopeOccurrenceId,
} from "./semantic-process-state.js";
import {
  createEffectWait,
  createTimerWait,
  createUserTaskWait,
} from "./semantic-process-wait-runtime.js";
import { compareCanonicalStrings } from "./wire.js";

export {
  ControlStateKind,
  initialState,
} from "./semantic-process-state.js";
export type {
  ControlPlaceTokens,
  ControlState,
  ActivityVariableScope,
  ProcessVariableScope,
  RuntimeState,
  RuntimeScopeOccurrence,
  ScopeOccurrenceId,
  ScopedVariables,
  SemanticEffectWait,
  SemanticMessageWait,
  SemanticTimerWait,
  SemanticUserTaskWait,
  SelectedBranchSet,
  EventRace,
  CalledProcessOccurrence,
} from "./semantic-process-state.js";

export type CommandResult = DeepReadonly<{
  outcome: SemanticCommandOutcome;
  state: RuntimeState;
  internalStepBoundExceeded: boolean;
}>;

type ClosureResult = DeepReadonly<{
  state: RuntimeState;
  hitBound: boolean;
}>;

export const semanticProcessClosureLimit = 8;

export function validateClosureLimit(closureLimit: number): void {
  if (!Number.isSafeInteger(closureLimit) || closureLimit < 0) {
    throw new RangeError("closureLimit must be a non-negative safe integer");
  }
}

// Every internal operation the program permits in this state. Membership and
// count are order-independent; the canonical-ID sort exists only for the
// selector below.
function enabledInternalOperations(
  program: SemanticProcessProgram,
  state: RuntimeState,
): ReadonlyArray<Readonly<{
  operation: SemanticOperation;
  successor: RuntimeState;
}>> {
  return program.operations
    .map((operation) => ({
      operation,
      successor: applyInternalOperation(program, operation, state),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        operation: SemanticOperation;
        successor: RuntimeState;
      } => candidate.successor !== null,
    )
    .sort(({ operation: left }, { operation: right }) =>
      compareCanonicalStrings(left.id, right.id)
    );
}

export function enabledInternalOperationCount(
  program: SemanticProcessProgram,
  state: RuntimeState,
): number {
  return enabledInternalOperations(program, state).length;
}

/**
 * Classifies a state already known to be internally stable.
 *
 * A running state is resumable only when one semantic wait exposes a possible
 * future ingress. Hidden tokens alone are not evidence of progress.
 */
export function isStableStateResumable(state: RuntimeState): boolean {
  switch (state.control.kind) {
    case ControlStateKind.NotStarted:
      return false;
    case ControlStateKind.Running:
      return eventRaceAssociationsAreValid(state) &&
        calledProcessAssociationsAreValid(state) &&
        (state.userTaskWaits.length > 0 ||
        state.messageWaits.length > 0 ||
        state.timerWaits.length > 0 ||
        state.effectWaits.length > 0);
    case ControlStateKind.Completed:
      return true;
    default:
      return assertNever(state.control);
  }
}

// Semantic policy, not semantic truth. This selector advances the lowest
// canonical operation ID, while Lean's `closeSupported` advances the head of the
// program-ordered enabled list. In the one admitted multiple-enabled state (the
// disjoint two-User-Task pair) the two choices coincide only because
// `isWellFormedSemanticProcessProgram` requires `isSortedById(operations)` under
// this same `compareCanonicalStrings` order, making the sorted head and the
// program-order head the same operation. This selector also has no ambiguity
// signal, while Lean rejects every other multiple-enabled state as an unresolved
// semantic choice; admission currently keeps those states unreachable here.
function internalStep(
  program: SemanticProcessProgram,
  state: RuntimeState,
): RuntimeState | null {
  const enabled = enabledInternalOperations(program, state);
  return enabled[0]?.successor ?? null;
}

/**
 * The internal transition of one operation, including the consequences only the program determines.
 *
 * `program` is not decoration: a bounded scope's deadline is paired to its child scope through the
 * committed bounded-scope operation rather than through a runtime record, so the completing scope's
 * own operation cannot name the deadline it withdraws.
 */
export function applyInternalOperation(
  program: SemanticProcessProgram,
  operation: SemanticOperation,
  state: RuntimeState,
): RuntimeState | null {
  switch (operation.kind) {
    case SemanticOperationKind.Initiate: {
      const rootOwner = state.scopeOccurrences.find(
        ({ parent }) => parent === null,
      )?.id;
      return state.initiationPending && rootOwner !== undefined
        ? {
            ...state,
            initiationPending: false,
            controlTokens: addToken(
              state.controlTokens,
              operation.output,
              rootOwner,
            ),
          }
        : null;
    }
    case SemanticOperationKind.InitiateMessage:
      return applyMessageInitiation(operation, state);
    case SemanticOperationKind.EnterScope: {
      const owner = onlyTokenOwner(state, operation.input);
      return owner === undefined
        ? null
        : enterScope(operation, state, owner);
    }
    case SemanticOperationKind.EnterBoundedScope: {
      const boundedParent = onlyTokenOwner(state, operation.input);
      return boundedParent === undefined
        ? null
        : armBoundedScope(operation, state, boundedParent);
    }
    case SemanticOperationKind.InvokeProcess: {
      const caller = onlyTokenOwner(state, operation.input);
      return caller === undefined
        ? null
        : invokeCalledProcess(operation, state, caller);
    }
    case SemanticOperationKind.ReturnProcess:
      return returnCalledProcess(operation, state);
    case SemanticOperationKind.AwaitUserTask: {
      const taskOwner = onlyTokenOwner(state, operation.input);
      return taskOwner !== undefined
        ? createUserTaskWait(operation, state, taskOwner)
        : null;
    }
    case SemanticOperationKind.AwaitMessage: {
      const messageOwner = onlyTokenOwner(state, operation.input);
      return messageOwner !== undefined
        ? createMessageWait(operation, state, messageOwner)
        : null;
    }
    case SemanticOperationKind.AwaitTimer: {
      const timerOwner = onlyTokenOwner(state, operation.input);
      return timerOwner !== undefined
        ? createTimerWait(operation, state, timerOwner)
        : null;
    }
    case SemanticOperationKind.AwaitEventRace: {
      const raceOwner = onlyTokenOwner(state, operation.input);
      return raceOwner !== undefined
        ? armEventRace(operation, state, raceOwner)
        : null;
    }
    case SemanticOperationKind.AwaitBoundedUserTask: {
      const boundedOwner = onlyTokenOwner(state, operation.input);
      return boundedOwner !== undefined
        ? armBoundedUserTask(operation, state, boundedOwner)
        : null;
    }
    case SemanticOperationKind.AwaitMonitoredUserTask: {
      const monitoredOwner = onlyTokenOwner(state, operation.input);
      return monitoredOwner !== undefined
        ? armMonitoredUserTask(operation, state, monitoredOwner)
        : null;
    }
    case SemanticOperationKind.AwaitEffect: {
      const effectOwner = onlyTokenOwner(state, operation.input);
      return effectOwner !== undefined
        ? createEffectWait(operation, state, effectOwner)
        : null;
    }
    case SemanticOperationKind.Duplicate: {
      const duplicateOwner = onlyTokenOwner(state, operation.input);
      return duplicateOwner !== undefined
        ? duplicate(operation, state, duplicateOwner)
        : null;
    }
    case SemanticOperationKind.Synchronize: {
      const synchronizedOwner = commonTokenOwner(state, operation.inputs);
      return synchronizedOwner !== undefined
        ? synchronize(operation, state, synchronizedOwner)
        : null;
    }
    case SemanticOperationKind.MergeExclusive:
      return mergeExclusive(operation, state);
    case SemanticOperationKind.Choose: {
      const choiceOwner = onlyTokenOwner(state, operation.input);
      return choiceOwner !== undefined
        ? choose(operation, state, choiceOwner)
        : null;
    }
    case SemanticOperationKind.SelectMany: {
      const selectionOwner = onlyTokenOwner(state, operation.input);
      return selectionOwner !== undefined
        ? selectMany(operation, state, selectionOwner)
        : null;
    }
    case SemanticOperationKind.SynchronizeSelected:
      return synchronizeSelected(operation, state);
    case SemanticOperationKind.ThrowError: {
      const throwingOwner = onlyTokenOwner(state, operation.input);
      return throwingOwner !== undefined
        ? throwError(operation, state, throwingOwner)
        : null;
    }
    case SemanticOperationKind.ReachNoneEnd: {
      const endOwner = onlyTokenOwner(state, operation.input);
      return endOwner !== undefined
        ? reachNoneEnd(operation, state, endOwner)
        : null;
    }
    case SemanticOperationKind.CompleteScope:
      return completeScopeWithdrawingDeadline(program, operation, state);
    default:
      return assertNever(operation);
  }
}

function closeInternal(
  program: SemanticProcessProgram,
  state: RuntimeState,
  limit: number,
): ClosureResult {
  let current = state;
  for (let stepCount = 0; stepCount < limit; stepCount += 1) {
    const next = internalStep(program, current);
    if (next === null) {
      return { state: current, hitBound: false };
    }
    current = next;
  }
  return {
    state: current,
    hitBound: internalStep(program, current) !== null,
  };
}

export function applyStimulus(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
  closureLimit: number = semanticProcessClosureLimit,
): CommandResult {
  validateClosureLimit(closureLimit);

  const admission = admit(program, state, stimulus);
  switch (admission.outcome) {
    case CommandOutcome.Committed: {
      const closure = closeInternal(
        program,
        admission.state,
        closureLimit,
      );
      return {
        outcome: CommandOutcome.Committed,
        state: closure.state,
        internalStepBoundExceeded: closure.hitBound,
      };
    }
    case CommandOutcome.Rejected:
      return {
        outcome: CommandOutcome.Rejected,
        state: admission.state,
        internalStepBoundExceeded: false,
      };
    default:
      return assertNever(admission.outcome);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic variant: ${JSON.stringify(value)}`);
}
