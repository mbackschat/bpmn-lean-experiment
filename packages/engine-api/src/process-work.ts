/**
 * Human work: the open User Task waits of a process, one task's detail with selected process variables, and task
 * completion as the kernel's `completeUserTask` command on the task's occurrence.
 */
import { requireWireString, type EngineBinding, type EngineOccurrenceId, type JsonValue } from "./common.js";
import type { EngineHost } from "./host.js";
import {
  ObservedKind,
  observeProcess,
  requireOccurrence,
  sameOccurrence,
  submitCommand,
  waitsWithDetail,
  type EngineCommandResult,
  type EngineOpenWait,
} from "./process-observation.js";
import { parseEngineProcessLocator, type EngineProcessLocator } from "./process-locator.js";

/** The canonical result's detail form of a User Task wait. */
const userTaskDetail = "userTask";

export enum EngineOpenWorkStatus {
  Open = "open",
  Closed = "closed",
  Unknown = "unknown",
  Unavailable = "unavailable",
}

export type EngineOpenWorkResult =
  | Readonly<{ status: EngineOpenWorkStatus.Open; openUserTasks: readonly EngineOpenWait[] }>
  | Readonly<{ status: EngineOpenWorkStatus.Closed | EngineOpenWorkStatus.Unknown | EngineOpenWorkStatus.Unavailable }>;

export enum EngineWorkDetailStatus {
  Found = "found",
  NotFound = "notFound",
  Closed = "closed",
  Unknown = "unknown",
  Unavailable = "unavailable",
}

export type EngineWorkDetail = Readonly<{ task: EngineOpenWait; inputVariables: readonly EngineBinding[] }>;

export type EngineWorkDetailResult =
  | Readonly<{ status: EngineWorkDetailStatus.Found; detail: EngineWorkDetail }>
  | Readonly<{
      status: EngineWorkDetailStatus.NotFound | EngineWorkDetailStatus.Closed | EngineWorkDetailStatus.Unknown |
        EngineWorkDetailStatus.Unavailable;
    }>;

/** `hostingProcessInstanceId` is the instance the locator was minted for; a chain hosting another one is unknown. */
export type EngineOpenWorkRequest = Readonly<{
  host: EngineHost;
  locator: EngineProcessLocator;
  hostingProcessInstanceId: string;
}>;

export type EngineWorkDetailRequest = EngineOpenWorkRequest & Readonly<{
  taskId: EngineOccurrenceId;
  inputVariableNames: readonly string[];
}>;

export type EngineWorkCompletion = Readonly<{
  commandId: string;
  taskId: EngineOccurrenceId;
  values: readonly EngineBinding[];
}>;

export type EngineCompleteWorkRequest = EngineOpenWorkRequest & Readonly<{ completion: EngineWorkCompletion }>;

export async function observeOpenWork(request: EngineOpenWorkRequest): Promise<EngineOpenWorkResult> {
  const observed = await observeProcess(request.host, parseEngineProcessLocator(request.locator), request.hostingProcessInstanceId);
  switch (observed.kind) {
    case ObservedKind.Running:
      return { status: EngineOpenWorkStatus.Open, openUserTasks: waitsWithDetail(observed.state, userTaskDetail) };
    case ObservedKind.Closed:
      return { status: EngineOpenWorkStatus.Closed };
    case ObservedKind.Unknown:
      return { status: EngineOpenWorkStatus.Unknown };
    case ObservedKind.Unavailable:
      return { status: EngineOpenWorkStatus.Unavailable };
  }
}

/** The task's detail and, in the requested order, those requested instance variables the instance has. */
export async function readWorkDetail(request: EngineWorkDetailRequest): Promise<EngineWorkDetailResult> {
  const taskId = requireOccurrence(request.taskId, "taskId");
  const names = request.inputVariableNames.map((name) => requireWireString(name, "inputVariableNames"));
  const observed = await observeProcess(request.host, parseEngineProcessLocator(request.locator), request.hostingProcessInstanceId);
  switch (observed.kind) {
    case ObservedKind.Running: {
      const task = waitsWithDetail(observed.state, userTaskDetail).find((wait) => sameOccurrence(wait.id, taskId));
      if (task === undefined) return { status: EngineWorkDetailStatus.NotFound };
      const variables = observed.state.variables;
      const inputVariables = names.flatMap((name) => variables.filter((binding) => binding.name === name));
      return { status: EngineWorkDetailStatus.Found, detail: { task, inputVariables } };
    }
    case ObservedKind.Closed:
      return { status: EngineWorkDetailStatus.Closed };
    case ObservedKind.Unknown:
      return { status: EngineWorkDetailStatus.Unknown };
    case ObservedKind.Unavailable:
      return { status: EngineWorkDetailStatus.Unavailable };
  }
}

/** Completes the task with the submitted values; the kernel judges the command against the current state. */
export function completeWork(request: EngineCompleteWorkRequest): Promise<EngineCommandResult> {
  const taskId = requireOccurrence(request.completion.taskId, "taskId");
  const values = request.completion.values.map((binding) => ({
    name: requireWireString(binding.name, "values.name"),
    value: structuredClone(binding.value),
  }));
  return submitCommand(request.host, parseEngineProcessLocator(request.locator), request.hostingProcessInstanceId, {
    kind: "command",
    commandId: requireWireString(request.completion.commandId, "commandId"),
    occurrence: taskId,
    action: { kind: "completeUserTask", values: values as unknown as JsonValue },
  });
}
