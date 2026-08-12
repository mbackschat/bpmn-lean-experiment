import {
  readOwn,
  requireExactKeys,
  requireNonemptyString,
  requireNonnegativeSafeInteger,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import { decodePublicProcessInstanceIdentity } from "./process-instance-decoders.js";
import type {
  PublicFormField,
  PublicFormValue,
  PublicTaskDetail,
  PublicWorkTask,
  PublicWorkTaskId,
  PublicWorkTaskMetadata,
  WorkAuditAction,
  WorkAuditEvent,
  WorkAuditPage,
  WorkClaimRequest,
  WorkClaimResult,
  WorkCompletionRequest,
  WorkCompletionResult,
  WorkReleaseResult,
  WorkTaskSnapshot,
} from "./work-tasks.js";

const opaqueAuditCursor = /^v1\.[A-Za-z0-9_-]+$/u;
const canonicalUtcInstant =
  /^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\.[0-9]{3}Z$/u;

/** Decodes one exact current actor-visible task and refuses every private host field. */
export function decodePublicWorkTask(
  value: unknown,
  label = "work task",
): PublicWorkTask {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "claim",
    "claimGeneration",
    "claimableByCurrentActor",
    "hostingInstance",
    "task",
  ]);
  const claimGeneration = requireNonnegativeSafeInteger(
    readOwn(value, "claimGeneration"),
    `${label}.claimGeneration`,
  );
  const claim = decodeClaim(readOwn(value, "claim"), claimGeneration, `${label}.claim`);
  return {
    task: decodeTask(readOwn(value, "task"), `${label}.task`),
    hostingInstance: decodePublicProcessInstanceIdentity(
      readOwn(value, "hostingInstance"),
      `${label}.hostingInstance`,
    ),
    claimGeneration,
    claim,
    claimableByCurrentActor: requireBoolean(
      readOwn(value, "claimableByCurrentActor"),
      `${label}.claimableByCurrentActor`,
    ),
  };
}

/** Decodes the complete stable-order Work snapshot. */
export function decodeWorkTaskSnapshot(value: unknown): WorkTaskSnapshot {
  requireObject(value, "Work task snapshot");
  requireExactKeys(value, "Work task snapshot", ["tasks"]);
  const tasksValue = readOwn(value, "tasks");
  if (!Array.isArray(tasksValue)) {
    throw new TypeError("Work task snapshot.tasks must be an array");
  }
  const tasks = tasksValue.map((task, index) =>
    decodePublicWorkTask(task, `Work task snapshot.tasks[${index}]`)
  );
  for (let index = 1; index < tasks.length; index += 1) {
    const previous = tasks[index - 1];
    const current = tasks[index];
    if (previous === undefined || current === undefined) {
      throw new TypeError("Work task snapshot contains an unreachable sparse position");
    }
    if (compareWorkTasks(previous, current) >= 0) {
      throw new TypeError("Work task snapshot.tasks must use canonical strict ascending order");
    }
  }
  return { tasks };
}

/** Decodes exact form state without collapsing absence, null, false, or the string "false". */
export function decodePublicTaskDetail(value: unknown): PublicTaskDetail {
  requireObject(value, "Work task detail");
  requireExactKeys(value, "Work task detail", ["form", "workTask"]);
  const workTask = decodePublicWorkTask(readOwn(value, "workTask"));
  const formValue = readOwn(value, "form");
  if (formValue === null) {
    if (workTask.task.metadata !== undefined) {
      throw new TypeError("Work task detail.form must preserve published form metadata");
    }
    return { workTask, form: null };
  }
  if (workTask.task.metadata === undefined) {
    throw new TypeError("Work task detail.form must be null without published form metadata");
  }
  requireObject(formValue, "Work task detail.form");
  requireExactKeys(formValue, "Work task detail.form", ["fields"]);
  const fields = readOwn(formValue, "fields");
  if (!Array.isArray(fields) || fields.length !== 1) {
    throw new TypeError("Work task detail.form.fields must contain exactly one field");
  }
  const field = decodePublicFormField(fields[0], "Work task detail.form.fields[0]");
  const metadataField = workTask.task.metadata.form.fields[0];
  if (field.key !== metadataField.key || field.type !== metadataField.type) {
    throw new TypeError("Work task detail field must match the published metadata field");
  }
  return { workTask, form: { fields: [field] } };
}

