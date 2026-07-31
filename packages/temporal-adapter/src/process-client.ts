/**
 * Production-facing Process start, User Task Update, and Message Signal ingress.
 *
 * Resolution after a failed Update lookup follows the lifecycle contract: retained Update result,
 * completed receipt, then unknown Process.
 */
import type {
  CommandOutcome,
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  DeliverMessageStimulus,
  SemanticProcessProgram,
  StartProcessStimulus,
} from "@bpmn-lean/semantic-core";
import {
  StimulusKind,
  isWellFormedStimulus,
  sameStimulus,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowNotFoundError,
} from "@temporalio/client";
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";

import {
  TemporalHostCapabilityResultKind,
  bpmnCompleteUserTaskUpdateName,
  bpmnDeliverMessageSignalName,
  bpmnMessageDeliveryResultQueryName,
  bpmnOpenUserTasksQueryName,
  bpmnUserTaskDetailQueryName,
  MessageDeliveryResolutionKind,
  bpmnProcessWorkflowType,
  ProcessCommandResultKind,
} from "./contracts.js";
import type {
  BpmnProcessWorkflow,
  CompletedProcessReceipt,
  MessageDeliveryResolution,
  ProcessCommandResult,
  TemporalHostAdmissionFailure,
  UserTaskDetail,
  UserTaskDetailRequest,
} from "./contracts.js";
import {
  contentBoundUpdateId,
} from "./command-identity.js";
import {
  assessTemporalHostCapability,
} from "./host-admission.js";
import {
  processWorkflowId,
} from "./process-address.js";
import {
  requireCompletedProcessReceipt,
  semanticCommandResult,
} from "./runner-support.js";
import { withDeadline } from "./async-boundary.js";

const operationDeadlineMs = 5_000;
const messageResolutionPollMs = 20;

export async function listOpenUserTasks(
  client: WorkflowClient,
  processInstanceId: string,
): Promise<ReadonlyArray<import("@bpmn-lean/semantic-core").OpenUserTask>> {
  return withDeadline(
    client.getHandle<BpmnProcessWorkflow>(
      processWorkflowId(processInstanceId),
    ).query(bpmnOpenUserTasksQueryName),
    operationDeadlineMs,
    "open User Tasks Query",
  );
}

export async function readUserTaskDetail(
  client: WorkflowClient,
  processInstanceId: string,
  request: UserTaskDetailRequest,
): Promise<UserTaskDetail | null> {
  return withDeadline(
    client.getHandle<BpmnProcessWorkflow>(
      processWorkflowId(processInstanceId),
    ).query<UserTaskDetail | null, [UserTaskDetailRequest]>(
      bpmnUserTaskDetailQueryName,
      request,
    ),
    operationDeadlineMs,
    "User Task detail Query",
  );
}

export class BpmnMessageIngressInvalid extends TypeError {
  override readonly name = "BpmnMessageIngressInvalid";
}

export class BpmnCommandIdentityConflict extends Error {
  override readonly name = "BpmnCommandIdentityConflict";
}

export enum BpmnProcessAdmissionResultKind {
  Admitted = "admitted",
  Rejected = "rejected",
}

export enum BpmnProcessAdmissionFailureCode {
  SemanticProcessUnsupported = "semanticProcessUnsupported",
}

export type BpmnProcessAdmissionFailure =
  | Readonly<{
      code:
        BpmnProcessAdmissionFailureCode.SemanticProcessUnsupported;
      evidence: string;
    }>
  | TemporalHostAdmissionFailure;

export type BpmnProcessAdmissionResult =
  | Readonly<{
      kind: BpmnProcessAdmissionResultKind.Admitted;
    }>
  | Readonly<{
      kind: BpmnProcessAdmissionResultKind.Rejected;
      failure: BpmnProcessAdmissionFailure;
    }>;

export enum BpmnProcessStartResultKind {
  Started = "started",
  Rejected = "rejected",
}

export type BpmnProcessStartResult =
  | Readonly<{
      kind: BpmnProcessStartResultKind.Started;
      handle: WorkflowHandle<BpmnProcessWorkflow>;
    }>
  | Readonly<{
      kind: BpmnProcessStartResultKind.Rejected;
      failure: BpmnProcessAdmissionFailure;
    }>;

export type BpmnProcessStartOptions = DeepReadonly<{
  /** Task Queue polled by the Worker that hosts this Process. */
  taskQueue: string;
}>;

