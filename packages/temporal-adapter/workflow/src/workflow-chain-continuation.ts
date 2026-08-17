import {
  StimulusKind,
  isWellFormedSemanticProcessProgram,
  stimulusCommandId,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  CommandOutcome,
  ProcessStartStimulus,
  RuntimeState,
  SemanticProcessProgram,
  Stimulus,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  defineQuery,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";
import {
  BpmnWorkflowHostInputKind,
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  bpmnWorkflowChainCommandRecoveryQueryName,
  bpmnWorkflowContinuationV1,
  bpmnWorkflowRolloverInProgressFailureType,
  canonicalWorkflowChainJson,
  requireBpmnWorkflowContinuationPublicationV1,
  requireBpmnWorkflowContinuationStateV1,
  requireBpmnWorkflowHostInputV1,
  requireWorkflowChainInitialArgumentBudgets,
  workflowContinuationBudgetViolation,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnWorkflowContinuationHostInputV1,
  BpmnWorkflowContinuationPublicationV1,
  BpmnWorkflowContinuationRecoveryV1,
  BpmnWorkflowContinuationStateV1,
  BpmnWorkflowHostInputV1,
  MessageDeliveryRecord,
  TerminalProcessReceipt,
  WorkflowChainCommandRecoveryRequest,
  WorkflowChainCommandRecoveryResponse,
} from "@bpmn-lean/temporal-protocol";

import type {
  CommandPublicationState,
} from "./command-publication-integration.js";
import {
  WorkflowCommandRecoveryLedger,
  WorkflowCommandRecoveryLookupKind,
} from "./workflow-command-recovery.js";

const continuationInvalidFailureType = "BpmnWorkflowContinuationInvalid";

export const bpmnWorkflowChainCommandRecoveryQuery = defineQuery<
  WorkflowChainCommandRecoveryResponse,
  [request: WorkflowChainCommandRecoveryRequest]
>(bpmnWorkflowChainCommandRecoveryQueryName);

export type WorkflowChainRuntime = {
  readonly eventHistoryEventLimit: number;
  readonly runOrdinal: number;
  readonly firstExecutionRunId: string;
  readonly recovery: WorkflowCommandRecoveryLedger;
};

export enum WorkflowChainFenceState {
  Active = "active",
  Rollover = "rollover",
  Terminal = "terminal",
}

export type WorkflowChainRestoredState = Readonly<{
  state: RuntimeState;
  publication: CommandPublicationState;
  messageDeliveryRecords: MessageDeliveryRecord[];
}>;

export type WorkflowChainSuccessorArguments = readonly [
  ProcessStartStimulus,
  SemanticProcessProgram,
  BpmnWorkflowContinuationHostInputV1,
  BpmnWorkflowContinuationStateV1,
  BpmnWorkflowContinuationRecoveryV1,
  BpmnWorkflowContinuationPublicationV1,
];

export function initializeWorkflowChain(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
  hostInput: unknown,
  carriedState: unknown,
  carriedRecovery: unknown,
  carriedPublication: unknown,
): Readonly<{
  runtime: WorkflowChainRuntime;
  restored: WorkflowChainRestoredState | null;
}> {
  requireExecutionIdentity(start, program);
  const input = requireHostInput(hostInput);
  switch (input.kind) {
    case BpmnWorkflowHostInputKind.Initial:
      if (
        carriedState !== undefined ||
        carriedRecovery !== undefined ||
        carriedPublication !== undefined
      ) {
        throw invalidContinuation("Initial host input carried successor state");
      }
      requireWorkflowChainInitialArgumentBudgets(start, program);
      return {
        runtime: {
          eventHistoryEventLimit: input.eventHistoryEventLimit,
          runOrdinal: 1,
          firstExecutionRunId: workflowInfo().firstExecutionRunId,
          recovery: new WorkflowCommandRecoveryLedger(),
        },
        restored: null,
      };
    case BpmnWorkflowHostInputKind.Continuation: {
      const validated = validateContinuationArguments(
        start,
        program,
        input,
        carriedState,
        carriedRecovery,
        carriedPublication,
        workflowInfo().firstExecutionRunId,
      );
      return {
        runtime: {
          eventHistoryEventLimit: input.eventHistoryEventLimit,
          runOrdinal: input.runOrdinal,
          firstExecutionRunId: input.firstExecutionRunId,
          recovery: new WorkflowCommandRecoveryLedger(validated.recovery),
        },
        restored: {
          state: validated.state,
          publication: restoreCommandPublication(validated.publication),
          messageDeliveryRecords: [...input.completedMessageDeliveryRecords],
        },
      };
    }
    default:
      return assertNever(input);
  }
}

/** Pure incoming-continuation seam used by the Workflow and its fail-closed tests. */
export function validateIncomingWorkflowContinuation(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
  hostInput: unknown,
  carriedState: unknown,
  carriedRecovery: unknown,
  carriedPublication: unknown,
  firstExecutionRunId: string,
): Readonly<{
  state: RuntimeState;
  recovery: BpmnWorkflowContinuationRecoveryV1;
  publication: BpmnWorkflowContinuationPublicationV1;
}> {
  requireExecutionIdentity(start, program);
  const input = requireHostInput(hostInput);
  if (input.kind !== BpmnWorkflowHostInputKind.Continuation) {
    throw invalidContinuation("Incoming continuation requires continuation metadata");
  }
  return validateContinuationArguments(
    start,
    program,
    input,
    carriedState,
    carriedRecovery,
    carriedPublication,
    firstExecutionRunId,
  );
}

function validateContinuationArguments(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
  input: BpmnWorkflowContinuationHostInputV1,
  carriedState: unknown,
  carriedRecovery: unknown,
  carriedPublication: unknown,
  firstExecutionRunId: string,
) {
  const state = requireCarriedState(carriedState, program, start.instanceId);
  const recovery = requireCarriedRecovery(carriedRecovery);
  const publication = requireCarriedPublication(
    carriedPublication,
    program,
    state,
    start.instanceId,
  );
  requireContinuationIdentity(input, start, program, firstExecutionRunId);
  requireIncomingContinuationArgumentBudgets(
    start,
    program,
    input,
    state,
    recovery,
    publication,
  );
  return { state, recovery, publication };
}

export function workflowChainRolloverTriggered(
  runtime: WorkflowChainRuntime,
): boolean {
  const info = workflowInfo();
  return info.continueAsNewSuggested ||
    info.historyLength >= runtime.eventHistoryEventLimit ||
    info.historySize >= workflowChainProductionLimit(
      WorkflowChainBudgetKind.EventHistoryBytes,
    );
}

export function buildWorkflowChainSuccessor(
  runtime: WorkflowChainRuntime,
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
  state: RuntimeState,
  publication: CommandPublicationState,
  messageDeliveryRecords: ReadonlyArray<MessageDeliveryRecord>,
): WorkflowChainSuccessorArguments {
  if (messageDeliveryRecords.some(
    ({ stimulus }) =>
      stimulus.subscriptionId.processInstanceId !== start.instanceId,
  )) {
    throw invalidContinuation("Workflow continuation Message identity mismatch");
  }
  const runOrdinal = runtime.runOrdinal + 1;
  if (
    !Number.isSafeInteger(runOrdinal) ||
    runOrdinal > workflowChainProductionLimit(WorkflowChainBudgetKind.WorkflowChainRuns)
  ) {
    throw capacityFailure(
      WorkflowChainBudgetKind.WorkflowChainRuns,
      runOrdinal,
      workflowChainProductionLimit(WorkflowChainBudgetKind.WorkflowChainRuns),
      start.instanceId,
      publication.execution.headRevision,
      runtime.runOrdinal,
    );
  }
  const host: BpmnWorkflowContinuationHostInputV1 = {
    protocol: bpmnWorkflowContinuationV1,
    kind: BpmnWorkflowHostInputKind.Continuation,
    eventHistoryEventLimit: runtime.eventHistoryEventLimit,
    runOrdinal,
    firstExecutionRunId: runtime.firstExecutionRunId,
    definition: program.identity,
    processId: program.processId,
    processInstanceId: start.instanceId,
    startCommandId: start.commandId,
    completedMessageDeliveryRecords: messageDeliveryRecords.map((record) => ({
      ...record,
      stimulus: { ...record.stimulus },
    })),
  };
  const recovery: BpmnWorkflowContinuationRecoveryV1 = {
    entries: runtime.recovery.snapshot(),
  };
  const continuationPublication = snapshotCommandPublication(publication);
  requireSuccessorArgumentBudgets(
    start,
    program,
    host,
    state,
    recovery,
    continuationPublication,
    runtime,
  );
  return [start, program, host, state, recovery, continuationPublication];
}

export function registerWorkflowChainRecoveryQuery(
  processInstanceId: string,
  recovery: WorkflowCommandRecoveryLedger,
  terminalReceipt: () => TerminalProcessReceipt | null,
): void {
  setHandler(bpmnWorkflowChainCommandRecoveryQuery, (request) => {
    const terminal = terminalReceipt();
    return recovery.projectResponse(
      processInstanceId,
      request,
      terminal === null
        ? { kind: WorkflowChainCommandRecoveryResponseKind.UnknownWhileActive }
        : {
            kind: WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry,
            receipt: terminal,
          },
    );
  });
}

export function isExternallyRecoverableStimulus(stimulus: Stimulus): boolean {
  switch (stimulus.kind) {
    case StimulusKind.CompleteUserTaskInstance:
    case StimulusKind.DeliverMessage:
    case StimulusKind.RetryIncident:
    case StimulusKind.CancelIncidentProcess:
      return true;
    case StimulusKind.StartProcess:
    case StimulusKind.TriggerMessageStart:
    case StimulusKind.TriggerTimerStart:
    case StimulusKind.FireTimer:
    case StimulusKind.CompleteEffect:
    case StimulusKind.ReportEffectFailure:
      return false;
    default:
      return assertNever(stimulus);
  }
}

export function validateWorkflowChainUpdate(
  workflowChain: WorkflowChainRuntime | null,
  fenceState: WorkflowChainFenceState,
  stimulus: Stimulus,
): void {
  if (workflowChain === null) {
    return;
  }
  switch (fenceState) {
    case WorkflowChainFenceState.Terminal: {
      const recovered = workflowChain.recovery.lookup(stimulus);
      switch (recovered.kind) {
        case WorkflowCommandRecoveryLookupKind.Resolved:
          return;
        case WorkflowCommandRecoveryLookupKind.IdentityConflict:
          throw workflowCommandIdentityConflict(stimulus);
        case WorkflowCommandRecoveryLookupKind.Unseen:
          // Rejection precedes handler acceptance, so terminal receipt closure cannot wait on this
          // command and the caller's retry reaches the existing closed-Process lifecycle.
          throw ApplicationFailure.retryable(
            "Workflow terminal receipt is closing",
            "BpmnWorkflowTerminalReceiptPending",
          );
        default:
          return assertNever(recovered);
      }
    }
    case WorkflowChainFenceState.Rollover:
      throw ApplicationFailure.retryable(
        "Workflow rollover is in progress",
        bpmnWorkflowRolloverInProgressFailureType,
      );
    case WorkflowChainFenceState.Active:
      break;
    default:
      return assertNever(fenceState);
  }
  if (
    workflowChain.recovery.lookup(stimulus).kind ===
      WorkflowCommandRecoveryLookupKind.IdentityConflict
  ) {
    throw workflowCommandIdentityConflict(stimulus);
  }
}

export function recoveredWorkflowCommandOutcome(
  workflowChain: WorkflowChainRuntime | null,
  stimulus: Stimulus,
): CommandOutcome | undefined {
  if (workflowChain === null) {
    return undefined;
  }
  const recovered = workflowChain.recovery.lookup(stimulus);
  switch (recovered.kind) {
    case WorkflowCommandRecoveryLookupKind.Resolved:
      return recovered.outcome;
    case WorkflowCommandRecoveryLookupKind.IdentityConflict:
      throw workflowCommandIdentityConflict(stimulus);
    case WorkflowCommandRecoveryLookupKind.Unseen:
      return undefined;
    default:
      return assertNever(recovered);
  }
}

export function workflowCommandIdentityConflict(
  stimulus: Stimulus,
): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    `Command ID ${stimulusCommandId(stimulus)} was reused with different content`,
    "BpmnCommandIdentityConflict",
  );
}

