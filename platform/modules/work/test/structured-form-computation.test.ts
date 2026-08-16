import assert from "node:assert/strict";
import test from "node:test";

import type {
  HumanTaskDefinitionV1,
  PublicStructuredFormFieldValueV1,
  StructuredWorkCompletionRequestV1,
} from "@bpmn-lean/platform-contracts";

import {
  computeStructuredFormCompletion,
} from "@bpmn-lean/platform-work";

const taskId = {
  processInstanceId: "expense-1",
  elementId: "ReviewExpense",
  activation: 1,
};

test("current compatible values win, defaults fill absence, and every visible field is emitted", () => {
  const task = definition([
    textField("currentText", "default text"),
    textField("defaultText", "default text"),
    booleanField("optionalBoolean", null),
    integerField("defaultInteger", 7),
    multipleChoiceField("flags", ["low"]),
  ]);
  const current = currentFields(task, {
    currentText: { kind: "string", value: "current text" },
  });
  assert.deepEqual(computeStructuredFormCompletion(
    task,
    current,
    request("approve", {}),
  ), {
    kind: "accepted",
    resolutionActionId: "approve",
    submittedValues: [{
      key: "currentText",
      value: { kind: "string", value: "current text" },
    }, {
      key: "defaultInteger",
      value: { kind: "integer", value: 7 },
    }, {
      key: "defaultText",
      value: { kind: "string", value: "default text" },
    }, {
      key: "flags",
      value: { kind: "stringList", value: ["low"] },
    }, {
      key: "optionalBoolean",
      value: { kind: "null" },
    }, {
      key: "resolution",
      value: { kind: "string", value: "approved" },
    }],
  });
});

test("orders action, unknown, hidden, and required issues without leaking values", () => {
  const task = definition([{
    ...textField("resolutionReason", null),
    visibleForActions: ["abort"],
    requiredForActions: ["abort"],
  }]);
  const current = currentFields(task, {});
  assert.deepEqual(computeStructuredFormCompletion(
    task,
    current,
    request("approve", { resolutionReason: "secret", unknown: "secret" }),
  ), {
    kind: "formValidationFailed",
    issues: [{ code: "unknownField", target: { kind: "field", key: "unknown" } }, {
      code: "hiddenField",
      target: { kind: "field", key: "resolutionReason" },
    }],
  });
  assert.deepEqual(computeStructuredFormCompletion(
    task,
    current,
    request("abort", {}),
  ), {
    kind: "formValidationFailed",
    issues: [{
      code: "requiredFieldMissing",
      target: { kind: "field", key: "resolutionReason" },
    }],
  });
  assert.deepEqual(computeStructuredFormCompletion(
    task,
    current,
    request("unknown", {}),
  ), {
    kind: "formValidationFailed",
    issues: [{
      code: "unknownResolutionAction",
      target: { kind: "resolutionAction" },
    }],
  });
});

test("required visible fields require submission even when current or default values are non-null", () => {
  const task = definition([{
    ...booleanField("confirmed", true),
    requiredForActions: ["approve"],
  }]);
  for (const currentValue of [
    { kind: "absent" } as const,
    { kind: "boolean", value: false } as const,
  ]) {
    assert.deepEqual(computeStructuredFormCompletion(
      task,
      [{ key: "confirmed", currentValue, compatibility: "compatible" }],
      request("approve", {}),
    ), {
      kind: "formValidationFailed",
      issues: [{
        code: "requiredFieldMissing",
        target: { kind: "field", key: "confirmed" },
      }],
    });
  }
});

test("validates every selected kind and canonicalizes multiple-choice permutations", () => {
  const task = definition([
    textField("text", null),
    booleanField("boolean", null),
    integerField("integer", null),
    dateField("date"),
    singleChoiceField("single"),
    multipleChoiceField("multiple", null),
  ]);
  const current = currentFields(task, {});
  const accepted = computeStructuredFormCompletion(task, current, request("approve", {
    text: "ok",
    boolean: false,
    integer: 8,
    date: "2024-02-29",
    single: "low",
    multiple: ["low", "high"],
  }));
  assert.equal(accepted.kind, "accepted");
  assert.deepEqual(
    accepted.kind === "accepted"
      ? accepted.submittedValues.find(({ key }) => key === "multiple")
      : null,
    { key: "multiple", value: { kind: "stringList", value: ["high", "low"] } },
  );

  const cases = [{ key: "text", value: 1, code: "wrongValueKind" },
    { key: "boolean", value: "false", code: "wrongValueKind" },
    { key: "integer", value: -1, code: "valueOutOfRange" },
    { key: "date", value: "2023-02-29", code: "invalidCalendarDate" },
    { key: "single", value: "unknown", code: "invalidOption" },
    { key: "multiple", value: ["high", "high"], code: "duplicateSelection" }] as const;
  for (const example of cases) {
    assert.deepEqual(
      computeStructuredFormCompletion(
        task,
        current,
        request("approve", { [example.key]: example.value }),
      ),
      {
        kind: "formValidationFailed",
        issues: [{ code: example.code, target: { kind: "field", key: example.key } }],
      },
      example.key,
    );
  }
});

