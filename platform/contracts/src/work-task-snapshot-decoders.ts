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
  PublicWorkTask,
  PublicWorkTaskId,
  PublicWorkTaskMetadata,
  WorkTaskSnapshot,
} from "./work-tasks.js";

/** Decodes one exact current actor-visible task and refuses every private host field. */
export function decodePublicWorkTask(
  value: unknown,
  label = "work task",
): PublicWorkTask {
  requireObject(value, label);
  const hasPresentation = Object.hasOwn(value, "catalogPresentation");
  requireExactKeys(value, label, [
    ...(hasPresentation ? ["catalogPresentation"] : []),
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
  return {
    task: decodeTask(readOwn(value, "task"), `${label}.task`),
    hostingInstance: decodePublicProcessInstanceIdentity(
      readOwn(value, "hostingInstance"),
      `${label}.hostingInstance`,
    ),
    claimGeneration,
    claim: decodeClaim(readOwn(value, "claim"), claimGeneration, `${label}.claim`),
    claimableByCurrentActor: requireBoolean(
      readOwn(value, "claimableByCurrentActor"),
      `${label}.claimableByCurrentActor`,
    ),
    ...(hasPresentation
      ? { catalogPresentation: decodeCatalogPresentation(
          readOwn(value, "catalogPresentation"),
          `${label}.catalogPresentation`,
        ) }
      : {}),
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

export function decodePublicWorkTaskId(
  value: unknown,
  label: string,
): PublicWorkTaskId {
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

function decodeMetadata(value: unknown, label: string): PublicWorkTaskMetadata {
  requireObject(value, label);
  const hasForm = Object.hasOwn(value, "form");
  requireExactKeys(value, label, hasForm ? ["assignment", "form"] : ["assignment"]);
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
  const exactAssignment = { candidates: [{
    kind: "group" as const,
    id: requireCandidateGroupId(
      readOwn(candidate, "id"),
      `${label}.assignment.candidates[0].id`,
    ),
  }] as const };
  if (!hasForm) return { assignment: exactAssignment };
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
    assignment: exactAssignment,
    form: { fields: [{
      key: requireMetadataIdentity(readOwn(field, "key"), `${label}.form.fields[0].key`),
      type: decodeFieldType(readOwn(field, "type"), `${label}.form.fields[0].type`),
    }] },
  };
}

function decodeCatalogPresentation(
  value: unknown,
  label: string,
): NonNullable<PublicWorkTask["catalogPresentation"]> {
  requireObject(value, label);
  requireExactKeys(value, label, ["worklistPriority"]);
  const worklistPriority = requireNonnegativeSafeInteger(
    readOwn(value, "worklistPriority"),
    `${label}.worklistPriority`,
  );
  if (worklistPriority > 100) {
    throw new TypeError(`${label}.worklistPriority must be at most 100`);
  }
  return { worklistPriority };
}

function decodeClaim(
  value: unknown,
  claimGeneration: number,
  label: string,
): PublicWorkTask["claim"] {
  if (value === null) return null;
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

export function decodeFieldType(value: unknown, label: string): "string" | "boolean" {
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

export function requireMetadataIdentity(value: unknown, label: string): string {
  const decoded = requireWireString(value, label, false);
  const scalars = [...decoded];
  if (isBoundarySpace(scalars[0]) || isBoundarySpace(scalars[scalars.length - 1])) {
    throw new TypeError(`${label} must not have boundary space`);
  }
  return decoded;
}

export function requireWireString(
  value: unknown,
  label: string,
  allowEmpty: boolean,
): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${label} must be ${allowEmpty ? "a" : "a nonempty"} string`);
  }
  if (!value.isWellFormed()) {
    throw new TypeError(`${label} must contain well-formed Unicode`);
  }
  return value;
}

export function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(`${label} must be a Boolean`);
  return value;
}

function compareWorkTasks(left: PublicWorkTask, right: PublicWorkTask): number {
  return (right.catalogPresentation?.worklistPriority ?? 50) -
      (left.catalogPresentation?.worklistPriority ?? 50) ||
    compareStrings(left.hostingInstance.processInstanceId, right.hostingInstance.processInstanceId) ||
    compareStrings(left.task.id.processInstanceId, right.task.id.processInstanceId) ||
    compareStrings(left.task.id.elementId, right.task.id.elementId) ||
    left.task.id.activation - right.task.id.activation;
}

export function compareStrings(left: string, right: string): number {
  const leftScalars = [...left];
  const rightScalars = [...right];
  const length = Math.min(leftScalars.length, rightScalars.length);
  for (let index = 0; index < length; index += 1) {
    const difference = Number(leftScalars[index]?.codePointAt(0)) -
      Number(rightScalars[index]?.codePointAt(0));
    if (difference !== 0) return difference;
  }
  return leftScalars.length - rightScalars.length;
}

function isBoundarySpace(scalar: string | undefined): boolean {
  const codePoint = scalar?.codePointAt(0);
  return codePoint !== undefined && (
    (codePoint >= 0x0009 && codePoint <= 0x000d) ||
    codePoint === 0x0020 || codePoint === 0x0085 || codePoint === 0x00a0 ||
    codePoint === 0x1680 || (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 || codePoint === 0x2029 || codePoint === 0x202f ||
    codePoint === 0x205f || codePoint === 0x3000 || codePoint === 0xfeff
  );
}
