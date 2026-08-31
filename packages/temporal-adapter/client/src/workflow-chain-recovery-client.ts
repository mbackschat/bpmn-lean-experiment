/** Content-bound Product 1 command recovery across a Workflow chain. */
import {
  CommandOutcome,
  StimulusKind,
  isCorrelatedMessageAddress,
  isWellFormedStimulus,
  sameStimulus,
} from "@bpmn-lean/semantic-core";
import {
  ApplicationFailure,
  QueryNotRegisteredError,
  WorkflowNotFoundError,
  WorkflowUpdateFailedError,
  WorkflowUpdateRPCTimeoutOrCancelledError,
} from "@temporalio/client";
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";

import {
  MessageDeliveryResolutionKind,
  CorrelationRegistrationFailureKind,
  ProcessCommandResultKind,
  WorkflowChainBudgetKind,
  WorkflowChainCommandRecoveryResponseKind,
  bpmnWorkflowChainCapacityExhaustedFailureType,
  bpmnWorkflowChainCommandRecoveryQueryName,
  buildWorkflowChainRecoveryRequest,
  contentBoundUpdateId,
  decodeWorkflowTerminalResult,
  requireWorkflowChainCommandRecoveryResponse,
  requireWorkflowChainCanonicalByteBudget,
  semanticCommandResult,
  withDeadline,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  ExternallyRetryableStimulus,
  MessageDeliveryStimulus,
  CorrelationRegistrationFailure,
  ProcessCommandResult,
  TerminalProcessReceipt,
  WorkflowChainCapacityFailureDetails,
  WorkflowChainCommandRecoveryRequest,
  WorkflowChainCommandRecoveryResponse,
} from "@bpmn-lean/temporal-protocol";

// A closed-Run Query may consume the pinned Worker's full 10-second sticky fallback before replay.
const operationDeadlineMs = 15_000;
const recoveryPollMs = 20;
const identityConflictFailureType = "BpmnCommandIdentityConflict";
const rolloverFailureType = "BpmnWorkflowRolloverInProgress";
const terminalReceiptPendingFailureType = "BpmnWorkflowTerminalReceiptPending";

export class BpmnCommandIdentityConflict extends Error {
  override readonly name = "BpmnCommandIdentityConflict";
}

/** A validated host-capacity failure, distinct from every semantic command result. */
export class BpmnWorkflowChainCapacityExhausted extends Error {
  override readonly name = "BpmnWorkflowChainCapacityExhausted";
  readonly code = bpmnWorkflowChainCapacityExhaustedFailureType;
  readonly details: WorkflowChainCapacityFailureDetails;

  constructor(details: WorkflowChainCapacityFailureDetails) {
    super(
      `Workflow-chain capacity ${details.budget} exhausted at ${details.observedValue}`,
    );
    this.details = Object.freeze({ ...details });
  }
}

export class BpmnCorrelationCandidateCapacityExhausted extends Error {
  override readonly name = "BpmnCorrelationCandidateCapacityExhausted";
  readonly failure: CorrelationRegistrationFailure;

  constructor(failure: CorrelationRegistrationFailure) {
    super(`Correlation candidate capacity exhausted for ${failure.transactionId}`);
    this.failure = Object.freeze({ ...failure });
  }
}

export class BpmnCorrelationAddressQuarantined extends Error {
  override readonly name = "BpmnCorrelationAddressQuarantined";
  readonly failure: CorrelationRegistrationFailure;

  constructor(failure: CorrelationRegistrationFailure) {
    super(`Correlation address quarantined for ${failure.transactionId}`);
    this.failure = Object.freeze({ ...failure });
  }
}

type WorkflowChainUpdateStimulus = Exclude<
  ExternallyRetryableStimulus,
  {
    kind:
      | StimulusKind.DeliverMessage
      | StimulusKind.DeliverPayloadMessage;
  }
>;

export type WorkflowChainUpdateResolution = Readonly<{
  client: WorkflowClient;
  workflowId: string;
  processInstanceId: string;
  stimulus: WorkflowChainUpdateStimulus;
  updateName: string;
  operation: string;
  deadlineMs?: number;
}>;

