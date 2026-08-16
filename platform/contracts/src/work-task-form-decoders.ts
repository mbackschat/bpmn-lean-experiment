import {
  readOwn,
  requireExactKeys,
  requireNonnegativeSafeInteger,
  requireObject,
  requirePositiveSafeInteger,
} from "./decoder-primitives.js";
import { decodeHumanTaskCatalogV1 } from "./human-task-catalog-decoders.js";
import { humanTaskCatalogSchemaVersion } from "./human-task-catalog.js";
import type { StructuredFieldV1 } from "./human-task-catalog.js";
import { serializeCanonicalJsonValue } from "./canonical-json.js";
import { structuredTaskFormSchemaVersion } from "./work-form-contracts.js";
import type {
  HumanTaskCatalogBindingIdentityV1,
  PublicStructuredFormFieldValueV1,
} from "./work-form-contracts.js";
import {
  decodeFieldType,
  decodePublicWorkTask,
  requireBoolean,
  requireMetadataIdentity,
  requireWireString,
} from "./work-task-snapshot-decoders.js";
import type {
  PublicFormField,
  PublicFormValue,
  PublicTaskDetail,
} from "./work-tasks.js";

const lowercaseSha256 = /^[0-9a-f]{64}$/u;
const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/u;
const maximumStringListMembers = 32;
const maximumStringListMemberBytes = 1_024;
const maximumTaggedValueBytes = 16_384;

type TextEncoderConstructor = new () => Readonly<{
  encode(input?: string): Uint8Array;
}>;

const RuntimeTextEncoder = (
  globalThis as typeof globalThis & Readonly<{ TextEncoder: TextEncoderConstructor }>
).TextEncoder;

/** Decodes legacy or structured form state without weakening the exact M3 arm. */
export function decodePublicTaskDetail(value: unknown): PublicTaskDetail {
  requireObject(value, "Work task detail");
  requireExactKeys(value, "Work task detail", ["form", "workTask"]);
  const workTask = decodePublicWorkTask(readOwn(value, "workTask"));
  const formValue = readOwn(value, "form");
  if (formValue === null) {
    if (hasLegacyForm(workTask.task.metadata)) {
      throw new TypeError("Work task detail.form must preserve published form metadata");
    }
    return { workTask, form: null };
  }
  requireObject(formValue, "Work task detail.form");
  if (Object.hasOwn(formValue, "schemaVersion")) {
    return decodeStructuredTaskDetail(workTask, formValue);
  }
  if (!hasLegacyForm(workTask.task.metadata)) {
    throw new TypeError(workTask.task.metadata === undefined
      ? "Work task detail.form must be null without published form metadata"
      : "Legacy Work task detail.form requires published form metadata");
  }
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

/** Decodes a detached public form value, including the two M6 generic value arms. */
export function decodePublicFormValue(
  value: unknown,
  label = "public form value",
): PublicFormValue {
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
    case "integer": {
      requireExactKeys(value, label, ["kind", "value"]);
      const decoded = requireNonnegativeSafeInteger(readOwn(value, "value"), `${label}.value`);
      if (Object.is(decoded, -0)) throw new TypeError(`${label}.value must not be negative zero`);
      return { kind, value: decoded };
    }
    case "stringList": {
      requireExactKeys(value, label, ["kind", "value"]);
      const items = readOwn(value, "value");
      if (!Array.isArray(items) || items.length > maximumStringListMembers) {
        throw new TypeError(`${label}.value must contain at most 32 strings`);
      }
      const decoded = items.map((item, index) => {
        const member = requireWireString(item, `${label}.value[${index}]`, true);
        if (utf8Bytes(member) > maximumStringListMemberBytes) {
          throw new TypeError(`${label}.value[${index}] exceeds 1024 UTF-8 bytes`);
        }
        return member;
      });
      const exact = { kind, value: decoded } as const;
      if (serializeCanonicalJsonValue(exact).length > maximumTaggedValueBytes) {
        throw new TypeError(`${label} exceeds 16384 canonical UTF-8 bytes`);
      }
      return exact;
    }
    default:
      throw new TypeError(`${label}.kind is not a public form value kind`);
  }
}

