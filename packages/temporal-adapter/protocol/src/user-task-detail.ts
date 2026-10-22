/** Exact, caller-selected User Task input projection over committed semantic state. */
import {
  ControlStateKind,
  compareCanonicalStrings,
  isWellFormedWireString,
  projectOpenUserTasks,
  sameOccurrenceId,
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
  const waits = state.userTaskWaits.filter(({ id }) => sameOccurrenceId(id, task.id));
  const owner = waits.length === 1 ? waits[0]?.owner : undefined;
  const callerOwned = state.control.kind === ControlStateKind.Running &&
    task.id.processInstanceId === state.control.instanceId &&
    owner?.processInstanceId === state.control.instanceId;
  // CVM-OBSERVE-01: a mapped called task sees only its called-root frame, never a caller binding;
  // a called task without that frame (scalar call data) keeps seeing nothing.
  const calledFrame = !callerOwned && owner?.processInstanceId === task.id.processInstanceId
    ? state.variables.scopes.find(({ owner: frameOwner }) =>
      frameOwner.processInstanceId === owner.processInstanceId &&
      frameOwner.definitionScopeId === owner.definitionScopeId && frameOwner.activation === owner.activation)
    : undefined;
  const visible = callerOwned ? state.variables.process.bindings : calledFrame?.bindings ?? [];
  return {
    task,
    inputVariables: visible.filter(({ name }) => selectedNames.has(name)),
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