function requireHostInput(value: unknown): BpmnWorkflowHostInputV1 {
  try {
    return requireBpmnWorkflowHostInputV1(value);
  } catch (error: unknown) {
    throw invalidContinuation("Malformed Workflow continuation metadata", error);
  }
}

function requireExecutionIdentity(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
): void {
  try {
    if (!isWellFormedSemanticProcessProgram(program) ||
      !supportsSemanticProcessExecution(start, program)) {
      throw new TypeError("Invalid execution input");
    }
  } catch (error: unknown) {
    throw invalidContinuation("Workflow continuation has invalid execution input", error);
  }
}

function requireContinuationIdentity(
  input: BpmnWorkflowContinuationHostInputV1,
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
  firstExecutionRunId: string,
): void {
  try {
    if (input.processId !== program.processId ||
      input.processInstanceId !== start.instanceId ||
      input.startCommandId !== start.commandId ||
      input.firstExecutionRunId !== firstExecutionRunId ||
      canonical(input.definition) !== canonical(program.identity) ||
      input.completedMessageDeliveryRecords.some(({ stimulus }) =>
        stimulus.subscriptionId.processInstanceId !== input.processInstanceId)) {
      throw new TypeError("Continuation identity mismatch");
    }
  } catch (error: unknown) {
    throw invalidContinuation("Workflow continuation identity mismatch", error);
  }
}