function decodeStructuredTaskDetail(
  workTask: PublicTaskDetail["workTask"],
  formValue: object,
): PublicTaskDetail {
  requireExactKeys(formValue, "Work task detail.form", [
    "catalogIdentity",
    "fields",
    "schemaVersion",
    "taskDefinition",
  ]);
  if (readOwn(formValue, "schemaVersion") !== structuredTaskFormSchemaVersion) {
    throw new TypeError("Work task detail.form.schemaVersion is unsupported");
  }
  if (workTask.task.metadata === undefined || hasLegacyForm(workTask.task.metadata)) {
    throw new TypeError("Structured Work task detail requires assignment-only metadata");
  }
  const catalogIdentity = decodeCatalogIdentity(readOwn(formValue, "catalogIdentity"));
  const catalog = decodeHumanTaskCatalogV1({
    schemaVersion: humanTaskCatalogSchemaVersion,
    processId: catalogIdentity.processId,
    semanticProfile: catalogIdentity.semanticProfile,
    sourceSha256: catalogIdentity.sourceSha256,
    tasks: [readOwn(formValue, "taskDefinition")],
  });
  const taskDefinition = catalog.tasks[0]!;
  requireExactCatalogBinding(workTask, catalogIdentity, taskDefinition.elementId);
  if (workTask.catalogPresentation?.worklistPriority !== taskDefinition.worklistPriority) {
    throw new TypeError("Structured Work task presentation must match its task definition");
  }
  const fieldsValue = readOwn(formValue, "fields");
  if (!Array.isArray(fieldsValue) || fieldsValue.length !== taskDefinition.form.fields.length) {
    throw new TypeError("Structured Work task detail must contain one value per catalog field");
  }
  const fields = fieldsValue.map((fieldValue, index) =>
    decodeStructuredFieldValue(
      fieldValue,
      taskDefinition.form.fields[index]!,
      `Work task detail.form.fields[${index}]`,
    )
  );
  return {
    workTask,
    form: {
      schemaVersion: structuredTaskFormSchemaVersion,
      catalogIdentity,
      taskDefinition,
      fields,
    },
  };
}

function decodeCatalogIdentity(value: unknown): HumanTaskCatalogBindingIdentityV1 {
  requireObject(value, "Work task detail.form.catalogIdentity");
  requireExactKeys(value, "Work task detail.form.catalogIdentity", [
    "processId",
    "semanticProfile",
    "sourceSha256",
    "version",
  ]);
  const sourceSha256 = requireWireString(
    readOwn(value, "sourceSha256"),
    "Work task detail.form.catalogIdentity.sourceSha256",
    false,
  );
  if (!lowercaseSha256.test(sourceSha256)) {
    throw new TypeError("Work task detail.form.catalogIdentity.sourceSha256 must be lowercase SHA-256");
  }
  return {
    processId: requireMetadataIdentity(
      readOwn(value, "processId"),
      "Work task detail.form.catalogIdentity.processId",
    ),
    version: requirePositiveSafeInteger(
      readOwn(value, "version"),
      "Work task detail.form.catalogIdentity.version",
    ),
    sourceSha256,
    semanticProfile: requireMetadataIdentity(
      readOwn(value, "semanticProfile"),
      "Work task detail.form.catalogIdentity.semanticProfile",
    ),
  };
}

function decodeStructuredFieldValue(
  value: unknown,
  field: StructuredFieldV1,
  label: string,
): PublicStructuredFormFieldValueV1 {
  requireObject(value, label);
  requireExactKeys(value, label, ["compatibility", "currentValue", "key"]);
  const key = requireMetadataIdentity(readOwn(value, "key"), `${label}.key`);
  if (key !== field.key) throw new TypeError(`${label}.key must preserve catalog field order`);
  const currentValue = decodePublicFormValue(readOwn(value, "currentValue"), `${label}.currentValue`);
  const compatibility = isCompatible(field, currentValue) ? "compatible" : "incompatible";
  if (readOwn(value, "compatibility") !== compatibility) {
    throw new TypeError(`${label}.compatibility must preserve the catalog/value relationship`);
  }
  return { key, currentValue, compatibility };
}

