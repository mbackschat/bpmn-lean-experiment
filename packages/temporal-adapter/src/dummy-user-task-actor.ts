/** Foreground MVP actor that simulates one form read, thinking delay, and exact submission. */
import { setTimeout as hostDelay } from "node:timers/promises";

import {
  StimulusKind,
  compareCanonicalStrings,
  isWellFormedStimulus,
  isWellFormedWireString,
} from "@bpmn-lean/semantic-core";
import type {
  CompleteUserTaskInstanceStimulus,
  DeepReadonly,
  OpenUserTask,
  UserTaskCompletionBinding,
} from "@bpmn-lean/semantic-core";

import type {
  ProcessCommandResult,
  UserTaskDetail,
  UserTaskDetailRequest,
} from "./contracts.js";

export type DummyUserTaskResponse = DeepReadonly<{
  elementId: string;
  delayMs: number;
  inputVariableNames: string[];
  submittedValues: UserTaskCompletionBinding[];
}>;

export type DummyUserTaskActorPort = Readonly<{
  listOpenUserTasks: () => Promise<ReadonlyArray<OpenUserTask>>;
  readUserTaskDetail: (
    request: UserTaskDetailRequest,
  ) => Promise<UserTaskDetail | null>;
  submitCompletion: (
    stimulus: CompleteUserTaskInstanceStimulus,
  ) => Promise<ProcessCommandResult>;
}>;

export const DummyUserTaskActorEventKind = {
  TaskReady: "taskReady",
  DelayStarted: "delayStarted",
  DelayFinished: "delayFinished",
  CompletionResolved: "completionResolved",
} as const;

export type DummyUserTaskActorEvent = DeepReadonly<
  | {
      kind: typeof DummyUserTaskActorEventKind.TaskReady;
      detail: UserTaskDetail;
    }
  | {
      kind: typeof DummyUserTaskActorEventKind.DelayStarted;
      delayMs: number;
    }
  | {
      kind: typeof DummyUserTaskActorEventKind.DelayFinished;
      detail: UserTaskDetail;
    }
  | {
      kind: typeof DummyUserTaskActorEventKind.CompletionResolved;
      result: ProcessCommandResult;
    }
>;

export const DummyUserTaskActorResultKind = {
  Submitted: "submitted",
  Refused: "refused",
} as const;

export const DummyUserTaskRefusalCode = {
  NoOpenUserTask: "noOpenUserTask",
  MultipleOpenUserTasks: "multipleOpenUserTasks",
  UnexpectedElement: "unexpectedElement",
  TaskDetailUnavailable: "taskDetailUnavailable",
  TaskChangedDuringDelay: "taskChangedDuringDelay",
} as const;

export type DummyUserTaskActorResult = DeepReadonly<
  | {
      kind: typeof DummyUserTaskActorResultKind.Submitted;
      detail: UserTaskDetail;
      completion: ProcessCommandResult;
    }
  | {
      kind: typeof DummyUserTaskActorResultKind.Refused;
      code: typeof DummyUserTaskRefusalCode[
        keyof typeof DummyUserTaskRefusalCode
      ];
      evidence: string;
    }
>;

export async function runDummyUserTaskActor(
  response: DummyUserTaskResponse,
  port: DummyUserTaskActorPort,
  wait: (delayMs: number) => Promise<void> = waitForHostDelay,
  observe: (event: DummyUserTaskActorEvent) => void = () => undefined,
): Promise<DummyUserTaskActorResult> {
  requireDummyUserTaskResponse(response);
  const openTasks = await port.listOpenUserTasks();
  const selected = requireSingleConfiguredTask(response, openTasks);
  if ("kind" in selected) {
    return selected;
  }
  const request: UserTaskDetailRequest = {
    taskId: selected.id,
    inputVariableNames: response.inputVariableNames,
  };
  const detail = await port.readUserTaskDetail(request);
  if (detail === null) {
    return refusal(
      DummyUserTaskRefusalCode.TaskDetailUnavailable,
      "Configured User Task was no longer active when its detail was read.",
    );
  }
  observe({ kind: DummyUserTaskActorEventKind.TaskReady, detail });
  observe({
    kind: DummyUserTaskActorEventKind.DelayStarted,
    delayMs: response.delayMs,
  });
  await wait(response.delayMs);
  const [openTasksAfterDelay, detailAfterDelay] = await Promise.all([
    port.listOpenUserTasks(),
    port.readUserTaskDetail(request),
  ]);
  if (
    openTasksAfterDelay.length !== 1 ||
    !sameTask(openTasksAfterDelay[0], selected) ||
    detailAfterDelay === null ||
    !sameTask(detailAfterDelay.task, selected)
  ) {
    return refusal(
      DummyUserTaskRefusalCode.TaskChangedDuringDelay,
      "Configured User Task did not remain the sole exact open task throughout the host delay.",
    );
  }
  observe({
    kind: DummyUserTaskActorEventKind.DelayFinished,
    detail: detailAfterDelay,
  });
  const stimulus: CompleteUserTaskInstanceStimulus = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId:
      `dummy-form-submit:${selected.id.elementId}:${selected.id.activation}`,
    taskId: selected.id,
    submittedValues: response.submittedValues,
  };
  const completion = await port.submitCompletion(stimulus);
  observe({
    kind: DummyUserTaskActorEventKind.CompletionResolved,
    result: completion,
  });
  return {
    kind: DummyUserTaskActorResultKind.Submitted,
    detail,
    completion,
  };
}

