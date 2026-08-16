import {
  BooleanChoice,
  Button,
  ButtonVariant,
  MultipleChoice,
  SingleChoice,
  TextAreaField,
  TextField,
} from "@bpmn-lean/platform-ui-kit";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  FormValidationIssueCode,
} from "@bpmn-lean/platform-contracts";
import type {
  FormValidationIssue,
  PublicFormValue,
  PublicStructuredTaskFormV1,
  StructuredFieldV1,
} from "@bpmn-lean/platform-contracts";

import styles from "./work-inbox.module.css";
import type { StructuredCompletionSubmission } from "./work-completion-operation";

export type StructuredWorkFormProps = Readonly<{
  form: PublicStructuredTaskFormV1;
  isDisabled?: boolean;
  issues: readonly FormValidationIssue[];
  onSubmit: (submission: StructuredCompletionSubmission) => void;
}>;

/** Product 2 form renderer. Server validation remains authoritative. */
export function StructuredWorkForm({
  form,
  isDisabled = false,
  issues,
  onSubmit,
}: StructuredWorkFormProps) {
  const firstAction = form.taskDefinition.form.actions[0]!;
  const [selectedActionId, setSelectedActionId] = useState(firstAction.id);
  const [draft, setDraft] = useState<Readonly<Record<string, unknown>>>(() =>
    initialStructuredFormDraft(form)
  );
  const [clientIssues, setClientIssues] = useState<readonly FormValidationIssue[]>([]);
  const targetRefs = useRef(new Map<string, HTMLDivElement>());
  const actionTargetRef = useRef<HTMLDivElement>(null);
  const formTargetRef = useRef<HTMLDivElement>(null);
  const effectiveIssues = issues.length === 0 ? clientIssues : issues;
  const visibleFields = useMemo(
    () => visibleStructuredFields(form, selectedActionId),
    [form, selectedActionId],
  );

  useEffect(() => {
    const firstIssue = effectiveIssues[0];
    if (firstIssue === undefined) return;
    const target = issueTargetElement(firstIssue, targetRefs.current, actionTargetRef.current, formTargetRef.current);
    const focusTarget = target?.matches("input, textarea, button, [tabindex]")
      ? target
      : target?.querySelector<HTMLElement>("input, textarea, button, [tabindex]");
    focusTarget?.focus();
  }, [effectiveIssues]);

  const setValue = (key: string, value: unknown): void => {
    setDraft((current) => Object.freeze({ ...current, [key]: structuredClone(value) }));
    setClientIssues([]);
  };
  const submit = (resolutionActionId: string): void => {
    setSelectedActionId(resolutionActionId);
    const result = prepareStructuredFormSubmission(form, resolutionActionId, draft);
    switch (result.kind) {
      case "accepted":
        setClientIssues([]);
        onSubmit(result.submission);
        return;
      case "rejected":
        setClientIssues(result.issues);
        return;
    }
  };

  return (
    <div className={styles.structuredForm!}>
      <p className={styles.taskDescription}>{form.taskDefinition.description}</p>
      {effectiveIssues.length === 0 ? null : (
        <div ref={formTargetRef} className={styles.formIssues!} role="alert" tabIndex={-1}>
          <p>Check the highlighted form input.</p>
          <ul>
            {effectiveIssues.map((issue, index) => (
              <li key={`${issue.code}-${issueTargetKey(issue)}-${index}`}>
                {validationIssueMessage(issue.code)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className={styles.structuredFields!}>
        {visibleFields.map((field) => {
          const fieldIssues = effectiveIssues.filter((issue) =>
            issue.target.kind === "field" && issue.target.key === field.key
          );
          const errorMessage = fieldIssues[0] === undefined
            ? undefined
            : validationIssueMessage(fieldIssues[0].code);
          const required = field.requiredForActions.includes(selectedActionId);
          const value = draft[field.key];
          return (
            <div
              key={field.key}
              ref={(element) => {
                if (element === null) targetRefs.current.delete(field.key);
                else targetRefs.current.set(field.key, element);
              }}
              className={styles.structuredField!}
              data-validation-target={field.key}
            >
              <StructuredFieldControl
                field={field}
                value={value}
                isDisabled={isDisabled}
                isInvalid={fieldIssues.length > 0}
                isRequired={required}
                {...(errorMessage === undefined ? {} : { errorMessage })}
                onChange={(next) => setValue(field.key, next)}
              />
              {field.helpText === null ? null : <p className={styles.helpText!}>{field.helpText}</p>}
            </div>
          );
        })}
      </div>
      <div ref={actionTargetRef} className={styles.resolutionActions!} data-validation-target="resolutionAction">
        {form.taskDefinition.form.actions.map((action) => (
          <Button
            key={action.id}
            type="button"
            variant={buttonVariant(action.intent)}
            isDisabled={isDisabled}
            onPress={() => submit(action.id)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

type StructuredFieldControlProps = Readonly<{
  field: StructuredFieldV1;
  value: unknown;
  isDisabled: boolean;
  isInvalid: boolean;
  isRequired: boolean;
  errorMessage?: string;
  onChange: (value: unknown) => void;
}>;

function StructuredFieldControl({
  field,
  value,
  isDisabled,
  isInvalid,
  isRequired,
  errorMessage,
  onChange,
}: StructuredFieldControlProps) {
  const common = {
    isDisabled,
    isInvalid,
    isRequired,
    ...(errorMessage === undefined ? {} : { errorMessage }),
  };
  switch (field.kind) {
    case "text": {
      const Field = field.multiline ? TextAreaField : TextField;
      return (
        <Field
          {...common}
          label={field.label}
          name={field.key}
          value={typeof value === "string" ? value : ""}
          minLength={field.minLength}
          maxLength={field.maxLength}
          onChange={onChange}
        />
      );
    }
    case "boolean":
      return (
        <BooleanChoice
          {...common}
          label={field.label}
          name={field.key}
          value={typeof value === "boolean" ? value : null}
          onChange={onChange}
        />
      );
    case "integer":
      return (
        <TextField
          {...common}
          label={field.label}
          name={field.key}
          type="number"
          inputProps={{
            inputMode: "numeric",
            min: field.minimum,
            max: field.maximum,
            step: 1,
          }}
          value={typeof value === "number" || typeof value === "string" ? String(value) : ""}
          onChange={onChange}
        />
      );
    case "date":
      return (
        <TextField
          {...common}
          label={field.label}
          name={field.key}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
        />
      );
    case "singleChoice":
      return (
        <SingleChoice
          {...common}
          label={field.label}
          name={field.key}
          options={field.options}
          value={typeof value === "string" ? value : null}
          onChange={onChange}
        />
      );
    case "multipleChoice":
      return (
        <MultipleChoice
          {...common}
          label={field.label}
          name={field.key}
          options={field.options}
          value={isStringArray(value) ? value : []}
          onChange={onChange}
        />
      );
  }
}

export function initialStructuredFormDraft(
  form: PublicStructuredTaskFormV1,
): Readonly<Record<string, unknown>> {
  const draft: Record<string, unknown> = {};
  form.taskDefinition.form.fields.forEach((field, index) => {
    const current = form.fields[index]!;
    draft[field.key] = initialFieldValue(current.currentValue, field.defaultValue);
  });
  return Object.freeze(draft);
}

export function visibleStructuredFields(
  form: PublicStructuredTaskFormV1,
  resolutionActionId: string,
): PublicStructuredTaskFormV1["taskDefinition"]["form"]["fields"] {
  return form.taskDefinition.form.fields.filter((field) =>
    field.visibleForActions === "all" || field.visibleForActions.includes(resolutionActionId)
  );
}

export function prepareStructuredFormSubmission(
  form: PublicStructuredTaskFormV1,
  resolutionActionId: string,
  draft: Readonly<Record<string, unknown>>,
):
  | Readonly<{ kind: "accepted"; submission: StructuredCompletionSubmission }>
  | Readonly<{ kind: "rejected"; issues: readonly FormValidationIssue[] }> {
  if (!form.taskDefinition.form.actions.some(({ id }) => id === resolutionActionId)) {
    return rejected([issue(FormValidationIssueCode.UnknownResolutionAction, { kind: "resolutionAction" })]);
  }
  const issues: FormValidationIssue[] = [];
  const fields: Record<string, unknown> = {};
  form.taskDefinition.form.fields.forEach((field, index) => {
    const current = form.fields[index]!;
    if (current.compatibility === "incompatible") {
      issues.push(issue(FormValidationIssueCode.CurrentValueIncompatible, { kind: "field", key: field.key }));
      return;
    }
    if (!isVisible(field, resolutionActionId)) return;
    const result = normalizeDraftField(field, draft[field.key], resolutionActionId);
    switch (result.kind) {
      case "accepted":
        fields[field.key] = result.value;
        return;
      case "rejected":
        issues.push(issue(result.code, { kind: "field", key: field.key }));
        return;
    }
  });
  if (issues.length > 0) return rejected(issues);
  return Object.freeze({
    kind: "accepted" as const,
    submission: Object.freeze({
      resolutionActionId,
      fields: Object.freeze(structuredClone(fields)),
    }),
  });
}

export function structuredFormStateKey(form: PublicStructuredTaskFormV1): string {
  return JSON.stringify([
    form.catalogIdentity.processId,
    form.catalogIdentity.version,
    form.catalogIdentity.sourceSha256,
    form.catalogIdentity.semanticProfile,
    form.taskDefinition.elementId,
  ]);
}

type NormalizedField =
  | Readonly<{ kind: "accepted"; value: unknown }>
  | Readonly<{ kind: "rejected"; code: FormValidationIssueCode }>;

function normalizeDraftField(
  field: StructuredFieldV1,
  raw: unknown,
  actionId: string,
): NormalizedField {
  const required = field.requiredForActions.includes(actionId);
  if (raw === undefined) {
    return required
      ? invalidField(FormValidationIssueCode.RequiredFieldMissing)
      : acceptedField(null);
  }
  if (raw === null) {
    return required
      ? invalidField(FormValidationIssueCode.RequiredFieldNull)
      : acceptedField(null);
  }
  switch (field.kind) {
    case "text":
      if (typeof raw !== "string") return invalidField(FormValidationIssueCode.WrongValueKind);
      if (!raw.isWellFormed() || scalarLength(raw) < field.minLength || scalarLength(raw) > field.maxLength) {
        return invalidField(FormValidationIssueCode.ValueOutOfRange);
      }
      return acceptedField(raw);
    case "boolean":
      return typeof raw === "boolean"
        ? acceptedField(raw)
        : invalidField(FormValidationIssueCode.WrongValueKind);
    case "integer": {
      const value = parseNonnegativeInteger(raw);
      if (value === undefined) return invalidField(FormValidationIssueCode.WrongValueKind);
      return value < field.minimum || value > field.maximum
        ? invalidField(FormValidationIssueCode.ValueOutOfRange)
        : acceptedField(value);
    }
    case "date":
      if (typeof raw !== "string") return invalidField(FormValidationIssueCode.WrongValueKind);
      return isCalendarDate(raw)
        ? acceptedField(raw)
        : invalidField(FormValidationIssueCode.InvalidCalendarDate);
    case "singleChoice":
      if (typeof raw !== "string") return invalidField(FormValidationIssueCode.WrongValueKind);
      return field.options.some(({ value }) => value === raw)
        ? acceptedField(raw)
        : invalidField(FormValidationIssueCode.InvalidOption);
    case "multipleChoice": {
      if (!isStringArray(raw)) return invalidField(FormValidationIssueCode.WrongValueKind);
      if (new Set(raw).size !== raw.length) {
        return invalidField(FormValidationIssueCode.DuplicateSelection);
      }
      if (raw.length > field.maxItems || raw.some((value) => !field.options.some((option) => option.value === value))) {
        return invalidField(FormValidationIssueCode.InvalidOption);
      }
      const selected = new Set(raw);
      return acceptedField(field.options.map(({ value }) => value).filter((value) => selected.has(value)));
    }
  }
}

function initialFieldValue(
  current: PublicFormValue,
  defaultValue: StructuredFieldV1["defaultValue"],
): unknown {
  switch (current.kind) {
    case "absent":
      return structuredClone(defaultValue);
    case "null":
      return null;
    case "string":
    case "boolean":
    case "integer":
      return current.value;
    case "stringList":
      return [...current.value];
  }
}

function isVisible(field: StructuredFieldV1, actionId: string): boolean {
  return field.visibleForActions === "all" || field.visibleForActions.includes(actionId);
}

function issue(
  code: FormValidationIssueCode,
  target: FormValidationIssue["target"],
): FormValidationIssue {
  return Object.freeze({ code, target: Object.freeze(target) });
}

function rejected(
  issues: readonly FormValidationIssue[],
): Readonly<{ kind: "rejected"; issues: readonly FormValidationIssue[] }> {
  return Object.freeze({ kind: "rejected", issues: Object.freeze([...issues]) });
}

function acceptedField(value: unknown): NormalizedField {
  return Object.freeze({ kind: "accepted", value: structuredClone(value) });
}

function invalidField(code: FormValidationIssueCode): NormalizedField {
  return Object.freeze({ kind: "rejected", code });
}

function parseNonnegativeInteger(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0) ? value : undefined;
  }
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const days = [31, leapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= (days[month - 1] ?? 0);
}

function leapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function scalarLength(value: string): number {
  return [...value].length;
}

function buttonVariant(intent: "primary" | "neutral" | "destructive"): ButtonVariant {
  switch (intent) {
    case "primary":
      return ButtonVariant.Primary;
    case "neutral":
      return ButtonVariant.Secondary;
    case "destructive":
      return ButtonVariant.Danger;
  }
}

function issueTargetElement(
  issue: FormValidationIssue,
  fieldTargets: ReadonlyMap<string, HTMLDivElement>,
  actionTarget: HTMLDivElement | null,
  formTarget: HTMLDivElement | null,
): HTMLDivElement | null {
  switch (issue.target.kind) {
    case "field":
      return fieldTargets.get(issue.target.key) ?? formTarget;
    case "resolutionAction":
      return actionTarget ?? formTarget;
    case "form":
      return formTarget;
  }
}

function issueTargetKey(issue: FormValidationIssue): string {
  switch (issue.target.kind) {
    case "field":
      return issue.target.key;
    case "resolutionAction":
      return "resolutionAction";
    case "form":
      return "form";
  }
}

function validationIssueMessage(code: FormValidationIssueCode): string {
  switch (code) {
    case FormValidationIssueCode.UnknownResolutionAction:
      return "Choose an available resolution action.";
    case FormValidationIssueCode.UnknownField:
      return "The form contains an unknown field.";
    case FormValidationIssueCode.HiddenField:
      return "A hidden field must not be submitted.";
    case FormValidationIssueCode.RequiredFieldMissing:
      return "Enter a value for this required field.";
    case FormValidationIssueCode.RequiredFieldNull:
      return "Choose a value for this required field.";
    case FormValidationIssueCode.CurrentValueIncompatible:
      return "The current Process value is incompatible with this field.";
    case FormValidationIssueCode.WrongValueKind:
      return "Enter a value of the required type.";
    case FormValidationIssueCode.ValueOutOfRange:
      return "Enter a value within the allowed range.";
    case FormValidationIssueCode.InvalidCalendarDate:
      return "Enter a valid calendar date.";
    case FormValidationIssueCode.InvalidOption:
      return "Choose only an available option.";
    case FormValidationIssueCode.DuplicateSelection:
      return "Choose each option at most once.";
    case FormValidationIssueCode.ValueTooLarge:
      return "The submitted value is too large.";
    case FormValidationIssueCode.ComputedPatchTooLarge:
      return "The complete form result is too large.";
  }
}
