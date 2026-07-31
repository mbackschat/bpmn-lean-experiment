/** Exact, caller-selected User Task input projection over committed semantic state. */
import {
  compareCanonicalStrings,
  isWellFormedWireString,
  projectOpenUserTasks,
} from "@bpmn-lean/semantic-core";
import type {
  RuntimeState,
} from "@bpmn-lean/semantic-core";

import type {
  UserTaskDetail,
  UserTaskDetailRequest,
} from "./contracts.js";

export function projectUserTaskDetail(
  state: RuntimeState,
  request: UserTaskDetailRequest,
): UserTaskDetail | null {
  requireUserTaskDetailRequest(request);
  const task = projectOpenUserTasks(state).find(
    ({ id }) =>
      id.processInstanceId === request.taskId.processInstanceId &&
      id.elementId === request.taskId.elementId &&
      id.activation === request.taskId.activation,
  );
  if (task === undefined) {
    return null;
  }
  const selectedNames = new Set(request.inputVariableNames);
  return {
    task,
    inputVariables: state.variables.process.bindings.filter(
      ({ name }) => selectedNames.has(name),
    ),
  };
}

export function requireUserTaskDetailRequest(
  value: unknown,
): asserts value is UserTaskDetailRequest {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["taskId", "inputVariableNames"]) ||
    !isOccurrenceId(value.taskId) ||
    !Array.isArray(value.inputVariableNames) ||
    !isCanonicalNameList(value.inputVariableNames)
  ) {
    throw new TypeError(
      "User Task detail request must contain one exact task and canonical input-variable names",
    );
  }
}

function isOccurrenceId(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, ["processInstanceId", "elementId", "activation"]) &&
    isNonEmptyWireString(value.processInstanceId) &&
    isNonEmptyWireString(value.elementId) &&
    Number.isSafeInteger(value.activation) &&
    Number(value.activation) >= 1;
}

function isCanonicalNameList(value: ReadonlyArray<unknown>): boolean {
  let previous: string | undefined;
  for (const candidate of value) {
    if (!isNonEmptyWireString(candidate)) {
      return false;
    }
    if (
      previous !== undefined &&
      compareCanonicalStrings(previous, candidate) >= 0
    ) {
      return false;
    }
    previous = candidate;
  }
  return true;
}

function isNonEmptyWireString(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    isWellFormedWireString(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): boolean {
  const expected = new Set(keys);
  return Object.keys(value).length === expected.size &&
    Object.keys(value).every((key) => expected.has(key));
}