export function assessBpmnProcessAdmission(
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
): BpmnProcessAdmissionResult {
  if (!supportsSemanticProcessExecution(start, semanticProcess)) {
    return {
      kind: BpmnProcessAdmissionResultKind.Rejected,
      failure: {
        code:
          BpmnProcessAdmissionFailureCode.SemanticProcessUnsupported,
        evidence:
          "Workflow start requires one admitted Semantic Process execution.",
      },
    };
  }
  const hostCapability = assessTemporalHostCapability(semanticProcess);
  switch (hostCapability.kind) {
    case TemporalHostCapabilityResultKind.Admitted:
      return { kind: BpmnProcessAdmissionResultKind.Admitted };
    case TemporalHostCapabilityResultKind.Rejected:
      return {
        kind: BpmnProcessAdmissionResultKind.Rejected,
        failure: hostCapability.failure,
      };
  }
}

export async function startBpmnProcess(
  client: WorkflowClient,
  start: StartProcessStimulus,
  semanticProcess: SemanticProcessProgram,
  options: BpmnProcessStartOptions,
): Promise<BpmnProcessStartResult> {
  if (options.taskQueue.length === 0) {
    throw new TypeError("Process Workflow Task Queue must be nonempty");
  }
  const admission = assessBpmnProcessAdmission(start, semanticProcess);
  if (admission.kind === BpmnProcessAdmissionResultKind.Rejected) {
    return {
      kind: BpmnProcessStartResultKind.Rejected,
      failure: admission.failure,
    };
  }
  const handle = await withDeadline(
    client.start<BpmnProcessWorkflow>(
      bpmnProcessWorkflowType,
      {
        taskQueue: options.taskQueue,
        workflowId: processWorkflowId(start.instanceId),
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [start, semanticProcess],
      },
    ),
    operationDeadlineMs,
    "Process Workflow start",
  );
  return {
    kind: BpmnProcessStartResultKind.Started,
    handle,
  };
}

export async function submitUserTaskCompletion(
  client: WorkflowClient,
  processInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
): Promise<ProcessCommandResult> {
  return submitUserTaskCompletionAtWorkflowId(
    client,
    processWorkflowId(processInstanceId),
    processInstanceId,
    stimulus,
  );
}

export async function submitUserTaskCompletionAtWorkflowId(
  client: WorkflowClient,
  workflowId: string,
  processInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
): Promise<ProcessCommandResult> {
  if (
    !isWellFormedStimulus(stimulus) ||
    stimulus.kind !== StimulusKind.CompleteUserTaskInstance ||
    stimulus.taskId.processInstanceId !== processInstanceId
  ) {
    throw new TypeError(
      "Completion command must be well-formed and address the named Process instance",
    );
  }
  const updateId = contentBoundUpdateId(stimulus);
  const handle = client.getHandle<BpmnProcessWorkflow>(workflowId);
  try {
    const outcome = await withDeadline(
      handle.executeUpdate<
        CommandOutcome,
        [CompleteUserTaskInstanceStimulus]
      >(bpmnCompleteUserTaskUpdateName, {
        args: [stimulus],
        updateId,
      }),
      operationDeadlineMs,
      `Workflow Update ${updateId}`,
    );
    return semanticCommandResult(stimulus.commandId, outcome);
  } catch (error: unknown) {
    if (!(error instanceof WorkflowNotFoundError)) {
      throw error;
    }
  }

  try {
    const retainedOutcome = await withDeadline(
      handle.getUpdateHandle<CommandOutcome>(updateId).result(),
      operationDeadlineMs,
      `retained Workflow Update ${updateId}`,
    );
    return semanticCommandResult(stimulus.commandId, retainedOutcome);
  } catch (error: unknown) {
    if (!(error instanceof WorkflowNotFoundError)) {
      throw error;
    }
  }

  try {
    const receipt = requireCompletedProcessReceipt(
      await withDeadline(
        handle.result(),
        operationDeadlineMs,
        "retained completed Process receipt",
      ),
    );
    if (receipt.processInstanceId !== processInstanceId) {
      throw new TypeError(
        "Temporal Workflow receipt does not match the addressed Process instance",
      );
    }
    return {
      kind: ProcessCommandResultKind.ProcessClosed,
      commandId: stimulus.commandId,
      receipt,
    };
  } catch (error: unknown) {
    if (error instanceof WorkflowNotFoundError) {
      return {
        kind: ProcessCommandResultKind.ProcessUnknown,
        commandId: stimulus.commandId,
        processInstanceId,
      };
    }
    throw error;
  }
}

export async function submitMessageDelivery(
  client: WorkflowClient,
  processInstanceId: string,
  stimulus: unknown,
): Promise<ProcessCommandResult> {
  return submitMessageDeliveryAtWorkflowId(
    client,
    processWorkflowId(processInstanceId),
    processInstanceId,
    stimulus,
  );
}