function requireCarriedState(
  value: unknown,
  program: SemanticProcessProgram,
  processInstanceId: string,
): RuntimeState {
  try {
    return requireBpmnWorkflowContinuationStateV1(
      value,
      program,
      processInstanceId,
    );
  } catch (error: unknown) {
    throw invalidContinuation("Invalid committed RuntimeState continuation", error);
  }
}

function requireCarriedRecovery(
  value: unknown,
): BpmnWorkflowContinuationRecoveryV1 {
  try {
    if (!isRecord(value) || !hasOnlyKeys(value, ["entries"]) ||
      !Array.isArray(value.entries)) {
      throw new TypeError("Malformed command-recovery continuation");
    }
    new WorkflowCommandRecoveryLedger({ entries: value.entries });
    return value as BpmnWorkflowContinuationRecoveryV1;
  } catch (error: unknown) {
    throw invalidContinuation("Invalid command-recovery continuation", error);
  }
}

function requireCarriedPublication(
  value: unknown,
  program: SemanticProcessProgram,
  state: RuntimeState,
  processInstanceId: string,
): BpmnWorkflowContinuationPublicationV1 {
  try {
    return requireBpmnWorkflowContinuationPublicationV1(
      value,
      program,
      state,
      processInstanceId,
    );
  } catch (error: unknown) {
    throw invalidContinuation("Invalid publication continuation", error);
  }
}

