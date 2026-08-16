import { z } from "zod";

import { serializeCanonicalJsonValue } from "./canonical-json.js";
import {
  humanTaskCatalogSchemaVersion,
  ResolutionActionIntent,
  structuredFormSchemaVersion,
} from "./human-task-catalog.js";
import type {
  HumanTaskCatalogV1,
  StructuredFieldV1,
  StructuredFormDefinitionV1,
} from "./human-task-catalog.js";

export const HumanTaskCatalogMaximumCanonicalBytes = 524_288;
export const StructuredFormMaximumFields = 32;
export const StructuredFormMaximumActions = 8;
export const StructuredFormMaximumOptions = 256;

const identifierMaximumBytes = 256;
const displayTextMaximumBytes = 4_096;
const processStringMaximumBytes = 8_192;
const maximumChoiceOptions = 64;
const maximumMultipleChoiceItems = 32;
const lowercaseSha256 = /^[0-9a-f]{64}$/u;
const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/u;

type TextEncoderConstructor = new () => Readonly<{
  encode(input?: string): Uint8Array;
}>;

const RuntimeTextEncoder = (
  globalThis as typeof globalThis & Readonly<{ TextEncoder: TextEncoderConstructor }>
).TextEncoder;

const wellFormedString = z.string().refine(
  (value) => value.isWellFormed(),
  "must contain only Unicode scalar values",
);

const identifier = wellFormedString.refine(
  (value) => value.length > 0 && utf8Bytes(value) <= identifierMaximumBytes,
  `must be nonempty and at most ${identifierMaximumBytes} UTF-8 bytes`,
);

const label = wellFormedString.refine(
  (value) => value.length > 0 && utf8Bytes(value) <= displayTextMaximumBytes,
  `must be nonempty and at most ${displayTextMaximumBytes} UTF-8 bytes`,
);

const helpText = wellFormedString.refine(
  (value) => utf8Bytes(value) <= displayTextMaximumBytes,
  `must be at most ${displayTextMaximumBytes} UTF-8 bytes`,
).nullable();

const processString = wellFormedString.refine(
  (value) => utf8Bytes(value) <= processStringMaximumBytes,
  `must be at most ${processStringMaximumBytes} UTF-8 bytes`,
);

const boundedNonnegativeInteger = z.number().refine(
  (value) => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0),
  "must be a nonnegative safe integer other than negative zero",
);

const calendarDateString = processString.refine(
  isCalendarDate,
  "must be an exact YYYY-MM-DD calendar date",
);

const actionReferences = z.array(identifier);
const visibleForActions = z.union([
  z.literal("all"),
  actionReferences.min(1),
]);

const fieldBase = {
  key: identifier,
  label,
  helpText,
  visibleForActions,
  requiredForActions: actionReferences,
} as const;

const choiceOptionSchema = z.object({
  value: identifier,
  label,
}).strict();

const textFieldSchema = z.object({
  ...fieldBase,
  kind: z.literal("text"),
  defaultValue: processString.nullable(),
  multiline: z.boolean(),
  minLength: boundedNonnegativeInteger.max(processStringMaximumBytes),
  maxLength: boundedNonnegativeInteger.max(processStringMaximumBytes),
}).strict();

const booleanFieldSchema = z.object({
  ...fieldBase,
  kind: z.literal("boolean"),
  defaultValue: z.boolean().nullable(),
}).strict();

const integerFieldSchema = z.object({
  ...fieldBase,
  kind: z.literal("integer"),
  defaultValue: boundedNonnegativeInteger.nullable(),
  minimum: boundedNonnegativeInteger,
  maximum: boundedNonnegativeInteger,
}).strict();

const dateFieldSchema = z.object({
  ...fieldBase,
  kind: z.literal("date"),
  defaultValue: calendarDateString.nullable(),
}).strict();

const singleChoiceFieldSchema = z.object({
  ...fieldBase,
  kind: z.literal("singleChoice"),
  defaultValue: identifier.nullable(),
  options: z.array(choiceOptionSchema).min(1).max(maximumChoiceOptions),
}).strict();

const multipleChoiceFieldSchema = z.object({
  ...fieldBase,
  kind: z.literal("multipleChoice"),
  defaultValue: z.array(identifier).nullable(),
  options: z.array(choiceOptionSchema).min(1).max(maximumChoiceOptions),
  maxItems: boundedNonnegativeInteger.max(maximumMultipleChoiceItems),
}).strict();

