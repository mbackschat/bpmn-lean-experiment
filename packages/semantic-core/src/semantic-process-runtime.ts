import { CommandOutcome } from "./contract.js";
import type { Stimulus } from "./contract.js";
import type { DeepReadonly } from "./deep-readonly.js";
import { admit } from "./semantic-command-admission.js";
import type { SemanticCommandOutcome } from "./semantic-command-admission.js";
import { internalOperationFrontierIsPairwiseIndependent } from "./internal-transition-footprint.js";
import { applyInternalInitiationPatch } from "./internal-transition-initiation-patch.js";
import { SemanticOperationKind } from "./semantic-process-contract.js";
import type { SemanticOperation, SemanticProcessProgram } from "./semantic-process-contract.js";
import { closeRefusableInternalOperations } from "./semantic-process-closure.js";
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
import {
  mergeExclusive,
  selectUniqueExclusiveMergeInput,
} from "./semantic-process-cyclic-control-flow-runtime.js";
import {
  armBoundedScope,
  completeScopeWithdrawingDeadline,
} from "./semantic-process-bounded-scope-runtime.js";
import { armBoundedUserTask } from "./semantic-process-bounded-task-runtime.js";
import {
  armMessageBoundedUserTask,
} from "./semantic-process-message-bounded-task-runtime.js";
import {
  armDataInputUserTask,
} from "./semantic-process-activity-data-input-runtime.js";
import {
  armDataOutputUserTask,
} from "./semantic-process-activity-data-output-runtime.js";
import { armMonitoredUserTask } from "./semantic-process-monitored-task-runtime.js";
import {
  throwError,
} from "./semantic-process-error-runtime.js";
import {
  selectMany,
  selectSynchronizeSelected,
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
  enterSequentialMultiInstanceUserTask,
} from "./semantic-process-sequential-multi-instance-runtime.js";
import {
  enterParallelMultiInstanceUserTask,
} from "./semantic-process-parallel-multi-instance-runtime.js";
import {
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
import {
  type CompensationParentContextRefusal,
} from "./compensation-event-sub-process-snapshot-contract.js";
import {
  purgeCompensationParentContextForRoot,
} from "./compensation-event-sub-process-snapshot.js";
import {
  CompensationSnapshotPreparationKind,
  prepareCompensationSnapshotOperation,
} from "./internal-transition-attempt.js";

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

export type AppliedInternalOperationStep = DeepReadonly<{
  operation: SemanticOperation;
  owner: ScopeOccurrenceId | null;
  successor: RuntimeState;
}>;

enum InternalOperationAttemptKind {
  Disabled = "disabled",
  Applied = "applied",
  Refused = "refused",
}

type InternalOperationAttempt = Readonly<
  | { kind: InternalOperationAttemptKind.Disabled; operation: SemanticOperation }
  | { kind: InternalOperationAttemptKind.Applied; step: AppliedInternalOperationStep }
  | {
      kind: InternalOperationAttemptKind.Refused;
      operation: SemanticOperation;
      detail: CompensationParentContextRefusal;
    }
>;

export type StimulusEvaluationResult = DeepReadonly<{
  result: CommandResult;
  ambiguousInternalChoice: boolean;
  admittedState: RuntimeState | null;
  selectedInternalSteps: AppliedInternalOperationStep[];
  selectedInternalBatches: AppliedInternalOperationStep[][];
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
  return internalOperationFrontier(program, state).steps;
}

function internalOperationFrontier(
  program: SemanticProcessProgram,
  state: RuntimeState,
): Readonly<{
  steps: ReadonlyArray<AppliedInternalOperationStep>;
  refusal: CompensationParentContextRefusal | null;
}> {
  const attempts = program.operations
    .map((operation) => attemptInternalOperationStep(program, operation, state))
    .sort((left, right) =>
      compareCanonicalStrings(attemptOperationId(left), attemptOperationId(right))
    );
  const refusal = attempts.find(
    (attempt) => attempt.kind === InternalOperationAttemptKind.Refused,
  );
  return {
    steps: attempts.flatMap((attempt) =>
      attempt.kind === InternalOperationAttemptKind.Applied ? [attempt.step] : []
    ),
    refusal: refusal?.kind === InternalOperationAttemptKind.Refused
      ? refusal.detail
      : null,
  };
}

function attemptOperationId(attempt: InternalOperationAttempt): string {
  switch (attempt.kind) {
    case InternalOperationAttemptKind.Disabled:
      return attempt.operation.id;
    case InternalOperationAttemptKind.Applied:
      return attempt.step.operation.id;
    case InternalOperationAttemptKind.Refused:
      return attempt.operation.id;
  }
}

export function enabledInternalOperationCount(
  program: SemanticProcessProgram,
  state: RuntimeState,
): number {
  return enabledInternalOperations(program, state).length;
}

/**
 * Classifies a state already known to be internally stable as structurally sound.
 *
 * Soundness is not liveness. A Running state whose only required data source is unavailable holds a
 * control token, arms no wait, and admits no ingress that could ever move it, yet it is a committed
 * semantic state that must stay observable and publishable; refusing it would make a stalled
 * instance indistinguishable from one that never committed. Ask [isStableStateResumable] instead
 * wherever the decision is whether the state can still be carried forward.
 */
export function isStableStateSound(state: RuntimeState): boolean {
  switch (state.control.kind) {
    case ControlStateKind.NotStarted:
      return false;
    case ControlStateKind.Running:
      return eventRaceAssociationsAreValid(state) &&
        calledProcessAssociationsAreValid(state) &&
        effectIncidentAssociationsAreValid(state);
    case ControlStateKind.Completed:
    case ControlStateKind.Cancelled:
      return true;
    default:
      return assertNever(state.control);
  }
}

/**
 * Whether a sound stable state still exposes a possible future ingress.
 *
 * A running state is resumable only when one semantic wait exposes a possible
 * future ingress. Hidden tokens alone are not evidence of progress.
 */
export function isStableStateResumable(state: RuntimeState): boolean {
  if (!isStableStateSound(state)) {
    return false;
  }
  switch (state.control.kind) {
    case ControlStateKind.NotStarted:
      return false;
    case ControlStateKind.Running:
      return state.userTaskWaits.length > 0 ||
        state.messageWaits.length > 0 ||
        state.timerWaits.length > 0 ||
        state.effectWaits.length > 0 ||
        state.effectIncidents.length > 0;
    case ControlStateKind.Completed:
    case ControlStateKind.Cancelled:
      return true;
    default:
      return assertNever(state.control);
  }
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
  const attempt = attemptInternalOperationStep(program, operation, state);
  return attempt.kind === InternalOperationAttemptKind.Applied
    ? attempt.step
    : null;
}

function attemptInternalOperationStep(
  program: SemanticProcessProgram,
  operation: SemanticOperation,
  state: RuntimeState,
): InternalOperationAttempt {
  const preparation = prepareCompensationSnapshotOperation(
    program,
    operation,
    state,
  );
  if (preparation.kind === CompensationSnapshotPreparationKind.Refused) {
    return {
      kind: InternalOperationAttemptKind.Refused,
      operation,
      detail: preparation.detail,
    };
  }
  let selectedOwner: ScopeOccurrenceId | null = null;
  const successor = applyInternalOperationState(
    program,
    operation,
    preparation.state,
    (owner) => {
      selectedOwner = owner;
    },
  );
  if (successor === null) {
    return { kind: InternalOperationAttemptKind.Disabled, operation };
  }
  const finalized = preparation.rootCompletion === null
    ? successor
    : purgeCompensationParentContextForRoot(
      successor,
      preparation.rootCompletion.root,
      preparation.rootCompletion.disposition,
    );
  return {
    kind: InternalOperationAttemptKind.Applied,
    step: {
      operation,
      owner: operationOwnerMatchesProgram(program, operation, selectedOwner)
        ? selectedOwner
        : null,
      successor: finalized,
    },
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
          ? applyInternalInitiationPatch(state, {
              owner,
              outputs: [operation.output],
            })
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
    case SemanticOperationKind.AwaitDataInputUserTask: {
      const dataInputOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        dataInputOwner,
        (selected) => armDataInputUserTask(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.AwaitDataOutputUserTask: {
      const dataOutputOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        dataOutputOwner,
        (selected) => armDataOutputUserTask(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.AwaitSequentialMultiInstanceUserTask: {
      const multiInstanceOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        multiInstanceOwner,
        (owner) => enterSequentialMultiInstanceUserTask(program, operation, state, owner),
        captureOwner,
      );
    }
    case SemanticOperationKind.AwaitParallelMultiInstanceUserTask: {
      const multiInstanceOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        multiInstanceOwner,
        (owner) => enterParallelMultiInstanceUserTask(program, operation, state, owner),
        captureOwner,
      );
    }
    case SemanticOperationKind.CompleteParallelMultiInstanceUserTask:
      return null;
    case SemanticOperationKind.AwaitMessage: {
      const messageOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        messageOwner,
        (selected) => createMessageWait(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.AwaitPayloadMessage: {
      const messageOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        messageOwner,
        (selected) => createMessageWait(operation, state, selected),
        captureOwner,
      );
    }
    case SemanticOperationKind.AwaitCorrelatedPayloadMessage: {
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
    case SemanticOperationKind.AwaitMessageBoundedUserTask: {
      const boundedOwner = onlyTokenOwner(state, operation.input);
      return applyOwnedOperation(
        boundedOwner,
        (selected) => armMessageBoundedUserTask(operation, state, selected),
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
      const owner = selectUniqueExclusiveMergeInput(operation, state)
        ?.alternative.owner;
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
      const owner = selectSynchronizeSelected(operation, state)?.owner;
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
    case SemanticOperationKind.TriggerCompensation:
      return null;
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
          ambiguousInternalChoice: false,
          admittedState: admission.state,
          selectedInternalSteps: [],
          selectedInternalBatches: [],
        };
      }
      const closure = closeRefusableInternalOperations(
        admission.state,
        closureLimit,
        (current) => internalOperationFrontier(program, current),
        (current, enabled) =>
          internalOperationFrontierIsPairwiseIndependent(
            program,
            current,
            enabled,
          ),
      );
      if (closure.refusal !== null) {
        return {
          result: {
            outcome: CommandOutcome.Rejected,
            state,
            internalStepBoundExceeded: false,
          },
          ambiguousInternalChoice: false,
          admittedState: null,
          selectedInternalSteps: [],
          selectedInternalBatches: [],
        };
      }
      return {
        result: {
          outcome: CommandOutcome.Committed,
          state: closure.state,
          internalStepBoundExceeded: closure.hitBound,
        },
        ambiguousInternalChoice: closure.ambiguousInternalChoice,
        admittedState: admission.state,
        selectedInternalSteps: closure.steps,
        selectedInternalBatches: closure.batches,
      };
    }
    case CommandOutcome.Rejected:
      return {
        result: {
          outcome: CommandOutcome.Rejected,
          state: admission.state,
          internalStepBoundExceeded: false,
        },
        ambiguousInternalChoice: false,
        admittedState: null,
        selectedInternalSteps: [],
        selectedInternalBatches: [],
      };
    default:
      return assertNever(admission.outcome);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported semantic variant: ${JSON.stringify(value)}`);
}