function snapshotCommandPublication(
  state: CommandPublicationState,
): BpmnWorkflowContinuationPublicationV1 {
  return {
    execution: {
      definition: state.execution.definition,
      processId: state.execution.processId,
      processInstanceId: state.execution.processInstanceId,
      headRevision: state.execution.headRevision,
      current: state.execution.current,
    },
    flowNodeOccurrences: {
      definition: state.flowNodeOccurrences.definition,
      processId: state.flowNodeOccurrences.processId,
      processInstanceId: state.flowNodeOccurrences.processInstanceId,
      headRevision: state.flowNodeOccurrences.headRevision,
      currentOpen: state.flowNodeOccurrences.currentOpen,
      retainedOpen: state.flowNodeOccurrences.retainedOpen,
      lastCommittedAtEpochMs: state.flowNodeOccurrences.lastCommittedAtEpochMs,
    },
  };
}

function restoreCommandPublication(
  value: BpmnWorkflowContinuationPublicationV1,
): CommandPublicationState {
  return {
    execution: { ...value.execution, batches: [] },
    flowNodeOccurrences: {
      ...value.flowNodeOccurrences,
      batches: [],
    },
    commandResults: [],
  };
}

function requireIncomingContinuationArgumentBudgets(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
  host: BpmnWorkflowContinuationHostInputV1,
  state: RuntimeState,
  recovery: BpmnWorkflowContinuationRecoveryV1,
  publication: BpmnWorkflowContinuationPublicationV1,
): void {
  try {
    const violation = workflowContinuationBudgetViolation(
      start, program, host, state, recovery, publication,
    );
    if (violation !== null) {
      throw new RangeError(
        `${violation.budget} exceeds ${violation.configuredBound}: ${violation.observedValue}`,
      );
    }
  } catch (error: unknown) {
    throw invalidContinuation("Workflow continuation exceeds its canonical byte budget", error);
  }
}

function requireSuccessorArgumentBudgets(
  start: ProcessStartStimulus,
  program: SemanticProcessProgram,
  host: BpmnWorkflowContinuationHostInputV1,
  state: RuntimeState,
  recovery: BpmnWorkflowContinuationRecoveryV1,
  publication: BpmnWorkflowContinuationPublicationV1,
  runtime: WorkflowChainRuntime,
): void {
  const violation = workflowContinuationBudgetViolation(
    start, program, host, state, recovery, publication,
  );
  if (violation !== null) {
    throw capacityFailure(
      violation.budget,
      violation.observedValue,
      violation.configuredBound,
      start.instanceId,
      publication.execution.headRevision,
      runtime.runOrdinal,
    );
  }
}

function capacityFailure(
  budget: WorkflowChainBudgetKind,
  observedValue: number,
  configuredBound: number,
  processInstanceId: string,
  publicRevision: number,
  runOrdinal: number,
): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    "Workflow-chain capacity is exhausted",
    bpmnWorkflowChainCapacityExhaustedFailureType,
    {
      budget,
      configuredBound,
      observedValue,
      processInstanceId,
      publicRevision,
      runOrdinal,
    },
  );
}

function invalidContinuation(message: string, cause?: unknown): ApplicationFailure {
  return ApplicationFailure.nonRetryable(
    message,
    continuationInvalidFailureType,
    ...(cause === undefined ? [] : [String(cause)]),
  );
}

function canonical(value: unknown): string {
  return canonicalWorkflowChainJson(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlyArray<string>): boolean {
  return Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}

function assertNever(value: never): never {
  throw invalidContinuation(`Unsupported Workflow-chain variant: ${String(value)}`);
}
