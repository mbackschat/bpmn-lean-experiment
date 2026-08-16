import { z } from "zod";

import {
  FormValidationIssueCode,
  workCompletionCanonicalJsonByteLength,
} from "@bpmn-lean/platform-contracts";
import type {
  FormValidationIssue,
  HumanTaskDefinitionV1,
  PublicFormValue,
  PublicStructuredFormFieldValueV1,
  StructuredFieldV1,
  StructuredWorkCompletionRequestV1,
} from "@bpmn-lean/platform-contracts";

export type ComputedWorkSubmittedValue = Exclude<
  PublicFormValue,
  Readonly<{ kind: "absent" }>
>;

export type ComputedWorkSubmittedBinding = Readonly<{
  key: string;
  value: ComputedWorkSubmittedValue;
}>;

export type StructuredFormComputationResult =
  | Readonly<{
      kind: "accepted";
      resolutionActionId: string;
      submittedValues: readonly ComputedWorkSubmittedBinding[];
    }>
  | Readonly<{
      kind: "formValidationFailed";
      issues: readonly [FormValidationIssue, ...FormValidationIssue[]];
    }>;

const publicValueByteLimit = 16_384;
const bindingByteLimit = 20_480;
const patchByteLimit = 65_536;
const requestCandidateByteLimit = 131_072;
const textByteLimit = 8_192;
const calendarDate = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * The sole server authority for Product 2 action selection, field validation,
 * default/current resolution, multiple-choice normalization, and patch bounds.
 */
export function computeStructuredFormCompletion(
  taskDefinition: HumanTaskDefinitionV1,
  currentFields: readonly PublicStructuredFormFieldValueV1[],
  request: StructuredWorkCompletionRequestV1,
): StructuredFormComputationResult {
  const action = taskDefinition.form.actions.find(
    ({ id }) => id === request.resolutionActionId,
  );
  if (action === undefined) {
    return rejected([issue(
      FormValidationIssueCode.UnknownResolutionAction,
      { kind: "resolutionAction" },
    )]);
  }
  const fieldsByKey = new Map(taskDefinition.form.fields.map((field) => [field.key, field]));
  const currentByKey = new Map(currentFields.map((field) => [field.key, field]));
  const issues: FormValidationIssue[] = [];
  const submittedKeys = new Set(Object.keys(request.fields));
  for (const key of [...submittedKeys].toSorted(compareScalarStrings)) {
    if (!fieldsByKey.has(key)) {
      issues.push(issue(FormValidationIssueCode.UnknownField, { kind: "field", key }));
    }
  }
  for (const field of taskDefinition.form.fields) {
    if (submittedKeys.has(field.key) && !isVisible(field, action.id)) {
      const key = field.key;
      issues.push(issue(FormValidationIssueCode.HiddenField, { kind: "field", key }));
    }
  }

  const submittedValues: ComputedWorkSubmittedBinding[] = [];
  for (const field of taskDefinition.form.fields) {
    if (!isVisible(field, action.id)) continue;
    const current = currentByKey.get(field.key);
    if (
      current === undefined ||
      current.compatibility !== "compatible" ||
      !isCurrentValueCompatible(field, current.currentValue)
    ) {
      issues.push(issue(
        FormValidationIssueCode.CurrentValueIncompatible,
        { kind: "field", key: field.key },
      ));
      continue;
    }
    const supplied = Object.hasOwn(request.fields, field.key);
    if (!supplied && field.requiredForActions.includes(action.id)) {
      issues.push(issue(
        FormValidationIssueCode.RequiredFieldMissing,
        { kind: "field", key: field.key },
      ));
      continue;
    }
    const raw = supplied
      ? request.fields[field.key]
      : effectiveExistingValue(field, current.currentValue);
    if (raw === null || raw === undefined) {
      if (field.requiredForActions.includes(action.id)) {
        issues.push(issue(
          FormValidationIssueCode.RequiredFieldNull,
          { kind: "field", key: field.key },
        ));
      } else {
        submittedValues.push({ key: field.key, value: { kind: "null" } });
      }
      continue;
    }
    const parsed = schemaFor(field).safeParse(raw);
    if (!parsed.success) {
      issues.push(issue(classifyInvalidValue(field, raw), { kind: "field", key: field.key }));
      continue;
    }
    submittedValues.push({ key: field.key, value: tagValue(field, parsed.data) });
  }
  if (issues.length > 0) return rejected(issues);

  submittedValues.push({
    key: taskDefinition.form.resolutionVariable,
    value: { kind: "string", value: action.resolutionValue },
  });
  submittedValues.sort((left, right) => compareScalarStrings(left.key, right.key));
  if (exceedsCanonicalCeiling(submittedValues, request)) {
    return rejected([issue(
      FormValidationIssueCode.ComputedPatchTooLarge,
      { kind: "form" },
    )]);
  }
  return {
    kind: "accepted",
    resolutionActionId: action.id,
    submittedValues,
  };
}

