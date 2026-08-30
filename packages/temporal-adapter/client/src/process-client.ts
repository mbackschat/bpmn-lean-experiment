/**
 * Production-facing Process start, User Task Update, and Message Signal ingress.
 *
 * Indeterminate command transport is resolved against the latest Workflow-chain recovery Query.
 */
import type {
  CanonicalObservation,
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  SemanticProcessProgram,
  ProcessStartStimulus,
} from "@bpmn-lean/semantic-core";
import {
  StimulusKind,
  isWellFormedStimulus,
  supportsSemanticProcessExecution,
} from "@bpmn-lean/semantic-core";
import type {
  WorkflowClient,
} from "@temporalio/client";

import {
  BpmnWorkflowHostInputKind,
  TemporalHostCapabilityResultKind,
  WorkflowChainBudgetKind,
  bpmnTraceQueryName,
  bpmnCompleteUserTaskUpdateName,
  bpmnDeliverMessageSignalName,
  bpmnMessageDeliveryResultQueryName,
  bpmnOpenUserTasksQueryName,
  bpmnUserTaskDetailQueryName,
  bpmnProcessWorkflowType,
  bpmnWorkflowContinuationV1,
  requireWorkflowChainInitialArgumentBudgets,
  workflowChainProductionLimit,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  MessageDeliveryStimulus,
  ProcessCommandResult,
  TemporalHostAdmissionFailure,
  UserTaskDetail,
  UserTaskDetailRequest,
} from "@bpmn-lean/temporal-protocol";
import {
  assessTemporalHostCapability,
} from "@bpmn-lean/temporal-protocol";
import {
  processWorkflowId,
} from "@bpmn-lean/temporal-protocol";
import { withDeadline } from "@bpmn-lean/temporal-protocol";
import { resolveSemanticUpdate } from "./semantic-update-client.js";
import {
  BpmnCommandIdentityConflict,
  BpmnWorkflowChainCapacityExhausted,
  resolveWorkflowChainMessage,
} from "./workflow-chain-recovery-client.js";

export {
  BpmnCommandIdentityConflict,
  BpmnWorkflowChainCapacityExhausted,
};

const operationDeadlineMs = 5_000;

/** Reads the committed canonical trace of one known semantic Process instance. */
export async function readBpmnProcessTrace(
  client: WorkflowClient,
  processInstanceId: string,
): Promise<ReadonlyArray<CanonicalObservation>> {
  return withDeadline(
    client.getHandle<BpmnProcessWorkflow>(
      processWorkflowId(processInstanceId),
    ).query<ReadonlyArray<CanonicalObservation>>(bpmnTraceQueryName),
    operationDeadlineMs,
    "BPMN Process trace Query",
  );
}

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
      processInstanceId: string;
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
  start: ProcessStartStimulus,
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
  start: ProcessStartStimulus,
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
  const processInstanceId = start.instanceId;
  requireWorkflowChainInitialArgumentBudgets(start, semanticProcess);
  await withDeadline(
    client.start<BpmnProcessWorkflow>(
      bpmnProcessWorkflowType,
      {
        taskQueue: options.taskQueue,
        workflowId: processWorkflowId(processInstanceId),
        workflowIdReusePolicy: "REJECT_DUPLICATE",
        args: [start, semanticProcess, {
          protocol: bpmnWorkflowContinuationV1,
          kind: BpmnWorkflowHostInputKind.Initial,
          eventHistoryEventLimit: workflowChainProductionLimit(
            WorkflowChainBudgetKind.EventHistoryEvents,
          ),
          eventHistoryByteLimit: workflowChainProductionLimit(
            WorkflowChainBudgetKind.EventHistoryBytes,
          ),
        }],
      },
    ),
    operationDeadlineMs,
    "Process Workflow start",
  );
  return {
    kind: BpmnProcessStartResultKind.Started,
    processInstanceId,
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

/**
 * Sends a semantic task completion to a separately addressed hosting Workflow.
 * The hosting Process identity owns the Workflow receipt; the task occurrence may
 * belong to a distinct called Process and is validated by the semantic core.
 */
export async function submitUserTaskCompletionAtWorkflowId(
  client: WorkflowClient,
  workflowId: string,
  hostingProcessInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
): Promise<ProcessCommandResult> {
  if (
    !isWellFormedStimulus(stimulus) ||
    stimulus.kind !== StimulusKind.CompleteUserTaskInstance
  ) {
    throw new TypeError(
      "Completion command must contain one well-formed task occurrence",
    );
  }
  return resolveSemanticUpdate({
    client,
    workflowId,
    processInstanceId: hostingProcessInstanceId,
    stimulus,
    updateName: bpmnCompleteUserTaskUpdateName,
    operation: "User Task completion",
  });
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
  return resolveWorkflowChainMessage({
    client,
    workflowId,
    processInstanceId,
    stimulus: delivery,
    signalName: bpmnDeliverMessageSignalName,
    resultQueryName: bpmnMessageDeliveryResultQueryName,
    operation: "Message delivery",
  });
}

function requireMessageDelivery(
  processInstanceId: string,
  stimulus: unknown,
): MessageDeliveryStimulus {
  if (
    !isWellFormedStimulus(stimulus) ||
    (
      stimulus.kind !== StimulusKind.DeliverMessage &&
      stimulus.kind !== StimulusKind.DeliverPayloadMessage
    ) ||
    stimulus.subscriptionId.processInstanceId !== processInstanceId
  ) {
    throw new BpmnMessageIngressInvalid(
      "Message delivery must be well-formed and address the named Process instance",
    );
  }
  return stimulus;
}