function requireSingleConfiguredTask(
  response: DummyUserTaskResponse,
  openTasks: ReadonlyArray<OpenUserTask>,
): OpenUserTask | Extract<
  DummyUserTaskActorResult,
  { kind: typeof DummyUserTaskActorResultKind.Refused }
> {
  if (openTasks.length === 0) {
    return refusal(
      DummyUserTaskRefusalCode.NoOpenUserTask,
      "Dummy actor requires exactly one open User Task; observed 0.",
    );
  }
  if (openTasks.length !== 1) {
    return refusal(
      DummyUserTaskRefusalCode.MultipleOpenUserTasks,
      `Dummy actor requires exactly one open User Task; observed ${openTasks.length}.`,
    );
  }
  const task = openTasks[0];
  if (task === undefined) {
    throw new TypeError("Open User Task projection lost its only occurrence");
  }
  if (task.id.elementId !== response.elementId) {
    return refusal(
      DummyUserTaskRefusalCode.UnexpectedElement,
      `Dummy actor expected ${response.elementId}; observed ${task.id.elementId}.`,
    );
  }
  return task;
}

function requireDummyUserTaskResponse(
  response: DummyUserTaskResponse,
): void {
  if (!isNonEmptyWireString(response.elementId)) {
    throw new TypeError("Dummy actor elementId must be a nonempty wire string");
  }
  if (!Number.isSafeInteger(response.delayMs) || response.delayMs <= 0) {
    throw new RangeError("Dummy actor delayMs must be a positive safe integer");
  }
  requireCanonicalNames(response.inputVariableNames);
  const probe: CompleteUserTaskInstanceStimulus = {
    kind: StimulusKind.CompleteUserTaskInstance,
    commandId: "dummy-form-response-validation",
    taskId: {
      processInstanceId: "dummy-process",
      elementId: response.elementId,
      activation: 1,
    },
    submittedValues: response.submittedValues,
  };
  if (!isWellFormedStimulus(probe)) {
    throw new TypeError(
      "Dummy actor submittedValues must be a canonical string/null patch",
    );
  }
}

function requireCanonicalNames(names: ReadonlyArray<string>): void {
  let previous: string | undefined;
  for (const name of names) {
    if (!isNonEmptyWireString(name)) {
      throw new TypeError(
        "Dummy actor inputVariableNames must contain nonempty wire strings",
      );
    }
    if (
      previous !== undefined &&
      compareCanonicalStrings(previous, name) >= 0
    ) {
      throw new TypeError(
        "Dummy actor inputVariableNames must be unique and canonically ordered",
      );
    }
    previous = name;
  }
}

function isNonEmptyWireString(value: string): boolean {
  return value.length > 0 && isWellFormedWireString(value);
}

function sameTask(
  left: OpenUserTask | undefined,
  right: OpenUserTask,
): boolean {
  return left !== undefined &&
    left.id.processInstanceId === right.id.processInstanceId &&
    left.id.elementId === right.id.elementId &&
    left.id.activation === right.id.activation;
}

function refusal(
  code: typeof DummyUserTaskRefusalCode[
    keyof typeof DummyUserTaskRefusalCode
  ],
  evidence: string,
): Extract<
  DummyUserTaskActorResult,
  { kind: typeof DummyUserTaskActorResultKind.Refused }
> {
  return { kind: DummyUserTaskActorResultKind.Refused, code, evidence };
}

async function waitForHostDelay(delayMs: number): Promise<void> {
  await hostDelay(delayMs);
}