/** Executes one content-bound Update and resolves every indeterminate Run boundary by Workflow ID. */
export async function resolveWorkflowChainUpdate(
  resolution: WorkflowChainUpdateResolution,
): Promise<ProcessCommandResult> {
  requireWorkflowChainCanonicalByteBudget(
    WorkflowChainBudgetKind.SemanticStimulusBytes,
    resolution.stimulus,
  );
  const deadline = Date.now() + requireOperationDeadlineMs(resolution.deadlineMs);
  const handle = resolution.client.getHandle<BpmnProcessWorkflow>(
    resolution.workflowId,
  );
  const request = buildWorkflowChainRecoveryRequest(
    resolution.processInstanceId,
    resolution.stimulus,
  );
  const updateId = contentBoundUpdateId(resolution.stimulus);

  while (true) {
    try {
      const outcome = await beforeDeadline(
        deadline,
        `${resolution.operation} Update ${updateId}`,
        () => handle.executeUpdate<CommandOutcome, [WorkflowChainUpdateStimulus]>(
          resolution.updateName,
          { args: [resolution.stimulus], updateId },
        ),
      );
      return semanticCommandResult(request.commandId, outcome);
    } catch (error: unknown) {
      if (hasApplicationFailureType(error, identityConflictFailureType)) {
        throw identityConflict(request.commandId);
      }
      if (!isIndeterminateUpdateFailure(error)) {
        throw error;
      }
    }

    const recovery = await queryRecovery(handle, request, deadline);
    switch (recovery.kind) {
      case RecoveryDecisionKind.Result:
        return recovery.result;
      case RecoveryDecisionKind.Retry:
        await pollDelay(deadline);
        break;
      case RecoveryDecisionKind.Legacy:
        return resolveLegacyUpdate(handle, request, updateId, deadline);
      default:
        return assertNever(recovery);
    }
  }
}

export type WorkflowChainMessageResolution = Readonly<{
  client: WorkflowClient;
  workflowId: string;
  processInstanceId: string;
  stimulus: MessageDeliveryStimulus;
  signalName: string;
  resultQueryName: string;
  operation: string;
}>;

/** Signals once, then polls content-bound results while chain recovery owns every Run transition. */
export async function resolveWorkflowChainMessage(
  resolution: WorkflowChainMessageResolution,
): Promise<ProcessCommandResult> {
  requireWorkflowChainCanonicalByteBudget(
    WorkflowChainBudgetKind.SemanticStimulusBytes,
    resolution.stimulus,
  );
  const deadline = Date.now() + operationDeadlineMs;
  const handle = resolution.client.getHandle<BpmnProcessWorkflow>(
    resolution.workflowId,
  );
  const request = buildWorkflowChainRecoveryRequest(
    resolution.processInstanceId,
    resolution.stimulus,
  );
  let recoveryRequired = false;
  let legacyQuery = false;
  try {
    await beforeDeadline(
      deadline,
      `${resolution.operation} Signal ${request.commandId}`,
      () => handle.signal<[MessageDeliveryStimulus]>(
        resolution.signalName,
        resolution.stimulus,
      ),
    );
  } catch (error: unknown) {
    if (!isIndeterminateMessageFailure(error)) {
      throw error;
    }
    recoveryRequired = true;
  }

  while (true) {
    if (recoveryRequired) {
      const recovery = await queryRecovery(handle, request, deadline);
      switch (recovery.kind) {
        case RecoveryDecisionKind.Result:
          return recovery.result;
        case RecoveryDecisionKind.Retry:
          recoveryRequired = false;
          break;
        case RecoveryDecisionKind.Legacy:
          legacyQuery = true;
          recoveryRequired = false;
          break;
        default:
          return assertNever(recovery);
      }
    }

    try {
      const candidate = await beforeDeadline(
        deadline,
        `${resolution.operation} result Query ${request.commandId}`,
        () => handle.query<unknown, [MessageDeliveryStimulus]>(
          resolution.resultQueryName,
          resolution.stimulus,
        ),
      );
      const result = interpretMessageResolution(candidate, resolution.stimulus);
      if (result !== null) {
        return result;
      }
    } catch (error: unknown) {
      if (!(error instanceof WorkflowNotFoundError)) {
        throw error;
      }
      if (legacyQuery) {
        return resolveTerminalMessageResult(
          handle,
          request,
          resolution.stimulus,
          deadline,
        );
      }
      recoveryRequired = true;
      continue;
    }
    await pollDelay(deadline);
  }
}

