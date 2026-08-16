import type { DeepReadonly } from "./deep-readonly.js";
import { isWellFormedWireString } from "./wire.js";

export type UserTaskAssignment = DeepReadonly<{
  candidates: [{ kind: "group"; id: string }];
}>;

/** Assignment-only metadata is wire-distinct from the legacy form-bearing arm. */
export type UserTaskAssignmentOnlyMetadata = DeepReadonly<{
  assignment: UserTaskAssignment;
  form?: never;
}>;

/** Legacy passive assignment and form facts retained byte-for-byte for existing profiles. */
export type UserTaskAssignmentFormMetadata = DeepReadonly<{
  assignment: UserTaskAssignment;
  form: {
    fields: [{ key: string; type: "string" | "boolean" }];
  };
}>;

/** Closed metadata union. Assignment-only is selected only by the M6 profile. */
export type UserTaskMetadata =
  | UserTaskAssignmentOnlyMetadata
  | UserTaskAssignmentFormMetadata;

/** Checks the profile's exact nonempty scalar and boundary-space identity contract. */
export function isUserTaskMetadataIdentity(value: unknown): value is string {
  if (!isWellFormedWireString(value) || value.length === 0) {
    return false;
  }
  const scalars = [...value];
  return !isBoundarySpace(scalars[0]) &&
    !isBoundarySpace(scalars[scalars.length - 1]);
}

/** Checks the selected literal group restriction in addition to the shared identity boundary. */
export function isUserTaskMetadataCandidateId(
  value: unknown,
): value is string {
  return isUserTaskMetadataIdentity(value) &&
    !value.includes(",") &&
    !value.includes("${") &&
    !value.includes("#{");
}

/** Checks one complete neutral metadata block from the closed union. */
export function isUserTaskMetadata(value: unknown): value is UserTaskMetadata {
  return isAssignmentOnlyUserTaskMetadata(value) ||
    isAssignmentFormUserTaskMetadata(value);
}

export function isAssignmentOnlyUserTaskMetadata(
  value: unknown,
): value is UserTaskAssignmentOnlyMetadata {
  return isRecord(value) &&
    hasOnlyKeys(value, ["assignment"]) &&
    isUserTaskAssignment(value.assignment);
}

export function isAssignmentFormUserTaskMetadata(
  value: unknown,
): value is UserTaskAssignmentFormMetadata {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["assignment", "form"]) ||
    !isUserTaskAssignment(value.assignment) ||
    !isRecord(value.form) ||
    !hasOnlyKeys(value.form, ["fields"]) ||
    !Array.isArray(value.form.fields) ||
    value.form.fields.length !== 1 ||
    !isRecord(value.form.fields[0]) ||
    !hasOnlyKeys(value.form.fields[0], ["key", "type"]) ||
    !isUserTaskMetadataIdentity(value.form.fields[0].key)
  ) {
    return false;
  }
  switch (value.form.fields[0].type) {
    case "string":
    case "boolean":
      return true;
    default:
      return false;
  }
}

function isUserTaskAssignment(value: unknown): boolean {
  return isRecord(value) &&
    hasOnlyKeys(value, ["candidates"]) &&
    Array.isArray(value.candidates) &&
    value.candidates.length === 1 &&
    isRecord(value.candidates[0]) &&
    hasOnlyKeys(value.candidates[0], ["kind", "id"]) &&
    value.candidates[0].kind === "group" &&
    isUserTaskMetadataCandidateId(value.candidates[0].id);
}

/** Distinguishes physical omission from an explicit invalid null or undefined property. */
export function hasExactOptionalUserTaskMetadata(
  value: Readonly<Record<string, unknown>>,
): boolean {
  return !Object.hasOwn(value, "metadata") ||
    isUserTaskMetadata(value.metadata);
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

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  keys: ReadonlyArray<string>,
): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length &&
    actual.every((key) => keys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