export function decodeWorkClaimRequest(value: unknown): WorkClaimRequest {
  requireObject(value, "Work claim request");
  requireExactKeys(value, "Work claim request", ["actionId", "expectedGeneration"]);
  return {
    actionId: requireNonemptyString(readOwn(value, "actionId"), "Work claim request.actionId"),
    expectedGeneration: requireNonnegativeSafeInteger(
      readOwn(value, "expectedGeneration"),
      "Work claim request.expectedGeneration",
    ),
  };
}

export function decodeWorkClaimResult(value: unknown): WorkClaimResult {
  requireObject(value, "Work claim result");
  requireExactKeys(value, "Work claim result", ["claim", "taskId"]);
  const claim = readOwn(value, "claim");
  requireObject(claim, "Work claim result.claim");
  requireExactKeys(claim, "Work claim result.claim", ["actorId", "generation"]);
  return {
    taskId: decodePublicWorkTaskId(readOwn(value, "taskId"), "Work claim result.taskId"),
    claim: {
      actorId: requireNonemptyString(
        readOwn(claim, "actorId"),
        "Work claim result.claim.actorId",
      ),
      generation: requirePositiveSafeInteger(
        readOwn(claim, "generation"),
        "Work claim result.claim.generation",
      ),
    },
  };
}

export function decodeWorkReleaseResult(value: unknown): WorkReleaseResult {
  requireObject(value, "Work release result");
  requireExactKeys(value, "Work release result", [
    "claimGeneration",
    "released",
    "taskId",
  ]);
  if (readOwn(value, "released") !== true) {
    throw new TypeError("Work release result.released must be true");
  }
  return {
    taskId: decodePublicWorkTaskId(readOwn(value, "taskId"), "Work release result.taskId"),
    claimGeneration: requireNonnegativeSafeInteger(
      readOwn(value, "claimGeneration"),
      "Work release result.claimGeneration",
    ),
    released: true,
  };
}

export function decodeWorkCompletionRequest(value: unknown): WorkCompletionRequest {
  requireObject(value, "Work completion request");
  requireExactKeys(value, "Work completion request", [
    "expectedClaimGeneration",
    "submittedValues",
    "taskId",
  ]);
  const submittedValues = readOwn(value, "submittedValues");
  if (!Array.isArray(submittedValues) || submittedValues.length !== 1) {
    throw new TypeError("Work completion request.submittedValues must contain exactly one value");
  }
  const submitted = submittedValues[0];
  requireObject(submitted, "Work completion request.submittedValues[0]");
  requireExactKeys(submitted, "Work completion request.submittedValues[0]", ["key", "value"]);
  const decodedValue = decodePublicFormValue(
    readOwn(submitted, "value"),
    "Work completion request.submittedValues[0].value",
  );
  if (decodedValue.kind !== "string" && decodedValue.kind !== "boolean") {
    throw new TypeError("Work completion request value must be a string or Boolean submission");
  }
  return {
    taskId: decodePublicWorkTaskId(readOwn(value, "taskId"), "Work completion request.taskId"),
    expectedClaimGeneration: requirePositiveSafeInteger(
      readOwn(value, "expectedClaimGeneration"),
      "Work completion request.expectedClaimGeneration",
    ),
    submittedValues: [{
      key: requireMetadataIdentity(
        readOwn(submitted, "key"),
        "Work completion request.submittedValues[0].key",
      ),
      value: decodedValue,
    }],
  };
}

export function decodeWorkCompletionResult(value: unknown): WorkCompletionResult {
  requireObject(value, "Work completion result");
  const state = readOwn(value, "state");
  switch (state) {
    case "committed":
    case "indeterminate":
      requireExactKeys(value, "Work completion result", ["actionId", "state", "taskId"]);
      return {
        state,
        actionId: requireNonemptyString(readOwn(value, "actionId"), "Work completion result.actionId"),
        taskId: decodePublicWorkTaskId(readOwn(value, "taskId"), "Work completion result.taskId"),
      };
    case "rejected":
      requireExactKeys(value, "Work completion result", [
        "actionId",
        "engineResult",
        "state",
        "taskId",
      ]);
      return {
        state,
        actionId: requireNonemptyString(readOwn(value, "actionId"), "Work completion result.actionId"),
        taskId: decodePublicWorkTaskId(readOwn(value, "taskId"), "Work completion result.taskId"),
        engineResult: decodeRejectedEngineResult(readOwn(value, "engineResult")),
      };
    default:
      throw new TypeError("Work completion result.state is not a public completion state");
  }
}