const structuredFieldSchema = z.discriminatedUnion("kind", [
  textFieldSchema,
  booleanFieldSchema,
  integerFieldSchema,
  dateFieldSchema,
  singleChoiceFieldSchema,
  multipleChoiceFieldSchema,
]);

const resolutionActionSchema = z.object({
  id: identifier,
  label,
  intent: z.enum([
    ResolutionActionIntent.Primary,
    ResolutionActionIntent.Neutral,
    ResolutionActionIntent.Destructive,
  ]),
  resolutionValue: processString.refine(
    (value) => value.length > 0,
    "must not be empty",
  ),
}).strict();

const structuredFormSchema = z.object({
  schemaVersion: z.literal(structuredFormSchemaVersion),
  fields: z.array(structuredFieldSchema).min(1).max(StructuredFormMaximumFields),
  actions: z.array(resolutionActionSchema).min(2).max(StructuredFormMaximumActions),
  resolutionVariable: identifier,
}).strict().superRefine(validateStructuredForm);

const humanTaskDefinitionSchema = z.object({
  elementId: identifier,
  description: label,
  worklistPriority: boundedNonnegativeInteger.max(100),
  form: structuredFormSchema,
}).strict();

const humanTaskCatalogSchema = z.object({
  schemaVersion: z.literal(humanTaskCatalogSchemaVersion),
  processId: identifier,
  semanticProfile: identifier,
  sourceSha256: wellFormedString.regex(lowercaseSha256),
  tasks: z.array(humanTaskDefinitionSchema).min(1).max(128),
}).strict().superRefine((catalog, context) => {
  addUniquenessIssue(
    catalog.tasks.map(({ elementId }) => elementId),
    context,
    ["tasks"],
    "task element IDs",
  );
});

/** Strictly decodes, cross-validates, detaches, and freezes a structured form. */
export function decodeStructuredFormDefinitionV1(
  value: unknown,
): StructuredFormDefinitionV1 {
  return deepFreeze(structuredFormSchema.parse(value));
}

/** Strictly decodes a complete source-bound catalog and enforces its canonical byte ceiling. */
export function decodeHumanTaskCatalogV1(value: unknown): HumanTaskCatalogV1 {
  const catalog = humanTaskCatalogSchema.parse(value);
  if (serializeCanonicalJsonValue(catalog).length > HumanTaskCatalogMaximumCanonicalBytes) {
    throw new TypeError("Human Task catalog exceeds its canonical byte ceiling");
  }
  return deepFreeze(catalog);
}

function validateStructuredForm(
  form: StructuredFormDefinitionV1,
  context: z.RefinementCtx,
): void {
  const actionIds = new Set(form.actions.map(({ id }) => id));
  addUniquenessIssue(form.actions.map(({ id }) => id), context, ["actions"], "action IDs");
  addUniquenessIssue(
    form.actions.map(({ resolutionValue }) => resolutionValue),
    context,
    ["actions"],
    "action resolution values",
  );
  addUniquenessIssue(form.fields.map(({ key }) => key), context, ["fields"], "field keys");

  let optionCount = 0;
  form.fields.forEach((field, fieldIndex) => {
    if (field.key === form.resolutionVariable) {
      addIssue(context, ["fields", fieldIndex, "key"], "field key must differ from resolutionVariable");
    }
    const visible = field.visibleForActions === "all"
      ? actionIds
      : new Set(field.visibleForActions);
    if (field.visibleForActions !== "all") {
      validateActionReferences(field.visibleForActions, actionIds, context, ["fields", fieldIndex, "visibleForActions"]);
      addUniquenessIssue(field.visibleForActions, context, ["fields", fieldIndex, "visibleForActions"], "visible action references");
    }
    validateActionReferences(field.requiredForActions, actionIds, context, ["fields", fieldIndex, "requiredForActions"]);
    addUniquenessIssue(field.requiredForActions, context, ["fields", fieldIndex, "requiredForActions"], "required action references");
    if (field.requiredForActions.some((actionId) => !visible.has(actionId))) {
      addIssue(context, ["fields", fieldIndex, "requiredForActions"], "required actions must also be visible");
    }
    optionCount += validateField(field, fieldIndex, context);
  });
  if (optionCount > StructuredFormMaximumOptions) {
    addIssue(context, ["fields"], `form must contain at most ${StructuredFormMaximumOptions} total options`);
  }
}

