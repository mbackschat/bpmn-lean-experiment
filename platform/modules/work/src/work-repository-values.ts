import {
  decodePublicProcessInstanceIdentity,
  decodePublicFormValue,
  decodePublicWorkTaskId,
  decodeWorkAuditEvent,
  decodeWorkClaimResult,
  decodeWorkCompletionResult,
  decodeWorkReleaseResult,
  parseStrictJson,
  workCompletionCanonicalJsonByteLength,
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
  LegacyWorkCompletionBinding,
  StoredWorkClaimReleaseAction,
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
  const common = snapshotCompletionBindingBase(binding);
  if ("submittedField" in binding) {
    requireExactKeys(binding, "Work completion binding", [
      "actionId",
      "actorId",
      "claimGeneration",
      "submittedField",
      "task",
    ]);
    return { ...common, submittedField: snapshotSubmittedField(binding.submittedField) };
  }
  requireExactKeys(binding, "Work completion binding", [
    "actionId",
    "actorId",
    "claimGeneration",
    "structuredCompletion",
    "task",
  ]);
  return {
    ...common,
    structuredCompletion: snapshotStructuredCompletion(binding.structuredCompletion),
  };
}

function snapshotCompletionBindingBase(binding: WorkCompletionBinding) {
  return {
    actionId: requireString(binding.actionId, "completion actionId"),
    actorId: requireString(binding.actorId, "completion actorId"),
    task: snapshotTaskReference(binding.task),
    claimGeneration: requireNonnegativeSafeInteger(
      binding.claimGeneration,
      "completion claimGeneration",
    ),
  };
}

function snapshotStructuredCompletion(
  completion: Extract<WorkCompletionBinding, { structuredCompletion: unknown }>["structuredCompletion"],
): Extract<WorkCompletionBinding, { structuredCompletion: unknown }>["structuredCompletion"] {
  requireExactKeys(completion, "structured completion", [
    "catalogIdentity",
    "resolutionActionId",
    "submittedValues",
  ]);
  const identity = completion.catalogIdentity;
  requireExactKeys(identity, "structured completion catalog identity", [
    "processId",
    "semanticProfile",
    "sourceSha256",
    "version",
  ]);
  const sourceSha256 = requireString(identity.sourceSha256, "catalog sourceSha256");
  if (!/^[0-9a-f]{64}$/u.test(sourceSha256)) {
    throw new TypeError("catalog sourceSha256 must be lowercase SHA-256");
  }
  if (!Array.isArray(completion.submittedValues) || completion.submittedValues.length === 0) {
    throw new TypeError("structured completion patch must be nonempty");
  }
  const submittedValues = completion.submittedValues.map((binding, index) => {
    requireExactKeys(binding, `structured completion binding ${index}`, ["key", "value"]);
    const value = decodePublicFormValue(binding.value, `structured completion binding ${index}.value`);
    if (value.kind === "absent") {
      throw new TypeError("structured completion patch cannot contain absent");
    }
    const exact = { key: requireString(binding.key, "structured completion key"), value };
    if (workCompletionCanonicalJsonByteLength(value) > 16_384 ||
        workCompletionCanonicalJsonByteLength(exact) > 20_480) {
      throw new TypeError("structured completion binding exceeds its canonical ceiling");
    }
    return exact;
  });
  for (let index = 1; index < submittedValues.length; index += 1) {
    if (compareStrings(submittedValues[index - 1]!.key, submittedValues[index]!.key) >= 0) {
      throw new TypeError("structured completion patch must be canonically ordered and unique");
    }
  }
  if (workCompletionCanonicalJsonByteLength(submittedValues) > 65_536) {
    throw new TypeError("structured completion patch exceeds its canonical ceiling");
  }
  return {
    catalogIdentity: {
      processId: requireString(identity.processId, "catalog processId"),
      version: requirePositiveSafeInteger(identity.version, "catalog version"),
      sourceSha256,
      semanticProfile: requireString(identity.semanticProfile, "catalog semanticProfile"),
    },
    resolutionActionId: requireString(
      completion.resolutionActionId,
      "structured completion resolutionActionId",
    ),
    submittedValues,
  };
}

function snapshotSubmittedField(
  field: LegacyWorkCompletionBinding["submittedField"],
): LegacyWorkCompletionBinding["submittedField"] {
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

export function decodeStoredClaimReleaseAction(
  actionIdValue: unknown,
  kindValue: unknown,
  actorIdValue: unknown,
  hostingProcessInstanceIdValue: unknown,
  taskProcessInstanceIdValue: unknown,
  elementIdValue: unknown,
  activationValue: unknown,
  generationValue: unknown,
  resultJson: unknown,
): StoredWorkClaimReleaseAction {
  try {
    const actionId = requireString(actionIdValue, "stored action_id");
    const actorId = requireString(actorIdValue, "stored action actor_id");
    const task = snapshotTaskReference({
      hostingProcessInstanceId: requireString(
        hostingProcessInstanceIdValue,
        "stored action hosting_process_instance_id",
      ),
      taskId: {
        processInstanceId: requireString(
          taskProcessInstanceIdValue,
          "stored action task_process_instance_id",
        ),
        elementId: requireString(elementIdValue, "stored action element_id"),
        activation: requirePositiveSafeInteger(
          activationValue,
          "stored action activation",
        ),
      },
    });
    const generation = requireNonnegativeSafeInteger(
      generationValue,
      "stored action input_generation",
    );
    const parsedResult = parseStoredJson(resultJson, "stored action result_json");
    switch (kindValue) {
      case "claim": {
        const result = decodeWorkClaimResult(parsedResult);
        if (
          !sameJson(result.taskId, task.taskId) ||
          result.claim.actorId !== actorId ||
          result.claim.generation !== generation + 1
        ) {
          throw new TypeError("stored claim result disagrees with its binding");
        }
        return {
          binding: { actionId, actorId, task, kind: "claim", expectedGeneration: generation },
          result,
        };
      }
      case "release": {
        const result = decodeWorkReleaseResult(parsedResult);
        if (
          !sameJson(result.taskId, task.taskId) ||
          result.claimGeneration !== generation + 1 ||
          result.released !== true
        ) {
          throw new TypeError("stored release result disagrees with its binding");
        }
        return {
          binding: { actionId, actorId, task, kind: "release", generation },
          result,
        };
      }
      default:
        throw new TypeError("stored action kind is invalid");
    }
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
    return parseStrictJson(new TextEncoder().encode(requireString(value, label)));
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

function compareStrings(left: string, right: string): number {
  const leftScalars = [...left];
  const rightScalars = [...right];
  for (let index = 0; index < Math.min(leftScalars.length, rightScalars.length); index += 1) {
    const difference = Number(leftScalars[index]?.codePointAt(0)) -
      Number(rightScalars[index]?.codePointAt(0));
    if (difference !== 0) return difference;
  }
  return leftScalars.length - rightScalars.length;
}
