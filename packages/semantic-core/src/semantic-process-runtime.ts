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
import {
  effectIncidentAssociationsAreValid,
} from "./semantic-process-incident-validation.js";
import { createMessageWait } from "./semantic-process-message.js";
import { applyMessageInitiation } from "./semantic-process-message-start.js";
import { applyTimerInitiation } from "./semantic-process-timer-start.js";
import { terminateScope } from "./semantic-process-termination-runtime.js";
import {
  commonTokenOwner,
  enterScope,
  onlyTokenOwner,
} from "./semantic-process-scope-runtime.js";
import {
  addToken,
  ControlStateKind,
  ownedTokenMultiplicity,
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
  SemanticEffectIncident,
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
  steps: AppliedInternalOperationStep[];
}>;

export type AppliedInternalOperationStep = DeepReadonly<{
  operation: SemanticOperation;
  owner: ScopeOccurrenceId | null;
  successor: RuntimeState;
}>;

export type StimulusEvaluationResult = DeepReadonly<{
  result: CommandResult;
  admittedState: RuntimeState | null;
  selectedInternalSteps: AppliedInternalOperationStep[];
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
): ReadonlyArray<AppliedInternalOperationStep> {
  return program.operations
    .map((operation) => applyInternalOperationStep(program, operation, state))
    .filter(
      (
        candidate,
      ): candidate is AppliedInternalOperationStep => candidate !== null,
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
        effectIncidentAssociationsAreValid(state) &&
        (state.userTaskWaits.length > 0 ||
        state.messageWaits.length > 0 ||
        state.timerWaits.length > 0 ||
        state.effectWaits.length > 0 ||
        state.effectIncidents.length > 0);
    case ControlStateKind.Completed:
    case ControlStateKind.Cancelled:
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
): AppliedInternalOperationStep | null {
  const enabled = enabledInternalOperations(program, state);
  return enabled[0] ?? null;
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
  return applyInternalOperationStep(program, operation, state)?.successor ?? null;
}

/** Evaluates one exact Program operation and retains its selected runtime owner. */
export function applyInternalOperationStep(
  program: SemanticProcessProgram,
  operation: SemanticOperation,
  state: RuntimeState,
): AppliedInternalOperationStep | null {
  let selectedOwner: ScopeOccurrenceId | null = null;
  const successor = applyInternalOperationState(
    program,
    operation,
    state,
    (owner) => {
      selectedOwner = owner;
    },
  );
  return successor === null
    ? null
    : {
        operation,
        owner: operationOwnerMatchesProgram(program, operation, selectedOwner)
          ? selectedOwner
          : null,
        successor,
      };
}

function applyInternalOperationState(
  program: SemanticProcessProgram,
  operation: SemanticOperation,
  state: RuntimeState,
  captureOwner: (owner: ScopeOccurrenceId) => void,
): RuntimeState | null {
  switch (operation.kind) {
    case SemanticOperationKind.Initiate: {
      const rootOwner = state.scopeOccurrences.find(
        ({ parent }) => parent === null,
      )?.id;
      return applyOwnedOperation(
        rootOwner,
        (owner) => state.initiationPending
          ? {
              ...state,
              initiationPending: false,
              controlTokens: addToken(
                state.controlTokens,
                operation.output,
                owner,
              ),
            }
          : null,
        captureOwner,
      );
    }
    case SemanticOperationKind.InitiateMessage: {
      const owner = state.scopeOccurrences.find(({ parent }) => parent === null)?.id;
      return applyOwnedOperation(
        owner,
        () => applyMessageInitiation(operation, state),
        captureOwner,
      );
    }
    case SemanticOperationKind.InitiateTimer: {
      const owner = state.scopeOccurrences.find(({ parent }) => parent === null)?.id;
      return applyOwnedOperation(
        owner,
        () => applyTimerInitiation(operation, state),
        captureOwner,
      );
    }
    case SemanticOperationKind.EnterScope: {
      const owner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        owner,
        (selected) => enterScope(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.EnterBoundedScope: {
      const boundedParent = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        boundedParent,
        (selected) => armBoundedScope(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.InvokeProcess: {
      const caller = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        caller,
        (selected) => invokeCalledProcess(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.ReturnProcess: {
      const owner = returnProcessOwner(operation, state);
      return applyOwnedOperation(
        owner,
        () => returnCalledProcess(operation, state),
        captureOwner,
      );
    }
    case SemanticOperationKind.AwaitUserTask: {
      const taskOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        taskOwner,
        (selected) => createUserTaskWait(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.AwaitMessage: {
      const messageOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        messageOwner,
        (selected) => createMessageWait(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.AwaitTimer: {
      const timerOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        timerOwner,
        (selected) => createTimerWait(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.AwaitEventRace: {
      const raceOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        raceOwner,
        (selected) => armEventRace(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.AwaitBoundedUserTask: {
      const boundedOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        boundedOwner,
        (selected) => armBoundedUserTask(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.AwaitMonitoredUserTask: {
      const monitoredOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        monitoredOwner,
        (selected) => armMonitoredUserTask(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.AwaitEffect: {
      const effectOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        effectOwner,
        (selected) => createEffectWait(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.Duplicate: {
      const duplicateOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        duplicateOwner,
        (selected) => duplicate(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.Synchronize: {
      const synchronizedOwner = commonTokenOwner(state, operation.inputs);
      return applyOwnedOperation(
        synchronizedOwner,
        (selected) => synchronize(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.MergeExclusive: {
      const owner = mergeExclusiveOwner(operation.inputs, state);
      return applyOwnedOperation(
        owner,
        () => mergeExclusive(operation, state),
        captureOwner,
      );
    }
    case SemanticOperationKind.Choose: {
      const choiceOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        choiceOwner,
        (selected) => choose(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.SelectMany: {
      const selectionOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        selectionOwner,
        (selected) => selectMany(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.SynchronizeSelected: {
      const owner = synchronizeSelectedOwner(
        operation.selectionKey,
        state,
      );
      return applyOwnedOperation(
        owner,
        () => synchronizeSelected(operation, state),
        captureOwner,
      );
    }
    case SemanticOperationKind.ThrowError: {
      const throwingOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        throwingOwner,
        (selected) => throwError(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.TerminateScope: {
      const terminatedOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        terminatedOwner,
        (selected) => terminateScope(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.ReachNoneEnd: {
      const endOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        endOwner,
        (selected) => reachNoneEnd(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.CompleteScope: {
      const owner = completeScopeOwner(operation.scopeId, state);
      return applyOwnedOperation(
        owner,
        () => completeScopeWithdrawingDeadline(program, operation, state),
        captureOwner,
      );
    }
    default:
      return assertNever(operation);
  }
}

function applyOwnedOperation(
  owner: ScopeOccurrenceId | null | undefined,
  apply: (owner: ScopeOccurrenceId) => RuntimeState | null,
  captureOwner: (owner: ScopeOccurrenceId) => void,
): RuntimeState | null {
  if (owner === null || owner === undefined) {
    return null;
  }
  const successor = apply(owner);
  if (successor === null) {
    return null;
  }
  captureOwner(owner);
  return successor;
}

function returnProcessOwner(
  operation: Extract<
    SemanticOperation,
    { kind: SemanticOperationKind.ReturnProcess }
  >,
  state: RuntimeState,
): ScopeOccurrenceId | undefined {
  const records = state.calledProcessOccurrences.filter((record) =>
    record.returnOperationId === operation.id &&
    record.id.elementId === operation.origin.elementId
  );
  return records.length === 1 ? records[0]?.calledRoot : undefined;
}

function mergeExclusiveOwner(
  inputs: ReadonlyArray<string>,
  state: RuntimeState,
): ScopeOccurrenceId | undefined {
  const offered = state.controlTokens.filter((token) =>
    inputs.includes(token.placeId) && token.multiplicity > 0
  );
  return offered.reduce((total, token) => total + token.multiplicity, 0) === 1
    ? offered[0]?.owner
    : undefined;
}

function synchronizeSelectedOwner(
  selectionKey: string,
  state: RuntimeState,
): ScopeOccurrenceId | undefined {
  const ready = state.selectedBranchSets.filter((record) =>
    record.selectionKey === selectionKey &&
    record.expectedInputs.every((input) =>
      ownedTokenMultiplicity(state.controlTokens, input, record.owner) > 0
    )
  );
  return ready.length === 1 ? ready[0]?.owner : undefined;
}

function completeScopeOwner(
  scopeId: string,
  state: RuntimeState,
): ScopeOccurrenceId | undefined {
  const occurrences = state.scopeOccurrences.filter(
    ({ id }) => id.definitionScopeId === scopeId,
  );
  return occurrences.length === 1 ? occurrences[0]?.id : undefined;
}

function operationOwnerMatchesProgram(
  program: SemanticProcessProgram,
  operation: SemanticOperation,
  owner: ScopeOccurrenceId | null,
): owner is ScopeOccurrenceId {
  const bindings = program.operationScopes.filter(
    ({ operationId }) => operationId === operation.id,
  );
  return owner !== null &&
    bindings.length === 1 &&
    bindings[0]?.scopeId === owner.definitionScopeId;
}

function closeInternal(
  program: SemanticProcessProgram,
  state: RuntimeState,
  limit: number,
): ClosureResult {
  let current = state;
  const steps: AppliedInternalOperationStep[] = [];
  for (let stepCount = 0; stepCount < limit; stepCount += 1) {
    const next = internalStep(program, current);
    if (next === null) {
      return { state: current, hitBound: false, steps };
    }
    steps.push(next);
    current = next.successor;
  }
  return {
    state: current,
    hitBound: internalStep(program, current) !== null,
    steps,
  };
}

export function applyStimulus(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
  closureLimit: number = semanticProcessClosureLimit,
): CommandResult {
  return evaluateStimulusWithSelectedSteps(
    program,
    state,
    stimulus,
    closureLimit,
  ).result;
}

/**
 * Evaluates the command and closure once while retaining the exact selected
 * internal steps for additive observation. The states remain evaluator-private
 * input to the public trace projector.
 */
export function evaluateStimulusWithSelectedSteps(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
  closureLimit: number = semanticProcessClosureLimit,
): StimulusEvaluationResult {
  validateClosureLimit(closureLimit);

  const admission = admit(program, state, stimulus);
  switch (admission.outcome) {
    case CommandOutcome.Committed: {
      if (admission.state.control.kind === ControlStateKind.Cancelled) {
        return {
          result: {
            outcome: CommandOutcome.Committed,
            state: admission.state,
            internalStepBoundExceeded: false,
          },
          admittedState: admission.state,
          selectedInternalSteps: [],
        };
      }
      const closure = closeInternal(
        program,
        admission.state,
        closureLimit,
      );
      return {
        result: {
          outcome: CommandOutcome.Committed,
          state: closure.state,
          internalStepBoundExceeded: closure.hitBound,
        },
        admittedState: admission.state,
        selectedInternalSteps: closure.steps,
      };
    }
    case CommandOutcome.Rejected:
      return {
        result: {
          outcome: CommandOutcome.Rejected,
          state: admission.state,
          internalStepBoundExceeded: false,
        },
        admittedState: null,
        selectedInternalSteps: [],
      };
    default:
      return assertNever(admission.outcome);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic variant: ${JSON.stringify(value)}`);
}