/** Projects exact engine bindings into one catalog-ordered current-value record per field. */
export function projectStructuredCurrentFieldValues(
  taskDefinition: HumanTaskDefinitionV1,
  inputVariables: readonly unknown[],
): readonly PublicStructuredFormFieldValueV1[] | null {
  const catalogKeys = new Set(taskDefinition.form.fields.map(({ key }) => key));
  const values = new Map<string, PublicFormValue>();
  try {
    for (const variable of inputVariables) {
      if (!isExactRecord(variable, ["name", "value"]) ||
          typeof variable.name !== "string" ||
          !catalogKeys.has(variable.name) ||
          values.has(variable.name)) {
        return null;
      }
      values.set(variable.name, decodeEngineValue(variable.value));
    }
  } catch {
    return null;
  }
  return taskDefinition.form.fields.map((field) => {
    const currentValue = values.get(field.key) ?? { kind: "absent" as const };
    return {
      key: field.key,
      currentValue,
      compatibility: isCurrentValueCompatible(field, currentValue)
        ? "compatible"
        : "incompatible",
    };
  });
}

export function isCurrentValueCompatible(
  field: StructuredFieldV1,
  value: PublicFormValue,
): boolean {
  if (value.kind === "absent" || value.kind === "null") return true;
  const raw = untagValue(value);
  const parsed = schemaFor(field).safeParse(raw);
  if (!parsed.success) return false;
  return field.kind !== "multipleChoice" ||
    (value.kind === "stringList" && followsOptionOrder(
      field.options.map(({ value: option }) => option),
      value.value,
    ));
}

function schemaFor(field: StructuredFieldV1): z.ZodType {
  const wireString = z.string().refine(
    (value) => value.isWellFormed() && utf8Bytes(value) <= textByteLimit,
  );
  switch (field.kind) {
    case "text":
      return wireString.refine((value) => {
        const length = [...value].length;
        return length >= field.minLength && length <= field.maxLength;
      });
    case "boolean":
      return z.boolean();
    case "integer":
      return z.number().refine((value) =>
        Number.isSafeInteger(value) && value >= field.minimum &&
        value <= field.maximum && !Object.is(value, -0)
      );
    case "date":
      return wireString.refine(isCalendarDate);
    case "singleChoice": {
      const options = new Set(field.options.map(({ value }) => value));
      return wireString.refine((value) => options.has(value));
    }
    case "multipleChoice": {
      const options = new Set(field.options.map(({ value }) => value));
      return z.array(wireString).max(field.maxItems).superRefine((values, context) => {
        if (new Set(values).size !== values.length || values.some((value) => !options.has(value))) {
          context.addIssue({ code: "custom", message: "invalid multiple-choice selection" });
        }
      });
    }
  }
}

function effectiveExistingValue(
  field: StructuredFieldV1,
  currentValue: PublicFormValue,
): unknown {
  return currentValue.kind === "absent"
    ? field.defaultValue
    : untagValue(currentValue);
}

function tagValue(field: StructuredFieldV1, value: unknown): ComputedWorkSubmittedValue {
  switch (field.kind) {
    case "text":
    case "date":
    case "singleChoice": {
      if (typeof value !== "string") throw new TypeError("validated string field changed kind");
      return { kind: "string", value };
    }
    case "boolean": {
      if (typeof value !== "boolean") throw new TypeError("validated Boolean field changed kind");
      return { kind: "boolean", value };
    }
    case "integer": {
      if (typeof value !== "number") throw new TypeError("validated integer field changed kind");
      return { kind: "integer", value };
    }
    case "multipleChoice": {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new TypeError("validated multiple-choice field changed kind");
      }
      const selected = new Set<string>(value);
      return {
        kind: "stringList",
        value: field.options.flatMap(({ value: option }) => selected.has(option) ? [option] : []),
      };
    }
  }
}

