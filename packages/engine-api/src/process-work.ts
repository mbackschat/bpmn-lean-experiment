/** Product 1 ownership of opaque Process Work addresses and narrowed task operations. */
import type {
  CompleteUserTaskInstanceStimulus,
  OpenUserTask,
  UserTaskInstanceId,
} from "@bpmn-lean/semantic-core";
import {
  StimulusKind,
  cloneVariableBinding,
  isWellFormedStimulus,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import {
  TemporalProcessWorkDetailStatus,
  TemporalProcessWorkObservationStatus,
  completeTemporalProcessWork,
  observeTemporalProcessWork,
  readTemporalProcessWorkDetail,
} from "@bpmn-lean/temporal-client/process-work";
import type {
  ProcessCommandResult,
  TemporalProcessWorkClient,
  UserTaskDetail,
} from "@bpmn-lean/temporal-client/process-work";
import {
  engineProcessWorkflowIdFromLocator,
  parseEngineProcessLocator,
} from "./process-locator.js";
import type { EngineProcessLocator } from "./process-locator.js";

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
  locator: EngineProcessLocator;
  hostingProcessInstanceId: string;
}>;

export type EngineWorkDetailRequest = EngineOpenWorkRequest & Readonly<{
  taskId: UserTaskInstanceId;
  inputVariableNames: readonly string[];
}>;

export type EngineWorkCompletionStimulus = Omit<
  CompleteUserTaskInstanceStimulus,
  "kind"
> & Readonly<{
  kind: "completeUserTaskInstance";
}>;

export type EngineCompleteWorkRequest = EngineOpenWorkRequest & Readonly<{
  stimulus: EngineWorkCompletionStimulus;
}>;

/** Reads the exact committed open User Task set without exposing host addressing. */
export async function observeOpenWork(
  request: EngineOpenWorkRequest,
): Promise<EngineOpenWorkResult> {
  const snapshot = snapshotBaseRequest(request);
  const observed = await observeTemporalProcessWork(
    snapshot.temporalClient,
    engineProcessWorkflowIdFromLocator(snapshot.locator),
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
    engineProcessWorkflowIdFromLocator(snapshot.locator),
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
    engineProcessWorkflowIdFromLocator(snapshot.locator),
    snapshot.hostingProcessInstanceId,
    cloneCompletion(request.stimulus),
  );
}

function snapshotBaseRequest(
  request: EngineOpenWorkRequest,
): EngineOpenWorkRequest {
  const locator = parseEngineProcessLocator(request.locator);
  requireNonemptyWireString(
    request.hostingProcessInstanceId,
    "hostingProcessInstanceId",
  );
  return {
    temporalClient: request.temporalClient,
    locator,
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
  stimulus: EngineWorkCompletionStimulus,
): CompleteUserTaskInstanceStimulus {
  if (!isWellFormedStimulus(stimulus)) {
    throw new TypeError("Expected one well-formed completion stimulus");
  }
  return {
    kind: StimulusKind.CompleteUserTaskInstance,
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