function decodePublicFormField(value: unknown, label: string): PublicFormField {
  requireObject(value, label);
  requireExactKeys(value, label, ["compatibility", "currentValue", "key", "type"]);
  const key = requireMetadataIdentity(readOwn(value, "key"), `${label}.key`);
  const type = decodeFieldType(readOwn(value, "type"), `${label}.type`);
  const currentValue = decodePublicFormValue(readOwn(value, "currentValue"), `${label}.currentValue`);
  const expectedCompatibility = currentValue.kind === "absent" || currentValue.kind === "null" ||
    currentValue.kind === type ? "compatible" : "incompatible";
  if (readOwn(value, "compatibility") !== expectedCompatibility) {
    throw new TypeError(`${label}.compatibility must preserve the declared type/value relationship`);
  }
  switch (type) {
    case "string":
      switch (currentValue.kind) {
        case "absent":
        case "null":
        case "string":
          return { key, type, currentValue, compatibility: "compatible" };
        case "boolean":
        case "integer":
        case "stringList":
          return { key, type, currentValue, compatibility: "incompatible" };
      }
    case "boolean":
      switch (currentValue.kind) {
        case "absent":
        case "null":
        case "boolean":
          return { key, type, currentValue, compatibility: "compatible" };
        case "string":
        case "integer":
        case "stringList":
          return { key, type, currentValue, compatibility: "incompatible" };
      }
  }
}

function requireExactCatalogBinding(
  workTask: PublicTaskDetail["workTask"],
  identity: HumanTaskCatalogBindingIdentityV1,
  elementId: string,
): void {
  const definition = workTask.hostingInstance.definition;
  if (
    identity.processId !== definition.processId ||
    identity.version !== definition.version ||
    identity.sourceSha256 !== definition.source.sha256 ||
    identity.semanticProfile !== definition.semanticProfile ||
    elementId !== workTask.task.id.elementId
  ) {
    throw new TypeError("Structured Work task detail must preserve exact catalog binding");
  }
}

function hasLegacyForm(
  metadata: PublicTaskDetail["workTask"]["task"]["metadata"],
): metadata is Extract<NonNullable<typeof metadata>, { form: unknown }> {
  return metadata !== undefined && "form" in metadata;
}

function isCompatible(field: StructuredFieldV1, value: PublicFormValue): boolean {
  if (value.kind === "absent" || value.kind === "null") return true;
  switch (field.kind) {
    case "text":
      return value.kind === "string" && utf8Bytes(value.value) <= 8_192 &&
        scalarLength(value.value) >= field.minLength && scalarLength(value.value) <= field.maxLength;
    case "boolean":
      return value.kind === "boolean";
    case "integer":
      return value.kind === "integer" && value.value >= field.minimum && value.value <= field.maximum;
    case "date":
      return value.kind === "string" && isCalendarDate(value.value);
    case "singleChoice":
      return value.kind === "string" && field.options.some(({ value: option }) => option === value.value);
    case "multipleChoice":
      return value.kind === "stringList" && value.value.length <= field.maxItems &&
        new Set(value.value).size === value.value.length &&
        value.value.every((selected) => field.options.some(({ value: option }) => option === selected)) &&
        followsOptionOrder(field.options.map(({ value: option }) => option), value.value);
  }
}

function followsOptionOrder(options: readonly string[], selected: readonly string[]): boolean {
  const order = new Map(options.map((value, index) => [value, index]));
  return selected.every((value, index) =>
    index === 0 || (order.get(selected[index - 1]!) ?? -1) < (order.get(value) ?? -1)
  );
}

function isCalendarDate(value: string): boolean {
  const match = calendarDate.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= (days[month - 1] ?? 0);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function scalarLength(value: string): number {
  return [...value].length;
}

function utf8Bytes(value: string): number {
  return new RuntimeTextEncoder().encode(value).length;
}
