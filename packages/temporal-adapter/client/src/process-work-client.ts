/** Handle-free current User Task observation and completion at one exact hosting Workflow. */
import type {
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
} from "@bpmn-lean/semantic-core";
import {
  WorkflowNotFoundError,
} from "@temporalio/client";
import type {
  WorkflowClient,
  WorkflowHandle,
} from "@temporalio/client";

import {
  bpmnOpenUserTasksQueryName,
  bpmnUserTaskDetailQueryName,
  processWorkflowId,
  requireTerminalProcessReceipt,
  withDeadline,
} from "@bpmn-lean/temporal-protocol";

export type {
  ProcessCommandResult,
  UserTaskDetail,
  UserTaskDetailRequest,
} from "@bpmn-lean/temporal-protocol";
import type {
  BpmnProcessWorkflow,
  ProcessCommandResult,
  UserTaskDetail,
  UserTaskDetailRequest,
} from "@bpmn-lean/temporal-protocol";

import type {
  TemporalDefinitionStartClient,
} from "./definition-start-client.js";
import {
  submitUserTaskCompletionAtWorkflowId,
} from "./process-client.js";

const operationDeadlineMs = 5_000;

export type TemporalProcessWorkClient = TemporalDefinitionStartClient;

/** Derives the canonical direct and Message Start Process Workflow address. */
export function temporalCanonicalProcessWorkAddress(
  processInstanceId: string,
): string {
  return processWorkflowId(processInstanceId);
}

export enum TemporalProcessWorkObservationStatus {
  Open = "open",
  Closed = "closed",
  Unknown = "unknown",
  Unavailable = "unavailable",
}

export type TemporalProcessWorkObservationResult =
  | Readonly<{
      status: TemporalProcessWorkObservationStatus.Open;
      openUserTasks: readonly OpenUserTask[];
    }>
  | Readonly<{
      status:
        | TemporalProcessWorkObservationStatus.Closed
        | TemporalProcessWorkObservationStatus.Unknown
        | TemporalProcessWorkObservationStatus.Unavailable;
    }>;

export enum TemporalProcessWorkDetailStatus {
  Found = "found",
  NotFound = "notFound",
  Closed = "closed",
  Unknown = "unknown",
  Unavailable = "unavailable",
}

export type TemporalProcessWorkDetailResult =
  | Readonly<{
      status: TemporalProcessWorkDetailStatus.Found;
      detail: UserTaskDetail;
    }>
  | Readonly<{
      status:
        | TemporalProcessWorkDetailStatus.NotFound
        | TemporalProcessWorkDetailStatus.Closed
        | TemporalProcessWorkDetailStatus.Unknown
        | TemporalProcessWorkDetailStatus.Unavailable;
    }>;

/** Queries the exact current open-task publication at a separately supplied Workflow address. */
export async function observeTemporalProcessWork(
  client: TemporalProcessWorkClient,
  workflowId: string,
  hostingProcessInstanceId: string,
): Promise<TemporalProcessWorkObservationResult> {
  const snapshot = snapshotAddress(workflowId, hostingProcessInstanceId);
  const handle = workflowClientOf(client).getHandle<BpmnProcessWorkflow>(
    snapshot.workflowId,
  );
  try {
    const openUserTasks = await withDeadline(
      handle.query<readonly OpenUserTask[]>(bpmnOpenUserTasksQueryName),
      operationDeadlineMs,
      "open User Tasks Query",
    );
    return {
      status: TemporalProcessWorkObservationStatus.Open,
      openUserTasks: structuredClone(openUserTasks),
    };
  } catch (error: unknown) {
    return error instanceof WorkflowNotFoundError
      ? resolveObservationAbsence(handle, snapshot.hostingProcessInstanceId)
      : { status: TemporalProcessWorkObservationStatus.Unavailable };
  }
}