function validateField(
  field: StructuredFieldV1,
  fieldIndex: number,
  context: z.RefinementCtx,
): number {
  switch (field.kind) {
    case "text":
      if (field.minLength > field.maxLength) {
        addIssue(context, ["fields", fieldIndex], "text minLength must not exceed maxLength");
      }
      if (field.defaultValue !== null) {
        const length = scalarLength(field.defaultValue);
        if (length < field.minLength || length > field.maxLength) {
          addIssue(context, ["fields", fieldIndex, "defaultValue"], "text default must satisfy its length bounds");
        }
      }
      return 0;
    case "boolean":
    case "date":
      return 0;
    case "integer":
      if (field.minimum > field.maximum) {
        addIssue(context, ["fields", fieldIndex], "integer minimum must not exceed maximum");
      }
      if (
        field.defaultValue !== null &&
        (field.defaultValue < field.minimum || field.defaultValue > field.maximum)
      ) {
        addIssue(context, ["fields", fieldIndex, "defaultValue"], "integer default must satisfy its bounds");
      }
      return 0;
    case "singleChoice":
      validateChoiceOptions(field.options, fieldIndex, context);
      if (
        field.defaultValue !== null &&
        !field.options.some(({ value }) => value === field.defaultValue)
      ) {
        addIssue(context, ["fields", fieldIndex, "defaultValue"], "single-choice default must name an option");
      }
      return field.options.length;
    case "multipleChoice":
      validateChoiceOptions(field.options, fieldIndex, context);
      if (field.maxItems > Math.min(field.options.length, maximumMultipleChoiceItems)) {
        addIssue(context, ["fields", fieldIndex, "maxItems"], "maxItems exceeds the option or catalog limit");
      }
      if (field.defaultValue !== null) {
        validateMultipleChoiceDefault(field, fieldIndex, context);
      }
      return field.options.length;
  }
}

function validateChoiceOptions(
  options: readonly Readonly<{ value: string }>[],
  fieldIndex: number,
  context: z.RefinementCtx,
): void {
  addUniquenessIssue(
    options.map(({ value }) => value),
    context,
    ["fields", fieldIndex, "options"],
    "option values",
  );
}

function validateMultipleChoiceDefault(
  field: Extract<StructuredFieldV1, Readonly<{ kind: "multipleChoice" }>>,
  fieldIndex: number,
  context: z.RefinementCtx,
): void {
  const selected = field.defaultValue ?? [];
  const optionOrder = new Map(field.options.map(({ value }, index) => [value, index]));
  addUniquenessIssue(selected, context, ["fields", fieldIndex, "defaultValue"], "multiple-choice default values");
  if (selected.length > field.maxItems) {
    addIssue(context, ["fields", fieldIndex, "defaultValue"], "multiple-choice default exceeds maxItems");
  }
  if (selected.some((value) => !optionOrder.has(value))) {
    addIssue(context, ["fields", fieldIndex, "defaultValue"], "multiple-choice default must contain only options");
  }
  const positions = selected.map((value) => optionOrder.get(value) ?? -1);
  if (positions.some((position, index) => index > 0 && position <= positions[index - 1]!)) {
    addIssue(context, ["fields", fieldIndex, "defaultValue"], "multiple-choice default must follow option declaration order");
  }
}

function validateActionReferences(
  references: readonly string[],
  actionIds: ReadonlySet<string>,
  context: z.RefinementCtx,
  path: PropertyKey[],
): void {
  if (references.some((reference) => !actionIds.has(reference))) {
    addIssue(context, path, "action reference must name a declared action");
  }
}

function addUniquenessIssue(
  values: readonly string[],
  context: z.RefinementCtx,
  path: PropertyKey[],
  label: string,
): void {
  if (new Set(values).size !== values.length) {
    addIssue(context, path, `${label} must be unique`);
  }
}

function addIssue(
  context: z.RefinementCtx,
  path: PropertyKey[],
  message: string,
): void {
  context.addIssue({ code: "custom", path, message });
}

function isCalendarDate(value: string): boolean {
  const match = calendarDate.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function scalarLength(value: string): number {
  return Array.from(value).length;
}

function utf8Bytes(value: string): number {
  return new RuntimeTextEncoder().encode(value).length;
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object") {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze(Reflect.get(value, key));
    }
    Object.freeze(value);
  }
  return value;
}