function classifyInvalidValue(
  field: StructuredFieldV1,
  value: unknown,
): FormValidationIssue["code"] {
  switch (field.kind) {
    case "text":
      if (typeof value !== "string") return FormValidationIssueCode.WrongValueKind;
      return utf8BytesSafely(value) > textByteLimit
        ? FormValidationIssueCode.ValueTooLarge
        : FormValidationIssueCode.ValueOutOfRange;
    case "boolean":
      return FormValidationIssueCode.WrongValueKind;
    case "integer":
      return typeof value === "number"
        ? FormValidationIssueCode.ValueOutOfRange
        : FormValidationIssueCode.WrongValueKind;
    case "date":
      return typeof value === "string"
        ? FormValidationIssueCode.InvalidCalendarDate
        : FormValidationIssueCode.WrongValueKind;
    case "singleChoice":
      return typeof value === "string"
        ? FormValidationIssueCode.InvalidOption
        : FormValidationIssueCode.WrongValueKind;
    case "multipleChoice":
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        return FormValidationIssueCode.WrongValueKind;
      }
      if (new Set(value).size !== value.length) {
        return FormValidationIssueCode.DuplicateSelection;
      }
      return value.length > field.maxItems
        ? FormValidationIssueCode.ValueOutOfRange
        : FormValidationIssueCode.InvalidOption;
  }
}

function exceedsCanonicalCeiling(
  submittedValues: readonly ComputedWorkSubmittedBinding[],
  request: StructuredWorkCompletionRequestV1,
): boolean {
  try {
    if (submittedValues.some(({ value }) =>
      workCompletionCanonicalJsonByteLength(value) > publicValueByteLimit
    )) return true;
    if (submittedValues.some((binding) =>
      workCompletionCanonicalJsonByteLength(binding) > bindingByteLimit
    )) return true;
    if (workCompletionCanonicalJsonByteLength(submittedValues) > patchByteLimit) return true;
    return workCompletionCanonicalJsonByteLength({
      taskId: request.taskId,
      expectedClaimGeneration: request.expectedClaimGeneration,
      submittedValues,
    }) > requestCandidateByteLimit;
  } catch {
    return true;
  }
}

function decodeEngineValue(value: unknown): PublicFormValue {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new TypeError("engine value is not tagged");
  }
  switch (value.kind) {
    case "null":
      if (!hasExactKeys(value, ["kind"])) throw new TypeError("invalid null value");
      return { kind: "null" };
    case "string":
      if (!hasExactKeys(value, ["kind", "value"]) ||
          typeof value.value !== "string" || !value.value.isWellFormed()) {
        throw new TypeError("invalid string value");
      }
      return { kind: "string", value: value.value };
    case "boolean":
      if (!hasExactKeys(value, ["kind", "value"]) || typeof value.value !== "boolean") {
        throw new TypeError("invalid Boolean value");
      }
      return { kind: "boolean", value: value.value };
    case "integer":
      if (!hasExactKeys(value, ["kind", "value"]) ||
          typeof value.value !== "number" || !Number.isSafeInteger(value.value) ||
          value.value < 0 || Object.is(value.value, -0)) {
        throw new TypeError("invalid integer value");
      }
      return { kind: "integer", value: value.value };
    case "stringList":
      if (!hasExactKeys(value, ["kind", "value"]) || !Array.isArray(value.value) ||
          value.value.length > 32 || value.value.some((item) =>
            typeof item !== "string" || !item.isWellFormed() || utf8Bytes(item) > 1_024
          )) {
        throw new TypeError("invalid string-list value");
      }
      return { kind: "stringList", value: [...value.value] };
    default:
      throw new TypeError("unsupported engine value");
  }
}

function untagValue(value: Exclude<PublicFormValue, { kind: "absent" }>): unknown {
  return value.kind === "null" ? null : value.value;
}

function isVisible(field: StructuredFieldV1, actionId: string): boolean {
  return field.visibleForActions === "all" || field.visibleForActions.includes(actionId);
}

function issue(
  code: FormValidationIssue["code"],
  target: FormValidationIssue["target"],
): FormValidationIssue {
  return { code, target };
}

function rejected(
  issues: readonly FormValidationIssue[],
): Extract<StructuredFormComputationResult, { kind: "formValidationFailed" }> {
  const [first, ...rest] = issues;
  if (first === undefined) throw new TypeError("form validation rejection requires an issue");
  return { kind: "formValidationFailed", issues: [first, ...rest] };
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

function compareScalarStrings(left: string, right: string): number {
  const a = [...left];
  const b = [...right];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = Number(a[index]?.codePointAt(0)) - Number(b[index]?.codePointAt(0));
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function utf8BytesSafely(value: string): number {
  return value.isWellFormed() ? utf8Bytes(value) : Number.POSITIVE_INFINITY;
}

function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value) && hasExactKeys(value, keys);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length &&
    [...expected].sort().every((key, index) => keys[index] === key);
}