/** Queries detail for the exact occurrence and variable names at the stored hosting address. */
export async function readTemporalProcessWorkDetail(
  client: TemporalProcessWorkClient,
  workflowId: string,
  hostingProcessInstanceId: string,
  request: UserTaskDetailRequest,
): Promise<TemporalProcessWorkDetailResult> {
  const snapshot = snapshotAddress(workflowId, hostingProcessInstanceId);
  const detailRequest = structuredClone(request);
  const handle = workflowClientOf(client).getHandle<BpmnProcessWorkflow>(
    snapshot.workflowId,
  );
  try {
    const detail = await withDeadline(
      handle.query<UserTaskDetail | null, [UserTaskDetailRequest]>(
        bpmnUserTaskDetailQueryName,
        detailRequest,
      ),
      operationDeadlineMs,
      "User Task detail Query",
    );
    return detail === null
      ? { status: TemporalProcessWorkDetailStatus.NotFound }
      : {
          status: TemporalProcessWorkDetailStatus.Found,
          detail: structuredClone(detail),
        };
  } catch (error: unknown) {
    if (!(error instanceof WorkflowNotFoundError)) {
      return { status: TemporalProcessWorkDetailStatus.Unavailable };
    }
    const absence = await classifyAbsence(
      handle,
      snapshot.hostingProcessInstanceId,
    );
    switch (absence) {
      case TemporalProcessWorkObservationStatus.Closed:
        return { status: TemporalProcessWorkDetailStatus.Closed };
      case TemporalProcessWorkObservationStatus.Unknown:
        return { status: TemporalProcessWorkDetailStatus.Unknown };
      case TemporalProcessWorkObservationStatus.Unavailable:
        return { status: TemporalProcessWorkDetailStatus.Unavailable };
    }
  }
}

/** Submits the existing content-bound completion against the exact hosting Workflow address. */
export function completeTemporalProcessWork(
  client: TemporalProcessWorkClient,
  workflowId: string,
  hostingProcessInstanceId: string,
  stimulus: CompleteUserTaskInstanceStimulus,
): Promise<ProcessCommandResult> {
  const snapshot = snapshotAddress(workflowId, hostingProcessInstanceId);
  return submitUserTaskCompletionAtWorkflowId(
    workflowClientOf(client),
    snapshot.workflowId,
    snapshot.hostingProcessInstanceId,
    structuredClone(stimulus),
  );
}

async function resolveObservationAbsence(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  hostingProcessInstanceId: string,
): Promise<TemporalProcessWorkObservationResult> {
  const status = await classifyAbsence(handle, hostingProcessInstanceId);
  return { status };
}

async function classifyAbsence(
  handle: WorkflowHandle<BpmnProcessWorkflow>,
  hostingProcessInstanceId: string,
): Promise<
  | TemporalProcessWorkObservationStatus.Closed
  | TemporalProcessWorkObservationStatus.Unknown
  | TemporalProcessWorkObservationStatus.Unavailable
> {
  try {
    const receipt = requireTerminalProcessReceipt(
      await withDeadline(
        handle.result(),
        operationDeadlineMs,
        "retained completed Process receipt",
      ),
    );
    return receipt.processInstanceId === hostingProcessInstanceId
      ? TemporalProcessWorkObservationStatus.Closed
      : TemporalProcessWorkObservationStatus.Unavailable;
  } catch (error: unknown) {
    return error instanceof WorkflowNotFoundError
      ? TemporalProcessWorkObservationStatus.Unknown
      : TemporalProcessWorkObservationStatus.Unavailable;
  }
}

function snapshotAddress(
  workflowId: string,
  hostingProcessInstanceId: string,
): Readonly<{ workflowId: string; hostingProcessInstanceId: string }> {
  requireNonempty(workflowId, "workflowId");
  requireNonempty(hostingProcessInstanceId, "hostingProcessInstanceId");
  return { workflowId, hostingProcessInstanceId };
}

function workflowClientOf(client: TemporalProcessWorkClient): WorkflowClient {
  const concrete = client as unknown as Readonly<{ workflow?: WorkflowClient }>;
  return concrete.workflow ?? client as unknown as WorkflowClient;
}

function requireNonempty(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${name} must not be empty`);
  }
}