enum RecoveryDecisionKind {
  Result = "result",
  Retry = "retry",
  Legacy = "legacy",
}

type RecoveryDecision =
  | Readonly<{
      kind: RecoveryDecisionKind.Result;
      result: ProcessCommandResult;
    }>
  | Readonly<{ kind: RecoveryDecisionKind.Retry }>
  | Readonly<{ kind: RecoveryDecisionKind.Legacy }>;

async function queryRecovery(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  request: WorkflowChainCommandRecoveryRequest,
  deadline: number,
): Promise<RecoveryDecision> {
  let candidate: unknown;
  try {
    candidate = await beforeDeadline(
      deadline,
      `Workflow-chain recovery Query ${request.commandId}`,
      () => handle.query<unknown, [WorkflowChainCommandRecoveryRequest]>(
        bpmnWorkflowChainCommandRecoveryQueryName,
        request,
      ),
    );
  } catch (error: unknown) {
    if (error instanceof QueryNotRegisteredError) {
      return { kind: RecoveryDecisionKind.Legacy };
    }
    if (error instanceof WorkflowNotFoundError) {
      return {
        kind: RecoveryDecisionKind.Result,
        result: await resolveTerminalResult(handle, request, deadline),
      };
    }
    throw error;
  }
  return interpretRecoveryResponse(
    requireWorkflowChainCommandRecoveryResponse(candidate, request),
  );
}

function interpretRecoveryResponse(
  response: WorkflowChainCommandRecoveryResponse,
): RecoveryDecision {
  switch (response.kind) {
    case WorkflowChainCommandRecoveryResponseKind.Resolved:
      return {
        kind: RecoveryDecisionKind.Result,
        result: semanticCommandResult(response.commandId, response.outcome),
      };
    case WorkflowChainCommandRecoveryResponseKind.IdentityConflict:
      throw identityConflict(response.commandId);
    case WorkflowChainCommandRecoveryResponseKind.UnknownWhileActive:
      return { kind: RecoveryDecisionKind.Retry };
    case WorkflowChainCommandRecoveryResponseKind.TerminalWithoutEntry:
      return {
        kind: RecoveryDecisionKind.Result,
        result: closedCommandResult(response.commandId, response.receipt),
      };
    case WorkflowChainCommandRecoveryResponseKind.CapacityFailedWithoutEntry:
      throw new BpmnWorkflowChainCapacityExhausted(response.failure);
    default:
      return assertNever(response);
  }
}

async function resolveLegacyUpdate(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  request: WorkflowChainCommandRecoveryRequest,
  updateId: string,
  deadline: number,
): Promise<ProcessCommandResult> {
  try {
    const outcome = await beforeDeadline(
      deadline,
      `retained Workflow Update ${updateId}`,
      () => handle.getUpdateHandle<CommandOutcome>(updateId).result(),
    );
    return semanticCommandResult(request.commandId, outcome);
  } catch (error: unknown) {
    if (hasApplicationFailureType(error, identityConflictFailureType)) {
      throw identityConflict(request.commandId);
    }
    if (!(error instanceof WorkflowNotFoundError)) {
      throw error;
    }
  }
  return resolveTerminalResult(handle, request, deadline);
}