export function decodeWorkAuditPage(value: unknown): WorkAuditPage {
  requireObject(value, "Work audit page");
  requireExactKeys(value, "Work audit page", ["events", "nextCursor"]);
  const eventsValue = readOwn(value, "events");
  if (!Array.isArray(eventsValue)) {
    throw new TypeError("Work audit page.events must be an array");
  }
  const events = eventsValue.map((event, index) =>
    decodeWorkAuditEvent(event, `Work audit page.events[${index}]`)
  );
  if (new Set(events.map(({ eventId }) => eventId)).size !== events.length) {
    throw new TypeError("Work audit page.events must not repeat an event identity");
  }
  const nextCursor = readOwn(value, "nextCursor");
  return {
    events,
    nextCursor: nextCursor === null
      ? null
      : decodeOpaqueWorkAuditCursor(nextCursor, "Work audit page.nextCursor"),
  };
}

export function decodeWorkAuditEvent(
  value: unknown,
  label = "Work audit event",
): WorkAuditEvent {
  requireObject(value, label);
  requireExactKeys(value, label, [
    "action",
    "actorId",
    "eventId",
    "hostingProcessInstanceId",
    "recordedAt",
    "taskId",
  ]);
  return {
    eventId: requireNonemptyString(readOwn(value, "eventId"), `${label}.eventId`),
    actorId: requireNonemptyString(readOwn(value, "actorId"), `${label}.actorId`),
    recordedAt: decodeCanonicalWorkAuditTimestamp(
      readOwn(value, "recordedAt"),
      `${label}.recordedAt`,
    ),
    hostingProcessInstanceId: requireNonemptyString(
      readOwn(value, "hostingProcessInstanceId"),
      `${label}.hostingProcessInstanceId`,
    ),
    taskId: decodePublicWorkTaskId(readOwn(value, "taskId"), `${label}.taskId`),
    action: decodeWorkAuditAction(readOwn(value, "action"), `${label}.action`),
  };
}

/** Validates the public cursor syntax while leaving its exclusive position opaque. */
export function decodeOpaqueWorkAuditCursor(
  value: unknown,
  label = "Work audit cursor",
): string {
  if (typeof value !== "string" || !opaqueAuditCursor.test(value)) {
    throw new TypeError(`${label} must be a nonempty unpadded v1 base64url cursor`);
  }
  return value;
}

export function decodeCanonicalWorkAuditTimestamp(
  value: unknown,
  label = "Work audit timestamp",
): string {
  if (
    typeof value !== "string" ||
    !canonicalUtcInstant.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new TypeError(`${label} must be a canonical millisecond UTC instant`);
  }
  return value;
}

function decodeTask(value: unknown, label: string): PublicWorkTask["task"] {
  requireObject(value, label);
  const hasMetadata = Object.hasOwn(value, "metadata");
  requireExactKeys(value, label, hasMetadata
    ? ["id", "metadata", "name", "state"]
    : ["id", "name", "state"]);
  if (readOwn(value, "state") !== "active") {
    throw new TypeError(`${label}.state must be active`);
  }
  const name = readOwn(value, "name");
  return {
    id: decodePublicWorkTaskId(readOwn(value, "id"), `${label}.id`),
    name: name === null ? null : requireWireString(name, `${label}.name`, true),
    state: "active",
    ...(hasMetadata
      ? { metadata: decodeMetadata(readOwn(value, "metadata"), `${label}.metadata`) }
      : {}),
  };
}

export function decodePublicWorkTaskId(value: unknown, label: string): PublicWorkTaskId {
  requireObject(value, label);
  requireExactKeys(value, label, ["activation", "elementId", "processInstanceId"]);
  return {
    processInstanceId: requireNonemptyString(
      readOwn(value, "processInstanceId"),
      `${label}.processInstanceId`,
    ),
    elementId: requireNonemptyString(readOwn(value, "elementId"), `${label}.elementId`),
    activation: requirePositiveSafeInteger(readOwn(value, "activation"), `${label}.activation`),
  };
}

