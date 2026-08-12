import {
  decodePublicProcessInstanceIdentity,
  decodePublicWorkTaskId,
  decodeWorkAuditEvent,
  decodeWorkCompletionResult,
} from "@bpmn-lean/platform-contracts";
import type {
  PublicProcessInstanceIdentity,
  WorkAuditEvent,
  WorkCompletionResult,
} from "@bpmn-lean/platform-contracts";
import {
  WorkRepositoryStoredValueError,
} from "./work-contracts.js";
import type {
  ConfirmedProcessWorkPublication,
  StoredWorkCompletionAction,
  WorkCompletionBinding,
  WorkCompletionOutcome,
  WorkProcessObservation,
  WorkTaskReference,
} from "./work-contracts.js";

const observations = new Set<WorkProcessObservation>([
  "active",
  "closed",
  "indeterminate",
]);
const completionStates = new Set([
  "reserved",
  "submitting",
  "committed",
  "rejected",
  "indeterminate",
]);

export function snapshotPublication(
  publication: ConfirmedProcessWorkPublication,
): ConfirmedProcessWorkPublication {
  requireExactKeys(publication, "confirmed Work publication", ["instance", "locator"]);
  return {
    instance: decodePublicProcessInstanceIdentity(publication.instance),
    locator: requireString(publication.locator, "locator"),
  };
}

export function decodeStoredPublicInstance(value: unknown): PublicProcessInstanceIdentity {
  return decodePublicProcessInstanceIdentity(parseStoredJson(value, "public_instance_json"));
}

export function snapshotTaskReference(task: WorkTaskReference): WorkTaskReference {
  requireExactKeys(task, "Work task reference", ["hostingProcessInstanceId", "taskId"]);
  return {
    hostingProcessInstanceId: requireString(
      task.hostingProcessInstanceId,
      "hostingProcessInstanceId",
    ),
    taskId: decodePublicWorkTaskId(task.taskId, "Work task reference.taskId"),
  };
}

export function snapshotCompletionBinding(
  binding: WorkCompletionBinding,
): WorkCompletionBinding {
  requireExactKeys(binding, "Work completion binding", [
    "actionId",
    "actorId",
    "claimGeneration",
    "submittedField",
    "task",
  ]);
  const submittedField = snapshotSubmittedField(binding.submittedField);
  return {
    actionId: requireString(binding.actionId, "completion actionId"),
    actorId: requireString(binding.actorId, "completion actorId"),
    task: snapshotTaskReference(binding.task),
    claimGeneration: requireNonnegativeSafeInteger(
      binding.claimGeneration,
      "completion claimGeneration",
    ),
    submittedField,
  };
}

function snapshotSubmittedField(
  field: WorkCompletionBinding["submittedField"],
): WorkCompletionBinding["submittedField"] {
  requireExactKeys(field, "submitted field", ["declaredType", "key", "value"]);
  const key = requireString(field.key, "submitted field key");
  if (field.declaredType === "string") {
    requireExactKeys(field.value, "submitted string value", ["kind", "value"]);
    if (field.value.kind !== "string") {
      throw new TypeError("submitted string field must carry a string value");
    }
    return {
      key,
      declaredType: "string",
      value: {
        kind: "string",
        value: requireWireString(field.value.value, "submitted string value"),
      },
    };
  }
  if (field.declaredType === "boolean") {
    requireExactKeys(field.value, "submitted Boolean value", ["kind", "value"]);
    if (field.value.kind !== "boolean" || typeof field.value.value !== "boolean") {
      throw new TypeError("submitted Boolean field must carry a Boolean value");
    }
    return {
      key,
      declaredType: "boolean",
      value: { kind: "boolean", value: field.value.value },
    };
  }
  throw new TypeError("submitted field declaredType is unsupported");
}

export function snapshotAuditEvent(event: WorkAuditEvent): WorkAuditEvent {
  return decodeWorkAuditEvent(structuredClone(event));
}