async function resolveTerminalResult(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  request: WorkflowChainCommandRecoveryRequest,
  deadline: number,
): Promise<ProcessCommandResult> {
  const terminal = await readTerminalResult(handle, deadline);
  if (terminal === null) {
    return unknownCommandResult(request);
  }
  if (terminal.receipt.processInstanceId !== request.processInstanceId) {
    throw new TypeError(
      "Temporal Workflow result does not match the addressed Process instance",
    );
  }
  const entry = terminal.recoveryEntries.find(
    ({ commandId }) => commandId === request.commandId,
  );
  if (entry !== undefined) {
    if (entry.stimulusSha256 !== request.stimulusSha256) {
      throw identityConflict(request.commandId);
    }
    return semanticCommandResult(request.commandId, entry.outcome);
  }
  return closedCommandResult(request.commandId, terminal.receipt);
}

async function resolveTerminalMessageResult(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  request: WorkflowChainCommandRecoveryRequest,
  stimulus: MessageDeliveryStimulus,
  deadline: number,
): Promise<ProcessCommandResult> {
  const terminal = await readTerminalResult(handle, deadline);
  if (terminal === null) {
    return unknownCommandResult(request);
  }
  if (terminal.receipt.processInstanceId !== request.processInstanceId) {
    throw new TypeError(
      "Temporal Workflow result does not match the addressed Process instance",
    );
  }
  const entry = terminal.recoveryEntries.find(
    ({ commandId }) => commandId === request.commandId,
  );
  if (entry !== undefined) {
    if (entry.stimulusSha256 !== request.stimulusSha256) {
      throw identityConflict(request.commandId);
    }
    return semanticCommandResult(request.commandId, entry.outcome);
  }
  const legacyRecord = terminal.legacyMessageDeliveryRecords.find(
    ({ stimulus: candidate }) => candidate.commandId === request.commandId,
  );
  if (legacyRecord !== undefined) {
    if (!sameStimulus(legacyRecord.stimulus, stimulus)) {
      throw identityConflict(request.commandId);
    }
    const result = interpretMessageResolution(legacyRecord, stimulus);
    if (result === null) {
      throw new TypeError("Terminal Message recovery cannot remain pending");
    }
    return result;
  }
  return closedCommandResult(request.commandId, terminal.receipt);
}

async function readTerminalResult(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  deadline: number,
): Promise<ReturnType<typeof decodeWorkflowTerminalResult> | null> {
  try {
    return decodeWorkflowTerminalResult(await beforeDeadline(
      deadline,
      "retained terminal Process result",
      () => handle.result(),
    ));
  } catch (error: unknown) {
    if (error instanceof WorkflowNotFoundError) {
      return null;
    }
    throw error;
  }
}

function interpretMessageResolution(
  candidate: unknown,
  stimulus: MessageDeliveryStimulus,
): ProcessCommandResult | null {
  if (candidate === null) {
    return null;
  }
  if (!isRecord(candidate) || !isWellFormedStimulus(candidate.stimulus) ||
    (
      candidate.stimulus.kind !== StimulusKind.DeliverMessage &&
      candidate.stimulus.kind !== StimulusKind.DeliverPayloadMessage
    )) {
    throw new TypeError("Malformed Message delivery resolution");
  }
  switch (candidate.kind) {
    case MessageDeliveryResolutionKind.Pending:
      requireOnlyKeys(candidate, ["kind", "stimulus"]);
      if (!sameStimulus(candidate.stimulus, stimulus)) {
        throw identityConflict(stimulus.commandId);
      }
      return null;
    case MessageDeliveryResolutionKind.Semantic:
      requireOnlyKeys(candidate, ["kind", "stimulus", "outcome"]);
      if (!sameStimulus(candidate.stimulus, stimulus)) {
        throw identityConflict(stimulus.commandId);
      }
      return semanticCommandResult(
        stimulus.commandId,
        requireCommandOutcome(candidate.outcome),
      );
    case MessageDeliveryResolutionKind.RequestFailure:
      requireOnlyKeys(candidate, ["kind", "stimulus", "failure"]);
      if (candidate.failure !== "commandIdentityConflict") {
        throw new TypeError("Malformed Message delivery request failure");
      }
      throw identityConflict(stimulus.commandId);
    case MessageDeliveryResolutionKind.CorrelationRegistrationFailed:
      requireOnlyKeys(candidate, ["kind", "stimulus", "failure"]);
      if (!sameStimulus(candidate.stimulus, stimulus) ||
        !isCorrelationRegistrationFailure(candidate.failure, stimulus.commandId)) {
        throw identityConflict(stimulus.commandId);
      }
      switch (candidate.failure.kind) {
        case CorrelationRegistrationFailureKind.CandidateCapacity:
          throw new BpmnCorrelationCandidateCapacityExhausted(candidate.failure);
        case CorrelationRegistrationFailureKind.AddressQuarantined:
          throw new BpmnCorrelationAddressQuarantined(candidate.failure);
        default:
          throw new TypeError("Malformed correlation registration failure");
      }
    default:
      throw new TypeError("Malformed Message delivery resolution variant");
  }
}

