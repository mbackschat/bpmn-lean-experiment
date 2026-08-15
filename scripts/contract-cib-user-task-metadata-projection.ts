/** Projects raw CIB Task/Form Service observations into neutral task metadata. */
import type {
  UserTaskMetadata,
} from "../packages/semantic-core/src/index.ts";
import type {
  TaskQueryTask,
} from "./contract-cib-evidence.ts";
import { requireUnicodeScalarString } from "./strict-json.ts";

export const userTaskMetadataProfileId =
  "cibseven-2.2.0-user-task-assignment-form-metadata-draft";
export const parallelUserTaskMetadataProfileId =
  "cibseven-2.2.0-parallel-user-task-assignment-form-metadata-draft";

function isUserTaskMetadataProfileId(profileId: string): boolean {
  return profileId === userTaskMetadataProfileId ||
    profileId === parallelUserTaskMetadataProfileId;
}

export function projectCibUserTaskMetadata(
  profileId: string,
  task: TaskQueryTask,
): UserTaskMetadata | undefined {
  const hasIdentityLinks = Object.hasOwn(task, "identityLinks");
  const hasFormFields = Object.hasOwn(task, "formFields");
  if (!isUserTaskMetadataProfileId(profileId)) {
    if (hasIdentityLinks || hasFormFields) {
      throw new Error("old profile must omit raw User Task metadata");
    }
    return undefined;
  }
  if (
    !hasIdentityLinks ||
    !hasFormFields ||
    task.identityLinks?.length !== 1 ||
    task.formFields?.length !== 1
  ) {
    throw new Error(
      "metadata profile requires exactly one identity link and one form field",
    );
  }
  const identityLink = task.identityLinks[0];
  if (
    identityLink === undefined ||
    identityLink.type !== "candidate" ||
    identityLink.userId !== null ||
    !isMetadataCandidateId(identityLink.groupId)
  ) {
    throw new Error("raw CIB identity link must be a candidate group");
  }
  const formField = task.formFields[0];
  if (
    formField === undefined ||
    !isMetadataIdentity(formField.id)
  ) {
    throw new Error("raw CIB form field requires one exact field identity");
  }
  switch (formField.typeName) {
    case "string":
    case "boolean":
      return {
        assignment: {
          candidates: [{ kind: "group", id: identityLink.groupId }],
        },
        form: {
          fields: [{ key: formField.id, type: formField.typeName }],
        },
      };
    default:
      throw new Error(
        `raw CIB form field has unexpected type ${formField.typeName}`,
      );
  }
}

function isMetadataCandidateId(value: unknown): value is string {
  return isMetadataIdentity(value) &&
    !value.includes(",") &&
    !value.includes("${") &&
    !value.includes("#{");
}

function isMetadataIdentity(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  try {
    requireUnicodeScalarString(value, "raw CIB User Task metadata identity");
  } catch {
    return false;
  }
  const scalars = [...value];
  return !isBoundarySpace(scalars[0]) &&
    !isBoundarySpace(scalars[scalars.length - 1]);
}

function isBoundarySpace(scalar: string | undefined): boolean {
  const codePoint = scalar?.codePointAt(0);
  return codePoint !== undefined &&
    (codePoint >= 0x0009 && codePoint <= 0x000d ||
      codePoint === 0x0020 ||
      codePoint === 0x0085 ||
      codePoint === 0x00a0 ||
      codePoint === 0x1680 ||
      codePoint >= 0x2000 && codePoint <= 0x200a ||
      codePoint === 0x2028 ||
      codePoint === 0x2029 ||
      codePoint === 0x202f ||
      codePoint === 0x205f ||
      codePoint === 0x3000 ||
      codePoint === 0xfeff);
}