export async function submitMessageDeliveryAtWorkflowId(
  client: WorkflowClient,
  workflowId: string,
  processInstanceId: string,
  stimulus: unknown,
): Promise<ProcessCommandResult> {
  const delivery = requireMessageDelivery(processInstanceId, stimulus);
  const handle = client.getHandle<BpmnProcessWorkflow>(workflowId);
  try {
    await withDeadline(
      handle.signal<
        [DeliverMessageStimulus]
      >(bpmnDeliverMessageSignalName, delivery),
      operationDeadlineMs,
      `Workflow Signal ${delivery.commandId}`,
    );
  } catch (error: unknown) {
    if (!(error instanceof WorkflowNotFoundError)) {
      throw error;
    }
    return resolveClosedMessageDelivery(
      handle,
      processInstanceId,
      delivery,
    );
  }

  const deadline = Date.now() + operationDeadlineMs;
  while (Date.now() < deadline) {
    try {
      const resolution = await withDeadline(
        handle.query<
          MessageDeliveryResolution | null,
          [DeliverMessageStimulus]
        >(
          bpmnMessageDeliveryResultQueryName,
          delivery,
        ),
        Math.max(1, deadline - Date.now()),
        `Message delivery Query ${delivery.commandId}`,
      );
      if (
        resolution !== null &&
        resolution.kind !== MessageDeliveryResolutionKind.Pending
      ) {
        return resolveMessageDeliveryRecord(resolution);
      }
    } catch (error: unknown) {
      if (error instanceof WorkflowNotFoundError) {
        return resolveClosedMessageDelivery(
          handle,
          processInstanceId,
          delivery,
        );
      }
      throw error;
    }
    await new Promise<void>((resolve) =>
      setTimeout(resolve, messageResolutionPollMs)
    );
  }
  throw new Error(
    `Message delivery ${delivery.commandId} did not resolve before the client deadline`,
  );
}

function requireMessageDelivery(
  processInstanceId: string,
  stimulus: unknown,
): DeliverMessageStimulus {
  if (
    !isWellFormedStimulus(stimulus) ||
    stimulus.kind !== StimulusKind.DeliverMessage ||
    stimulus.subscriptionId.processInstanceId !== processInstanceId
  ) {
    throw new BpmnMessageIngressInvalid(
      "Message delivery must be well-formed and address the named Process instance",
    );
  }
  return stimulus;
}

async function resolveClosedMessageDelivery(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  processInstanceId: string,
  stimulus: DeliverMessageStimulus,
): Promise<ProcessCommandResult> {
  try {
    const receipt = requireCompletedProcessReceipt(
      await withDeadline(
        handle.result(),
        operationDeadlineMs,
        "retained completed Process receipt",
      ),
    );
    if (receipt.processInstanceId !== processInstanceId) {
      throw new TypeError(
        "Temporal Workflow receipt does not match the addressed Process instance",
      );
    }
    const retained = receipt.messageDeliveryRecords.find(
      ({ stimulus: candidate }) => sameStimulus(candidate, stimulus),
    );
    if (retained !== undefined) {
      return resolveMessageDeliveryRecord(retained);
    }
    return closedCommandResult(stimulus, receipt);
  } catch (error: unknown) {
    if (error instanceof WorkflowNotFoundError) {
      return {
        kind: ProcessCommandResultKind.ProcessUnknown,
        commandId: stimulus.commandId,
        processInstanceId,
      };
    }
    throw error;
  }
}

function resolveMessageDeliveryRecord(
  resolution: Exclude<
    MessageDeliveryResolution,
    { kind: typeof MessageDeliveryResolutionKind.Pending }
  >,
): ProcessCommandResult {
  switch (resolution.kind) {
    case MessageDeliveryResolutionKind.Semantic:
      return semanticCommandResult(
        resolution.stimulus.commandId,
        resolution.outcome,
      );
    case MessageDeliveryResolutionKind.RequestFailure:
      throw new BpmnCommandIdentityConflict(
        `Command ID ${resolution.stimulus.commandId} was reused with a different stimulus`,
      );
    default:
      return assertNever(resolution);
  }
}

function closedCommandResult(
  stimulus: DeliverMessageStimulus,
  receipt: CompletedProcessReceipt,
): ProcessCommandResult {
  return {
    kind: ProcessCommandResultKind.ProcessClosed,
    commandId: stimulus.commandId,
    receipt,
  };
}

function assertNever(value: never): never {
  throw new TypeError(
    `Unsupported Message delivery resolution: ${String(value)}`,
  );
}
