import {
  CommandOutcome,
  EffectExecutionResultKind,
  StimulusKind,
} from "./contract.js";
import type {
  Stimulus,
} from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import {
  SemanticOperationKind,
} from "./semantic-process-contract.js";
import type {
  SemanticOperation,
  SemanticProcessProgram,
} from "./semantic-process-contract.js";
import {
  calledProcessAssociationsAreValid,
  invokeCalledProcess,
  returnCalledProcess,
} from "./semantic-process-call-runtime.js";
import {
  completeActivityVariableScope,
  mergeProcessVariableBindings,
} from "./semantic-process-data.js";
import {
  choose,
  duplicate,
  reachNoneEnd,
  synchronize,
} from "./semantic-process-control-flow-runtime.js";
import {
  armBoundedScope,
  completeScopeWithdrawingDeadline,
  interruptBoundedScope,
  isBoundedScopeDeadlineDefinition,
} from "./semantic-process-bounded-scope-runtime.js";
import {
  armBoundedUserTask,
  completeBoundedUserTask,
  interruptBoundedUserTask,
  isBoundaryTimerDefinition,
  isBoundedTaskDefinition,
} from "./semantic-process-bounded-task-runtime.js";
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
  isEventRaceMessageDefinition,
  isEventRaceTimerDefinition,
  winEventRaceWithMessage,
  winEventRaceWithTimer,
} from "./semantic-process-event-race-runtime.js";
import {
  createMessageWait,
  deliverMessage,
} from "./semantic-process-message.js";
import {
  commonTokenOwner,
  enterScope,
  onlyTokenOwner,
} from "./semantic-process-scope-runtime.js";
import {
  addToken,
  ControlStateKind,
  removeToken,
  sameOccurrence,
  setActivationCount,
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
import { SemanticProfileId } from "./semantic-process-profile.js";
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

type SemanticCommandOutcome =
  | CommandOutcome.Committed
  | CommandOutcome.Rejected;

export type CommandResult = DeepReadonly<{
  outcome: SemanticCommandOutcome;
  state: RuntimeState;
  internalStepBoundExceeded: boolean;
}>;

type CommandAdmission = DeepReadonly<{
  outcome: SemanticCommandOutcome;
  state: RuntimeState;
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

function admit(
  program: SemanticProcessProgram,
  state: RuntimeState,
  stimulus: Stimulus,
): CommandAdmission {
  switch (stimulus.kind) {
    case StimulusKind.StartProcess: {
      const entryScopes = program.definitionScopes.filter(
        ({ parentScopeId, originElementId }) =>
          parentScopeId === null && originElementId === program.processId,
      );
      const rootScope = entryScopes[0];
      if (
        state.control.kind === ControlStateKind.NotStarted &&
        stimulus.processId === program.processId &&
        entryScopes.length === 1 &&
        rootScope !== undefined &&
        (!isCallActivityProgram(program) || stimulus.initialVariables.length === 0)
      ) {
        const rootOccurrence = {
          processInstanceId: stimulus.instanceId,
          definitionScopeId: rootScope.id,
          activation: 1,
        };
        return {
          outcome: CommandOutcome.Committed,
          state: {
            ...state,
            control: {
              kind: ControlStateKind.Running,
              instanceId: stimulus.instanceId,
            },
            initiationPending: true,
            scopeOccurrences: [{ id: rootOccurrence, parent: null }],
            scopeActivations: setActivationCount(
              state.scopeActivations,
              rootScope.id,
              1,
            ),
            variables: {
              ...state.variables,
              process: { bindings: stimulus.initialVariables },
            },
          },
        };
      }
      return { outcome: CommandOutcome.Rejected, state };
    }
    case StimulusKind.CompleteUserTaskInstance: {
      if (isBoundedTaskDefinition(program, stimulus.taskId)) {
        const next = completeBoundedUserTask(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      const wait = state.userTaskWaits.find((candidate) =>
        sameOccurrence(candidate.id, stimulus.taskId)
      );
      if (
        state.control.kind !== ControlStateKind.Running ||
        wait === undefined ||
        (isCallActivityProgram(program) && stimulus.submittedValues.length !== 0)
      ) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      return {
        outcome: CommandOutcome.Committed,
        state: {
          ...state,
          controlTokens: addToken(
            state.controlTokens,
            wait.output,
            wait.owner,
          ),
          userTaskWaits: state.userTaskWaits.filter(
            (candidate) => candidate !== wait,
          ),
          variables: {
            ...state.variables,
            process: {
              bindings: mergeProcessVariableBindings(
                state.variables.process.bindings,
                stimulus.submittedValues,
              ),
            },
          },
        },
      };
    }
    case StimulusKind.DeliverMessage: {
      const next = isEventRaceMessageDefinition(program, stimulus.subscriptionId)
        ? winEventRaceWithMessage(program, state, stimulus)
        : deliverMessage(program, state, stimulus);
      return next === null
        ? { outcome: CommandOutcome.Rejected, state }
        : { outcome: CommandOutcome.Committed, state: next };
    }
    case StimulusKind.FireTimer: {
      if (isEventRaceTimerDefinition(program, stimulus.timerId)) {
        const next = winEventRaceWithTimer(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      if (isBoundaryTimerDefinition(program, stimulus.timerId)) {
        const next = interruptBoundedUserTask(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      if (isBoundedScopeDeadlineDefinition(program, stimulus.timerId)) {
        const next = interruptBoundedScope(program, state, stimulus);
        return next === null
          ? { outcome: CommandOutcome.Rejected, state }
          : { outcome: CommandOutcome.Committed, state: next };
      }
      const wait = state.timerWaits.find((candidate) =>
        sameOccurrence(candidate.id, stimulus.timerId)
      );
      if (
        state.control.kind !== ControlStateKind.Running ||
        wait === undefined ||
        stimulus.logicalTimeMs !== wait.deadlineMs
      ) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      return {
        outcome: CommandOutcome.Committed,
        state: {
          ...state,
          controlTokens: addToken(
            state.controlTokens,
            wait.output,
            wait.owner,
          ),
          timerWaits: state.timerWaits.filter(
            (candidate) => candidate !== wait,
          ),
          logicalTimeMs: wait.deadlineMs,
        },
      };
    }
    case StimulusKind.CompleteEffect: {
      const wait = state.effectWaits.find((candidate) =>
        sameOccurrence(candidate.id, stimulus.effectId)
      );
      if (
        state.control.kind !== ControlStateKind.Running ||
        wait === undefined
      ) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      const route =
        stimulus.result.kind === EffectExecutionResultKind.BpmnError
          ? wait.bpmnErrorRoute
          : null;
      if (
        stimulus.result.kind === EffectExecutionResultKind.BpmnError &&
        (route === null || route.code !== stimulus.result.code)
      ) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      const variables = completeActivityVariableScope(
        state.variables,
        wait.id,
        wait.outputMappings,
        stimulus.result.localPatch,
        stimulus.result.kind === EffectExecutionResultKind.BpmnError,
      );
      if (variables === null) {
        return { outcome: CommandOutcome.Rejected, state };
      }
      return {
        outcome: CommandOutcome.Committed,
        state: {
          ...state,
          controlTokens: addToken(
            state.controlTokens,
            route?.output ?? wait.output,
            wait.owner,
          ),
          effectWaits: state.effectWaits.filter(
            (candidate) => candidate !== wait,
          ),
          variables,
        },
      };
    }
    default:
      return assertNever(stimulus);
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

function isCallActivityProgram(program: SemanticProcessProgram): boolean {
  return program.identity.semanticProfile ===
    SemanticProfileId.CalledProcessCallActivity;
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic variant: ${JSON.stringify(value)}`);
}