function isCorrelationRegistrationFailure(
  value: unknown,
  transactionId: string,
): value is CorrelationRegistrationFailure {
  return isRecord(value) &&
    Object.keys(value).length === 3 &&
    Object.hasOwn(value, "kind") &&
    Object.hasOwn(value, "address") &&
    Object.hasOwn(value, "transactionId") &&
    isCorrelatedMessageAddress(value.address) &&
    value.transactionId === transactionId &&
    (
      value.kind === CorrelationRegistrationFailureKind.CandidateCapacity ||
      value.kind === CorrelationRegistrationFailureKind.AddressQuarantined
    );
}

function isIndeterminateUpdateFailure(error: unknown): boolean {
  return error instanceof WorkflowNotFoundError ||
    error instanceof WorkflowUpdateRPCTimeoutOrCancelledError ||
    hasApplicationFailureType(error, rolloverFailureType) ||
    hasApplicationFailureType(error, terminalReceiptPendingFailureType) ||
    hasApplicationFailureType(error, bpmnWorkflowChainCapacityExhaustedFailureType);
}

function isIndeterminateMessageFailure(error: unknown): boolean {
  return error instanceof WorkflowNotFoundError;
}

function hasApplicationFailureType(error: unknown, type: string): boolean {
  return error instanceof WorkflowUpdateFailedError &&
    error.cause instanceof ApplicationFailure && error.cause.type === type;
}

function closedCommandResult(
  commandId: string,
  receipt: TerminalProcessReceipt,
): ProcessCommandResult {
  return { kind: ProcessCommandResultKind.ProcessClosed, commandId, receipt };
}

function unknownCommandResult(
  request: WorkflowChainCommandRecoveryRequest,
): ProcessCommandResult {
  return {
    kind: ProcessCommandResultKind.ProcessUnknown,
    commandId: request.commandId,
    processInstanceId: request.processInstanceId,
  };
}

function identityConflict(commandId: string): BpmnCommandIdentityConflict {
  return new BpmnCommandIdentityConflict(
    `Command ID ${commandId} was reused with a different stimulus`,
  );
}

function requireCommandOutcome(value: unknown): CommandOutcome {
  switch (value) {
    case CommandOutcome.Committed:
    case CommandOutcome.RolledBack:
    case CommandOutcome.Rejected:
    case CommandOutcome.SemanticFailure:
    case CommandOutcome.Unsupported:
      return value;
    default:
      throw new TypeError("Malformed semantic command outcome");
  }
}

async function beforeDeadline<Value>(
  deadline: number,
  operation: string,
  invoke: () => Promise<Value>,
): Promise<Value> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error(`${operation} exceeded the client deadline`);
  }
  return withDeadline(invoke(), remaining, operation);
}

function requireOperationDeadlineMs(value: number | undefined): number {
  const deadlineMs = value ?? operationDeadlineMs;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1) {
    throw new TypeError("Workflow-chain command deadline must be a positive integer");
  }
  return deadlineMs;
}

async function pollDelay(deadline: number): Promise<void> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error("Workflow-chain command recovery exceeded the client deadline");
  }
  await new Promise<void>((resolve) =>
    setTimeout(resolve, Math.min(recoveryPollMs, remaining))
  );
}

function requireOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): void {
  if (Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))) {
    throw new TypeError("Malformed Message delivery resolution shape");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNever(value: never): never {
  throw new TypeError(`Unsupported Workflow-chain recovery value: ${String(value)}`);
}