test("incompatible current values reject even when the request supplies a replacement", () => {
  const task = definition([integerField("amount", null)]);
  const current: readonly PublicStructuredFormFieldValueV1[] = [{
    key: "amount",
    currentValue: { kind: "integer", value: 101 },
    compatibility: "incompatible",
  }];
  assert.deepEqual(computeStructuredFormCompletion(
    task,
    current,
    request("approve", { amount: 5 }),
  ), {
    kind: "formValidationFailed",
    issues: [{
      code: "currentValueIncompatible",
      target: { kind: "field", key: "amount" },
    }],
  });
});

test("reports every canonical value, binding, patch, and request overflow as a whole-form issue", () => {
  const task = definition([{
    ...textField("large", null),
    maxLength: 8_192,
  }]);
  const result = computeStructuredFormCompletion(
    task,
    currentFields(task, {}),
    request("approve", { large: "\n".repeat(8_192) }),
  );
  assert.deepEqual(result, {
    kind: "formValidationFailed",
    issues: [{ code: "computedPatchTooLarge", target: { kind: "form" } }],
  });
});

function definition(
  fields: HumanTaskDefinitionV1["form"]["fields"],
): HumanTaskDefinitionV1 {
  return {
    elementId: taskId.elementId,
    description: "Review the expense exception.",
    worklistPriority: 80,
    form: {
      schemaVersion: "bpmn-lean-structured-form/v1",
      fields,
      actions: [{
        id: "approve",
        label: "Approve",
        intent: "primary",
        resolutionValue: "approved",
      }, {
        id: "abort",
        label: "Abort",
        intent: "destructive",
        resolutionValue: "aborted",
      }],
      resolutionVariable: "resolution",
    },
  };
}

function textField(key: string, defaultValue: string | null) {
  return {
    key,
    label: key,
    helpText: null,
    defaultValue,
    visibleForActions: "all" as const,
    requiredForActions: [],
    kind: "text" as const,
    multiline: false,
    minLength: 0,
    maxLength: 100,
  };
}

function booleanField(key: string, defaultValue: boolean | null) {
  return {
    key,
    label: key,
    helpText: null,
    defaultValue,
    visibleForActions: "all" as const,
    requiredForActions: [],
    kind: "boolean" as const,
  };
}

function integerField(key: string, defaultValue: number | null) {
  return {
    key,
    label: key,
    helpText: null,
    defaultValue,
    visibleForActions: "all" as const,
    requiredForActions: [],
    kind: "integer" as const,
    minimum: 0,
    maximum: 100,
  };
}

function dateField(key: string) {
  return {
    key,
    label: key,
    helpText: null,
    defaultValue: null,
    visibleForActions: "all" as const,
    requiredForActions: [],
    kind: "date" as const,
  };
}

function singleChoiceField(key: string) {
  return {
    key,
    label: key,
    helpText: null,
    defaultValue: null,
    visibleForActions: "all" as const,
    requiredForActions: [],
    kind: "singleChoice" as const,
    options: [{ value: "high", label: "High" }, { value: "low", label: "Low" }],
  };
}

function multipleChoiceField(key: string, defaultValue: readonly string[] | null) {
  return {
    key,
    label: key,
    helpText: null,
    defaultValue,
    visibleForActions: "all" as const,
    requiredForActions: [],
    kind: "multipleChoice" as const,
    options: [{ value: "high", label: "High" }, { value: "low", label: "Low" }],
    maxItems: 2,
  };
}

function currentFields(
  task: HumanTaskDefinitionV1,
  current: Readonly<Record<string, Exclude<PublicStructuredFormFieldValueV1["currentValue"], { kind: "absent" }>>>,
): readonly PublicStructuredFormFieldValueV1[] {
  return task.form.fields.map(({ key }) => ({
    key,
    currentValue: current[key] ?? { kind: "absent" },
    compatibility: "compatible",
  }));
}

function request(
  resolutionActionId: string,
  fields: Readonly<Record<string, unknown>>,
): StructuredWorkCompletionRequestV1 {
  return {
    schemaVersion: "bpmn-lean-structured-work-completion/v1",
    taskId,
    expectedClaimGeneration: 1,
    resolutionActionId,
    fields,
  };
}
