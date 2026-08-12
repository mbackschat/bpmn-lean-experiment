/** Product 1 ownership of opaque Process Work addresses and narrowed task operations. */
import type {
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  UserTaskInstanceId,
  VariableBinding,
} from "@bpmn-lean/semantic-core";
import {
  VariableValueKind,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import {
  TemporalProcessWorkDetailStatus,
  TemporalProcessWorkObservationStatus,
  completeTemporalProcessWork,
  observeTemporalProcessWork,
  readTemporalProcessWorkDetail,
  temporalCanonicalProcessWorkAddress,
} from "@bpmn-lean/temporal-client/process-work";
import type {
  ProcessCommandResult,
  TemporalProcessWorkClient,
  UserTaskDetail,
} from "@bpmn-lean/temporal-client/process-work";

const locatorPrefix = "bpmn-process-work-v1:";
declare const engineProcessWorkLocatorBrand: unique symbol;

/** Opaque, privately persisted address token interpreted only by Product 1 operations. */
export type EngineProcessWorkLocator = string & Readonly<{
  [engineProcessWorkLocatorBrand]: "EngineProcessWorkLocator";
}>;

export enum EngineOpenWorkStatus {
  Open = "open",
  Closed = "closed",
  Unknown = "unknown",
  Unavailable = "unavailable",
}

export type EngineOpenWorkResult =
  | Readonly<{
      status: EngineOpenWorkStatus.Open;
      openUserTasks: readonly OpenUserTask[];
    }>
  | Readonly<{
      status:
        | EngineOpenWorkStatus.Closed
        | EngineOpenWorkStatus.Unknown
        | EngineOpenWorkStatus.Unavailable;
    }>;

export enum EngineWorkDetailStatus {
  Found = "found",
  NotFound = "notFound",
  Closed = "closed",
  Unknown = "unknown",
  Unavailable = "unavailable",
}

export type EngineWorkDetailResult =
  | Readonly<{
      status: EngineWorkDetailStatus.Found;
      detail: UserTaskDetail;
    }>
  | Readonly<{
      status:
        | EngineWorkDetailStatus.NotFound
        | EngineWorkDetailStatus.Closed
        | EngineWorkDetailStatus.Unknown
        | EngineWorkDetailStatus.Unavailable;
    }>;

export type EngineOpenWorkRequest = Readonly<{
  temporalClient: TemporalProcessWorkClient;
  locator: EngineProcessWorkLocator;
  hostingProcessInstanceId: string;
}>;

export type EngineWorkDetailRequest = EngineOpenWorkRequest & Readonly<{
  taskId: UserTaskInstanceId;
  inputVariableNames: readonly string[];
}>;

export type EngineCompleteWorkRequest = EngineOpenWorkRequest & Readonly<{
  stimulus: CompleteUserTaskInstanceStimulus;
}>;

/** Mints the canonical direct or Message Start locator from semantic Process identity. */
export function engineProcessWorkLocatorForCanonicalProcess(
  processInstanceId: string,
): EngineProcessWorkLocator {
  requireNonemptyWireString(processInstanceId, "processInstanceId");
  return locatorForWorkflowId(
    temporalCanonicalProcessWorkAddress(processInstanceId),
  );
}

/** Mints a Timer Schedule locator only from the service-returned execution Workflow ID. */
export function engineProcessWorkLocatorForScheduleExecution(
  executionWorkflowId: string,
): EngineProcessWorkLocator {
  return locatorForWorkflowId(
    requireNonemptyWireString(executionWorkflowId, "executionWorkflowId"),
  );
}

/** Returns the exact stable private token for durable Definitions persistence. */
export function serializeEngineProcessWorkLocator(
  locator: EngineProcessWorkLocator,
): string {
  requireLocator(locator);
  return locator;
}

/** Strictly restores one canonical locator token from private persistence. */
export function parseEngineProcessWorkLocator(
  serialized: string,
): EngineProcessWorkLocator {
  requireLocator(serialized);
  return serialized as EngineProcessWorkLocator;
}

/** Reads the exact committed open User Task set without exposing host addressing. */
export async function observeOpenWork(
  request: EngineOpenWorkRequest,
): Promise<EngineOpenWorkResult> {
  const snapshot = snapshotBaseRequest(request);
  const observed = await observeTemporalProcessWork(
    snapshot.temporalClient,
    workflowIdFromLocator(snapshot.locator),
    snapshot.hostingProcessInstanceId,
  );
  switch (observed.status) {
    case TemporalProcessWorkObservationStatus.Open:
      return {
        status: EngineOpenWorkStatus.Open,
        openUserTasks: observed.openUserTasks,
      };
    case TemporalProcessWorkObservationStatus.Closed:
      return { status: EngineOpenWorkStatus.Closed };
    case TemporalProcessWorkObservationStatus.Unknown:
      return { status: EngineOpenWorkStatus.Unknown };
    case TemporalProcessWorkObservationStatus.Unavailable:
      return { status: EngineOpenWorkStatus.Unavailable };
  }
}

/** Reads exact task detail and requested Process variables at the stored hosting address. */
export async function readWorkDetail(
  request: EngineWorkDetailRequest,
): Promise<EngineWorkDetailResult> {
  const snapshot = snapshotBaseRequest(request);
  const described = await readTemporalProcessWorkDetail(
    snapshot.temporalClient,
    workflowIdFromLocator(snapshot.locator),
    snapshot.hostingProcessInstanceId,
    {
      taskId: cloneTaskId(request.taskId),
      inputVariableNames: [...request.inputVariableNames],
    },
  );
  switch (described.status) {
    case TemporalProcessWorkDetailStatus.Found:
      return { status: EngineWorkDetailStatus.Found, detail: described.detail };
    case TemporalProcessWorkDetailStatus.NotFound:
      return { status: EngineWorkDetailStatus.NotFound };
    case TemporalProcessWorkDetailStatus.Closed:
      return { status: EngineWorkDetailStatus.Closed };
    case TemporalProcessWorkDetailStatus.Unknown:
      return { status: EngineWorkDetailStatus.Unknown };
    case TemporalProcessWorkDetailStatus.Unavailable:
      return { status: EngineWorkDetailStatus.Unavailable };
  }
}

/** Submits the exact existing content-bound task completion through the private locator. */
export function completeWork(
  request: EngineCompleteWorkRequest,
): Promise<ProcessCommandResult> {
  const snapshot = snapshotBaseRequest(request);
  return completeTemporalProcessWork(
    snapshot.temporalClient,
    workflowIdFromLocator(snapshot.locator),
    snapshot.hostingProcessInstanceId,
    cloneCompletion(request.stimulus),
  );
}

function locatorForWorkflowId(workflowId: string): EngineProcessWorkLocator {
  requireNonemptyWireString(workflowId, "workflowId");
  return `${locatorPrefix}${encodeURIComponent(workflowId)}` as
    EngineProcessWorkLocator;
}

function workflowIdFromLocator(locator: EngineProcessWorkLocator): string {
  requireLocator(locator);
  return decodeURIComponent(locator.slice(locatorPrefix.length));
}

function requireLocator(value: string): void {
  if (typeof value !== "string" || !value.startsWith(locatorPrefix)) {
    throw new TypeError("Engine Process Work locator is not a canonical v1 token");
  }
  const encoded = value.slice(locatorPrefix.length);
  let workflowId: string;
  try {
    workflowId = decodeURIComponent(encoded);
  } catch {
    throw new TypeError("Engine Process Work locator is not a canonical v1 token");
  }
  if (
    workflowId.length === 0 ||
    !isWellFormedWireString(workflowId) ||
    encodeURIComponent(workflowId) !== encoded
  ) {
    throw new TypeError("Engine Process Work locator is not a canonical v1 token");
  }
}

function snapshotBaseRequest(
  request: EngineOpenWorkRequest,
): EngineOpenWorkRequest {
  requireLocator(request.locator);
  requireNonemptyWireString(
    request.hostingProcessInstanceId,
    "hostingProcessInstanceId",
  );
  return {
    temporalClient: request.temporalClient,
    locator: request.locator,
    hostingProcessInstanceId: request.hostingProcessInstanceId,
  };
}

function requireNonemptyWireString(value: string, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    !isWellFormedWireString(value)
  ) {
    throw new TypeError(`${name} must be a nonempty well-formed Unicode string`);
  }
  return value;
}

function cloneCompletion(
  stimulus: CompleteUserTaskInstanceStimulus,
): CompleteUserTaskInstanceStimulus {
  return {
    kind: stimulus.kind,
    commandId: stimulus.commandId,
    taskId: cloneTaskId(stimulus.taskId),
    submittedValues: stimulus.submittedValues.map(cloneVariableBinding),
  };
}

function cloneTaskId(taskId: UserTaskInstanceId): UserTaskInstanceId {
  return {
    processInstanceId: taskId.processInstanceId,
    elementId: taskId.elementId,
    activation: taskId.activation,
  };
}

function cloneVariableBinding(binding: VariableBinding): VariableBinding {
  switch (binding.value.kind) {
    case VariableValueKind.Null:
      return { name: binding.name, value: { kind: binding.value.kind } };
    case VariableValueKind.Boolean:
      return {
        name: binding.name,
        value: { kind: binding.value.kind, value: binding.value.value },
      };
    case VariableValueKind.String:
      return {
        name: binding.name,
        value: { kind: binding.value.kind, value: binding.value.value },
      };
  }
}