function decodeMetadata(value: unknown, label: string): PublicWorkTaskMetadata {
  requireObject(value, label);
  requireExactKeys(value, label, ["assignment", "form"]);
  const assignment = readOwn(value, "assignment");
  requireObject(assignment, `${label}.assignment`);
  requireExactKeys(assignment, `${label}.assignment`, ["candidates"]);
  const candidates = readOwn(assignment, "candidates");
  if (!Array.isArray(candidates) || candidates.length !== 1) {
    throw new TypeError(`${label}.assignment.candidates must contain exactly one group`);
  }
  const candidate = candidates[0];
  requireObject(candidate, `${label}.assignment.candidates[0]`);
  requireExactKeys(candidate, `${label}.assignment.candidates[0]`, ["id", "kind"]);
  if (readOwn(candidate, "kind") !== "group") {
    throw new TypeError(`${label}.assignment.candidates[0].kind must be group`);
  }
  const form = readOwn(value, "form");
  requireObject(form, `${label}.form`);
  requireExactKeys(form, `${label}.form`, ["fields"]);
  const fields = readOwn(form, "fields");
  if (!Array.isArray(fields) || fields.length !== 1) {
    throw new TypeError(`${label}.form.fields must contain exactly one field`);
  }
  const field = fields[0];
  requireObject(field, `${label}.form.fields[0]`);
  requireExactKeys(field, `${label}.form.fields[0]`, ["key", "type"]);
  return {
    assignment: { candidates: [{
      kind: "group",
      id: requireCandidateGroupId(
        readOwn(candidate, "id"),
        `${label}.assignment.candidates[0].id`,
      ),
    }] },
    form: { fields: [{
      key: requireMetadataIdentity(readOwn(field, "key"), `${label}.form.fields[0].key`),
      type: decodeFieldType(readOwn(field, "type"), `${label}.form.fields[0].type`),
    }] },
  };
}

function decodePublicFormField(value: unknown, label: string): PublicFormField {
  requireObject(value, label);
  requireExactKeys(value, label, ["compatibility", "currentValue", "key", "type"]);
  const key = requireMetadataIdentity(readOwn(value, "key"), `${label}.key`);
  const type = decodeFieldType(readOwn(value, "type"), `${label}.type`);
  const currentValue = decodePublicFormValue(readOwn(value, "currentValue"), `${label}.currentValue`);
  const compatibility = readOwn(value, "compatibility");
  switch (type) {
    case "string":
      if (currentValue.kind === "boolean") {
        if (compatibility !== "incompatible") {
          throw new TypeError(`${label}.compatibility must preserve the string/Boolean mismatch`);
        }
        return { key, type, currentValue, compatibility };
      }
      if (compatibility !== "compatible") {
        throw new TypeError(`${label}.compatibility must be compatible`);
      }
      return { key, type, currentValue, compatibility };
    case "boolean":
      if (currentValue.kind === "string") {
        if (compatibility !== "incompatible") {
          throw new TypeError(`${label}.compatibility must preserve the Boolean/string mismatch`);
        }
        return { key, type, currentValue, compatibility };
      }
      if (compatibility !== "compatible") {
        throw new TypeError(`${label}.compatibility must be compatible`);
      }
      return { key, type, currentValue, compatibility };
  }
}

function decodePublicFormValue(value: unknown, label: string): PublicFormValue {
  requireObject(value, label);
  const kind = readOwn(value, "kind");
  switch (kind) {
    case "absent":
    case "null":
      requireExactKeys(value, label, ["kind"]);
      return { kind };
    case "string":
      requireExactKeys(value, label, ["kind", "value"]);
      return { kind, value: requireWireString(readOwn(value, "value"), `${label}.value`, true) };
    case "boolean":
      requireExactKeys(value, label, ["kind", "value"]);
      return { kind, value: requireBoolean(readOwn(value, "value"), `${label}.value`) };
    default:
      throw new TypeError(`${label}.kind is not a public form value kind`);
  }
}

function decodeClaim(
  value: unknown,
  claimGeneration: number,
  label: string,
): PublicWorkTask["claim"] {
  if (value === null) {
    return null;
  }
  requireObject(value, label);
  requireExactKeys(value, label, ["actorId", "generation"]);
  const generation = requirePositiveSafeInteger(readOwn(value, "generation"), `${label}.generation`);
  if (generation !== claimGeneration) {
    throw new TypeError(`${label}.generation must equal claimGeneration`);
  }
  return {
    actorId: requireNonemptyString(readOwn(value, "actorId"), `${label}.actorId`),
    generation,
  };
}