export function requireAuditMatches(
  event: WorkAuditEvent,
  expected: Readonly<{
    actorId: string;
    task: WorkTaskReference;
    actionId: string;
    kind: "claim" | "release" | "completion";
    outcome: string;
  }>,
): void {
  if (
    event.actorId !== expected.actorId ||
    event.hostingProcessInstanceId !== expected.task.hostingProcessInstanceId ||
    !sameJson(event.taskId, expected.task.taskId) ||
    event.action.actionId !== expected.actionId ||
    event.action.kind !== expected.kind ||
    event.action.outcome !== expected.outcome
  ) {
    throw new TypeError("Work audit event does not match its repository transition");
  }
}

export function completionResult(
  binding: WorkCompletionBinding,
  outcome: WorkCompletionOutcome,
): WorkCompletionResult {
  switch (outcome.kind) {
    case "committed":
      return {
        state: "committed",
        actionId: binding.actionId,
        taskId: binding.task.taskId,
      };
    case "semanticRejected":
      return {
        state: "rejected",
        actionId: binding.actionId,
        taskId: binding.task.taskId,
        engineResult: { kind: "semantic", outcome: outcome.outcome },
      };
    case "processClosed":
      return {
        state: "rejected",
        actionId: binding.actionId,
        taskId: binding.task.taskId,
        engineResult: { kind: "processClosed" },
      };
    case "indeterminate":
      return {
        state: "indeterminate",
        actionId: binding.actionId,
        taskId: binding.task.taskId,
      };
  }
}

export function decodeStoredCompletionAction(
  bindingJson: unknown,
  stateValue: unknown,
  resultJson: unknown,
): StoredWorkCompletionAction {
  try {
    const binding = snapshotCompletionBinding(
      parseStoredJson(bindingJson, "binding_json") as WorkCompletionBinding,
    );
    const state = requireCompletionState(stateValue);
    const result = resultJson === null
      ? null
      : decodeWorkCompletionResult(parseStoredJson(resultJson, "result_json"));
    if (
      (state === "committed" && result?.state !== "committed") ||
      (state === "rejected" && result?.state !== "rejected") ||
      (state === "indeterminate" && result?.state !== "indeterminate") ||
      ((state === "reserved" || state === "submitting") &&
        result !== null && result.state !== "indeterminate") ||
      (result !== null &&
        (result.actionId !== binding.actionId || !sameJson(result.taskId, binding.task.taskId)))
    ) {
      throw new TypeError("stored completion result disagrees with its lifecycle state");
    }
    return { binding, state, result };
  } catch (error: unknown) {
    if (error instanceof WorkRepositoryStoredValueError) throw error;
    throw new WorkRepositoryStoredValueError(error);
  }
}

export function requireObservation(value: unknown): WorkProcessObservation {
  if (typeof value !== "string" || !observations.has(value as WorkProcessObservation)) {
    throw new TypeError("Work observation classification is invalid");
  }
  return value as WorkProcessObservation;
}

export function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || !value.isWellFormed()) {
    throw new TypeError(`${label} must be nonempty well-formed Unicode`);
  }
  return value;
}

export function requireWireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.isWellFormed()) {
    throw new TypeError(`${label} must be well-formed Unicode`);
  }
  return value;
}

export function requireNonnegativeSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

export function requirePositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value === "bigint") value = Number(value);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function parseStoredJson(value: unknown, label: string): unknown {
  try {
    return JSON.parse(requireString(value, label));
  } catch (error: unknown) {
    throw new WorkRepositoryStoredValueError(error);
  }
}

function requireCompletionState(value: unknown): StoredWorkCompletionAction["state"] {
  if (typeof value !== "string" || !completionStates.has(value)) {
    throw new TypeError("stored completion state is invalid");
  }
  return value as StoredWorkCompletionAction["state"];
}

function requireExactKeys(
  value: unknown,
  label: string,
  expected: readonly string[],
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (!sameJson(actual, sortedExpected)) {
    throw new TypeError(`${label} has a nonexact field set`);
  }
}