function decodeRejectedEngineResult(
  value: unknown,
): Extract<WorkCompletionResult, { state: "rejected" }>["engineResult"] {
  requireObject(value, "Work completion result.engineResult");
  const kind = readOwn(value, "kind");
  switch (kind) {
    case "processClosed":
      requireExactKeys(value, "Work completion result.engineResult", ["kind"]);
      return { kind };
    case "semantic": {
      requireExactKeys(value, "Work completion result.engineResult", ["kind", "outcome"]);
      const outcome = readOwn(value, "outcome");
      switch (outcome) {
        case "rolledBack":
        case "rejected":
        case "semanticFailure":
        case "unsupported":
          return { kind, outcome };
        default:
          throw new TypeError("Work completion result.engineResult.outcome is not public");
      }
    }
    default:
      throw new TypeError("Work completion result.engineResult.kind is not public");
  }
}

function decodeWorkAuditAction(value: unknown, label: string): WorkAuditAction {
  requireObject(value, label);
  requireExactKeys(value, label, ["actionId", "kind", "outcome"]);
  const actionId = requireNonemptyString(readOwn(value, "actionId"), `${label}.actionId`);
  const kind = readOwn(value, "kind");
  const outcome = readOwn(value, "outcome");
  switch (kind) {
    case "claim":
      switch (outcome) {
        case "claimed":
        case "idempotent":
        case "conflict":
          return { kind, actionId, outcome };
        default:
          throw new TypeError(`${label}.outcome is not a claim outcome`);
      }
    case "release":
      switch (outcome) {
        case "released":
        case "idempotent":
        case "conflict":
          return { kind, actionId, outcome };
        default:
          throw new TypeError(`${label}.outcome is not a release outcome`);
      }
    case "completion":
      switch (outcome) {
        case "reserved":
        case "committed":
        case "rejected":
        case "indeterminate":
          return { kind, actionId, outcome };
        default:
          throw new TypeError(`${label}.outcome is not a completion outcome`);
      }
    default:
      throw new TypeError(`${label}.kind is not a public audit action kind`);
  }
}

function decodeFieldType(value: unknown, label: string): "string" | "boolean" {
  switch (value) {
    case "string":
    case "boolean":
      return value;
    default:
      throw new TypeError(`${label} must be string or boolean`);
  }
}

function requireCandidateGroupId(value: unknown, label: string): string {
  const id = requireMetadataIdentity(value, label);
  if (id.includes(",") || id.includes("${") || id.includes("#{")) {
    throw new TypeError(`${label} must be one literal candidate group`);
  }
  return id;
}

function requireMetadataIdentity(value: unknown, label: string): string {
  const decoded = requireWireString(value, label, false);
  const scalars = [...decoded];
  if (isBoundarySpace(scalars[0]) || isBoundarySpace(scalars[scalars.length - 1])) {
    throw new TypeError(`${label} must not have boundary space`);
  }
  return decoded;
}

function requireWireString(value: unknown, label: string, allowEmpty: boolean): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${label} must be ${allowEmpty ? "a" : "a nonempty"} string`);
  }
  if (!value.isWellFormed()) {
    throw new TypeError(`${label} must contain well-formed Unicode`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a Boolean`);
  }
  return value;
}

function compareWorkTasks(left: PublicWorkTask, right: PublicWorkTask): number {
  return compareStrings(left.hostingInstance.processInstanceId, right.hostingInstance.processInstanceId) ||
    compareStrings(left.task.id.processInstanceId, right.task.id.processInstanceId) ||
    compareStrings(left.task.id.elementId, right.task.id.elementId) ||
    left.task.id.activation - right.task.id.activation;
}

function compareStrings(left: string, right: string): number {
  const leftScalars = [...left];
  const rightScalars = [...right];
  const length = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < length; index += 1) {
    const leftCodePoint = leftScalars[index]?.codePointAt(0);
    const rightCodePoint = rightScalars[index]?.codePointAt(0);
    if (leftCodePoint !== rightCodePoint) {
      return Number(leftCodePoint) - Number(rightCodePoint);
    }
  }
  return leftScalars.length - rightScalars.length;
}

function isBoundarySpace(scalar: string | undefined): boolean {
  const codePoint = scalar?.codePointAt(0);
  switch (codePoint) {
    case 0x0009:
    case 0x000a:
    case 0x000b:
    case 0x000c:
    case 0x000d:
    case 0x0020:
    case 0x0085:
    case 0x00a0:
    case 0x1680:
    case 0x2000:
    case 0x2001:
    case 0x2002:
    case 0x2003:
    case 0x2004:
    case 0x2005:
    case 0x2006:
    case 0x2007:
    case 0x2008:
    case 0x2009:
    case 0x200a:
    case 0x2028:
    case 0x2029:
    case 0x202f:
    case 0x205f:
    case 0x3000:
    case 0xfeff:
      return true;
    default:
      return false;
  }
}
